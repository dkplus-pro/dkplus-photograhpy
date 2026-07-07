import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
      databaseFile: path.join(root, "gallery.sqlite"),
      exportFile: path.join(root, "photos.json"),
      uploadDir: path.join(root, "uploads"),
      publicBaseUrl: "http://cdn.test/uploads",
      cos: { enabled: false, prefix: "photos" },
    },
  };
}

async function assertExportFileMissing(filePath: string): Promise<void> {
  await assert.rejects(readFile(filePath, "utf8"), {
    code: "ENOENT",
  });
}

function assertClientExportShape(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /"(createdAt|updatedAt|image|imageUrl|thumbnailUrl)"\s*:/,
  );
}

test("health is public and admin API requires bearer token", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const health = await request(app).get("/health").expect(200);
    assert.equal(health.body.ok, true);

    const gallery = await request(app).get("/api/gallery").expect(200);
    assert.deepEqual(gallery.body.photos, []);
    assert.deepEqual(gallery.body.topics, []);

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

test("development gallery endpoint is public but production keeps it behind auth", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const gallery = await request(app).get("/api/gallery").expect(200);
    assert.deepEqual(Object.keys(gallery.body).sort(), [
      "generatedAt",
      "photos",
      "topics",
    ]);

    const productionApp = createApp({
      ...config,
      env: "production",
      databaseFile: path.join(root, "production.sqlite"),
    }).callback();
    await request(productionApp).get("/api/gallery").expect(401);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("photo CRUD and batch delete persist in SQLite without mutating JSON export", async () => {
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

    const database = await stat(config.databaseFile);
    assert.ok(database.size > 0);
    await assertExportFileMissing(config.exportFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("existing JSON seeds an empty database and is rewritten only by explicit export", async () => {
  const { config, root } = await makeConfig();
  const seedJson = `${JSON.stringify(
    {
      generatedAt: "2026-07-01T00:00:00.000Z",
      topics: [
        {
          id: "seed-topic",
          title: "种子专题",
          description: "来自静态 JSON 的种子数据",
          slug: "seed-topic",
          sortOrder: 1,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
      ],
      photos: [
        {
          id: "seed-photo",
          title: "种子照片",
          description: "用于初始化 SQLite",
          topicIds: ["seed-topic"],
          takenAt: "2026-07-01T08:00:00.000Z",
          tags: ["seed-tag"],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
          image: { url: "seed/raw-admin-image.jpg" },
          asset: {
            original: "seed/original.jpg",
            thumbnail: "seed/thumb.jpg",
            preview: "seed/preview.jpg",
            alt: "种子照片",
          },
        },
      ],
    },
    null,
    2,
  )}\n`;
  try {
    await writeFile(config.exportFile, seedJson, "utf8");
    const app = createApp(config).callback();

    const seeded = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(seeded.body.photos.length, 1);
    assert.equal(seeded.body.photos[0].id, "seed-photo");
    assert.equal(seeded.body.photos[0].topicId, "seed-topic");
    assert.equal(seeded.body.photos[0].image.url, "seed/original.jpg");

    await authed(request(app).post("/api/photos"))
      .send({
        title: "SQLite only",
        topicId: "seed-topic",
        image: { url: "sqlite-only.jpg", storage: "remote" },
      })
      .expect(201);

    assert.equal(await readFile(config.exportFile, "utf8"), seedJson);

    const exported = await authed(request(app).post("/api/export/client"))
      .send({})
      .expect(200);
    assert.equal(exported.body.export.photoCount, 2);
    assert.equal(exported.body.export.topicCount, 1);

    const artifact = JSON.parse(await readFile(config.exportFile, "utf8")) as {
      generatedAt: string;
      topics: Array<Record<string, unknown>>;
      photos: Array<
        Record<string, unknown> & {
        id: string;
        topicIds: string[];
        asset: { original: string };
        }
      >;
    };
    assertClientExportShape(artifact);
    assert.ok(artifact.generatedAt);
    assert.equal("updatedAt" in artifact, false);
    assert.equal(artifact.topics.length, 1);
    assert.equal("createdAt" in artifact.topics[0], false);
    assert.equal("updatedAt" in artifact.topics[0], false);
    assert.equal("slug" in artifact.topics[0], false);
    assert.deepEqual(
      artifact.photos.find((photo) => photo.id === "seed-photo")?.topicIds,
      ["seed-topic"],
    );
    assert.equal(
      artifact.photos.find((photo) => photo.id === "seed-photo")?.asset
        .original,
      "seed/original.jpg",
    );
    const seedExport = artifact.photos.find(
      (photo) => photo.id === "seed-photo",
    );
    assert.ok(seedExport);
    assert.equal("createdAt" in seedExport, false);
    assert.equal("updatedAt" in seedExport, false);
    assert.equal("image" in seedExport, false);
    assert.equal("tags" in seedExport, false);
    assert.ok(artifact.photos.some((photo) => photo.id !== "seed-photo"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart upload stores local file, extracts safe EXIF fallback, and creates SQLite photo", async () => {
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

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);
    assert.ok(listed.body.photos[0].image.key.endsWith("frame.jpg"));
    await assertExportFileMissing(config.exportFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart upload can replace an existing SQLite photo image", async () => {
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

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);
    assert.ok(listed.body.photos[0].image.key.endsWith("replacement.jpg"));
    await assertExportFileMissing(config.exportFile);
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
