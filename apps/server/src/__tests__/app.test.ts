import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import request, { type Test } from "supertest";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config.js";

async function makeConfig(): Promise<{ config: ServerConfig; root: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "dkplus-server-"));
  return {
    root,
    config: {
      env: "test",
      host: "127.0.0.1",
      port: 0,
      adminToken: "test-token",
      corsOrigins: ["http://localhost:5174"],
      dataFile: path.join(root, "photos.json"),
      exportFile: path.join(root, "client", "photos.json"),
      uploadDir: path.join(root, "uploads"),
      publicBaseUrl: "http://cdn.test/uploads",
      cos: { enabled: false, prefix: "photos" },
    },
  };
}

test("health is public and admin API requires bearer token", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const health = await request(app).get("/health").expect(200);
    assert.equal(health.body.ok, true);

    await request(app).get("/api/photos").expect(401);
    await request(app)
      .get("/api/photos")
      .set("Authorization", "Bearer test-token")
      .expect(200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function authed(testRequest: Test): Test {
  return testRequest.set("Authorization", "Bearer test-token");
}

test("photo CRUD and batch delete persist JSON records", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();

    const created = await authed(request(app).post("/api/photos"))
      .send({
        title: "Street frame",
        description: "Night walk",
        topicId: "street",
        tags: ["night", "city"],
        takenAt: "2026-07-01T10:00:00.000Z",
        image: { url: "https://cdn.example/street.jpg", storage: "remote" },
        exif: { cameraBrand: "Leica", cameraModel: "Q3", iso: 800 },
      })
      .expect(201);

    const id = created.body.photo.id;
    assert.equal(created.body.photo.title, "Street frame");

    const updated = await authed(request(app).patch(`/api/photos/${id}`))
      .send({ title: "Street frame edited" })
      .expect(200);
    assert.equal(updated.body.photo.title, "Street frame edited");
    assert.equal(
      updated.body.photo.image.url,
      "https://cdn.example/street.jpg",
    );

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);

    const deleted = await authed(request(app).post("/api/photos/batch-delete"))
      .send({ ids: [id, "missing"] })
      .expect(200);
    assert.equal(deleted.body.deleted.length, 1);
    assert.deepEqual(deleted.body.missing, ["missing"]);

    const stored = JSON.parse(await readFile(config.dataFile, "utf8")) as {
      photos: unknown[];
    };
    assert.equal(stored.photos.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authenticated export writes the client JSON artifact on demand", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();

    await authed(request(app).post("/api/photos"))
      .send({
        title: "Exported frame",
        image: { url: "https://cdn.example/exported.jpg", storage: "remote" },
      })
      .expect(201);

    await assert.rejects(readFile(config.exportFile, "utf8"), {
      code: "ENOENT",
    });

    const response = await authed(request(app).post("/api/gallery/export"))
      .expect(200);

    assert.equal(response.body.export.photos, 1);
    assert.equal(response.body.export.topics, 0);
    assert.match(response.body.export.exportedAt, /^\d{4}-\d{2}-\d{2}T/);

    const exported = JSON.parse(await readFile(config.exportFile, "utf8")) as {
      photos: Array<{ title: string }>;
      topics: unknown[];
    };
    assert.equal(exported.photos.length, 1);
    assert.equal(exported.photos[0].title, "Exported frame");
    assert.deepEqual(exported.topics, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("multipart upload stores local file, extracts safe EXIF fallback, and creates photo", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const response = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("title", "Uploaded frame")
      .field("description", "Local upload")
      .attach("files", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "frame.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    assert.equal(response.body.photos.length, 1);
    assert.equal(response.body.photos[0].title, "Uploaded frame");
    assert.equal(response.body.photos[0].image.storage, "local");
    assert.match(
      response.body.photos[0].image.url,
      /^http:\/\/cdn\.test\/uploads\//,
    );

    const stored = JSON.parse(await readFile(config.dataFile, "utf8")) as {
      photos: Array<{ image: { key: string } }>;
    };
    assert.equal(stored.photos.length, 1);
    assert.ok(stored.photos[0].image.key.endsWith("frame.jpg"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart upload can replace an existing photo image", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const created = await authed(request(app).post("/api/photos"))
      .send({
        title: "Original frame",
        description: "Before replacement",
        topicId: "street",
        image: { url: "https://cdn.example/original.jpg", storage: "remote" },
      })
      .expect(201);

    const id = created.body.photo.id as string;
    const response = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("photoId", id)
      .field("title", "Replaced frame")
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "replacement.jpg",
        contentType: "image/jpeg",
      })
      .expect(200);

    assert.equal(response.body.photo.id, id);
    assert.equal(response.body.photo.title, "Replaced frame");
    assert.equal(response.body.photo.image.storage, "local");
    assert.ok(response.body.photo.image.key.endsWith("replacement.jpg"));

    const stored = JSON.parse(await readFile(config.dataFile, "utf8")) as {
      photos: Array<{ image: { key: string } }>;
    };
    assert.equal(stored.photos.length, 1);
    assert.ok(stored.photos[0].image.key.endsWith("replacement.jpg"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local upload files are served from /uploads without admin auth", async () => {
  const { config, root } = await makeConfig();
  config.publicBaseUrl = undefined;
  try {
    const app = createApp(config).callback();
    const uploaded = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("title", "Local static frame")
      .attach("files", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "local-frame.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    const uploadUrl = uploaded.body.photos[0].image.url as string;
    assert.match(uploadUrl, /^\/uploads\//);

    const staticResponse = await request(app).get(uploadUrl).expect(200);
    assert.match(staticResponse.headers["content-type"], /^image\/jpeg/);
    assert.deepEqual(
      staticResponse.body,
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
