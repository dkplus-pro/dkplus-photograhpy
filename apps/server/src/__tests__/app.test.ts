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

const forbiddenClientKeys = [
  "createdAt",
  "updatedAt",
  "image",
  "imageUrl",
  "thumbnailUrl",
  "topicId",
  "topicTitle",
  "tags",
];

function assertNoClientInternals(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoClientInternals(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of forbiddenClientKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(record, key),
      false,
      `${path} exposes ${key}`,
    );
  }
  for (const [key, entry] of Object.entries(record)) {
    assertNoClientInternals(entry, `${path}.${key}`);
  }
}

type ClientExportArtifact = {
  generatedAt: string;
  topics: Array<Record<string, unknown>>;
  photos: Array<
    Record<string, unknown> & {
      id: string;
      title?: string;
      topicIds?: string[];
      asset?: { original?: string };
      exif?: Record<string, unknown>;
    }
  >;
};

async function readClientExport(
  filePath: string,
): Promise<ClientExportArtifact> {
  return JSON.parse(await readFile(filePath, "utf8")) as ClientExportArtifact;
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

test("topic CRUD persists in SQLite and explicit export includes current topics", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();

    const created = await authed(request(app).post("/api/topics"))
      .send({
        id: "editorial",
        title: "编辑精选",
        description: "首页专题",
      })
      .expect(201);
    assert.equal(created.body.topic.id, "editorial");
    assert.equal(created.body.topic.title, "编辑精选");
    assert.equal(created.body.topic.description, "首页专题");

    const listed = await authed(request(app).get("/api/topics")).expect(200);
    assert.equal(listed.body.topics.length, 1);
    assert.equal(listed.body.topics[0].id, "editorial");
    await assertExportFileMissing(config.exportFile);

    const updated = await authed(request(app).patch("/api/topics/editorial"))
      .send({ title: "编辑精选更新", description: "" })
      .expect(200);
    assert.equal(updated.body.topic.title, "编辑精选更新");
    assert.equal("description" in updated.body.topic, false);

    const photo = await authed(request(app).post("/api/photos"))
      .send({
        title: "Topic-linked frame",
        topicId: "editorial",
        image: {
          url: "https://cdn.example/topic-linked.jpg",
          storage: "remote",
        },
      })
      .expect(201);

    await authed(request(app).delete("/api/topics/editorial")).expect(409);

    const exported = await authed(request(app).post("/api/export/client"))
      .send({})
      .expect(200);
    assert.equal(exported.body.export.topicCount, 1);
    const artifact = await readClientExport(config.exportFile);
    assert.deepEqual(artifact.topics[0], {
      id: "editorial",
      title: "编辑精选更新",
      slug: "编辑精选",
    });

    await authed(request(app).delete(`/api/photos/${photo.body.photo.id}`))
      .send({})
      .expect(200);
    const deleted = await authed(request(app).delete("/api/topics/editorial"))
      .send({})
      .expect(200);
    assert.equal(deleted.body.deleted.id, "editorial");
    const emptyTopics = await authed(request(app).get("/api/topics")).expect(
      200,
    );
    assert.deepEqual(emptyTopics.body.topics, []);
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
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ],
      photos: [
        {
          id: "seed-photo",
          title: "种子照片",
          description: "用于初始化 SQLite",
          topicId: "seed-topic",
          topicTitle: "种子专题",
          topicIds: ["seed-topic"],
          tags: ["seed-only"],
          takenAt: "2026-07-01T08:00:00.000Z",
          createdAt: "2026-07-01T08:00:00.000Z",
          updatedAt: "2026-07-02T08:00:00.000Z",
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

    const devGallery = await request(app).get("/api/gallery").expect(200);
    assert.deepEqual(Object.keys(devGallery.body).sort(), [
      "generatedAt",
      "photos",
      "topics",
    ]);
    assert.equal(devGallery.body.photos.length, 2);
    assertNoClientInternals(devGallery.body);

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
    assert.deepEqual(Object.keys(artifact).sort(), [
      "generatedAt",
      "photos",
      "topics",
    ]);
    assert.ok(artifact.generatedAt);
    assert.deepEqual(Object.keys(artifact).sort(), [
      "generatedAt",
      "photos",
      "topics",
    ]);
    assert.equal(artifact.topics.length, 1);
    assert.equal("createdAt" in artifact.topics[0], false);
    assert.equal("updatedAt" in artifact.topics[0], false);
    assert.deepEqual(
      artifact.photos.find((photo) => photo.id === "seed-photo")?.topicIds,
      ["seed-topic"],
    );
    const seedPhoto = artifact.photos.find(
      (photo) => photo.id === "seed-photo",
    );
    assert.equal(seedPhoto?.asset.original, "seed/original.jpg");
    assert.equal("createdAt" in (seedPhoto ?? {}), false);
    assert.equal("updatedAt" in (seedPhoto ?? {}), false);
    assert.equal("image" in (seedPhoto ?? {}), false);
    assert.deepEqual(Object.keys(seedPhoto ?? {}).sort(), [
      "asset",
      "description",
      "id",
      "takenAt",
      "title",
      "topicIds",
    ]);
    assert.ok(artifact.photos.some((photo) => photo.id !== "seed-photo"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart upload stores local file, creates SQLite photo, and auto-exports client JSON", async () => {
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
    assert.equal(response.body.export.photoCount, 1);
    assert.equal(response.body.export.topicCount, 0);
    assert.equal(response.body.photos[0].title, "Uploaded frame");
    assert.equal(response.body.photos[0].image.storage, "local");
    assert.match(
      response.body.photos[0].image.url,
      /^http:\/\/cdn\.test\/uploads\//,
    );

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);
    assert.ok(listed.body.photos[0].image.key.endsWith("frame.jpg"));

    const exported = await readClientExport(config.exportFile);
    assert.equal(exported.photos.length, 1);
    assert.equal(exported.photos[0]?.id, response.body.photos[0].id);
    assert.equal(exported.photos[0]?.title, "Uploaded frame");
    assert.equal(
      exported.photos[0]?.asset?.original,
      response.body.photos[0].image.url,
    );
    assert.deepEqual(exported.photos[0]?.topicIds, []);
    assertNoClientInternals(exported);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("multipart upload persists Admin EXIF JSON for create and replacement", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const createdAt = "2024-05-01T12:00:00.000Z";
    const created = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("title", "EXIF upload")
      .field(
        "exif",
        JSON.stringify({
          cameraMake: "Nikon",
          cameraModel: "Z 8",
          lens: "NIKKOR Z 50mm f/1.8 S",
          iso: "640",
          aperture: "f/2",
          shutter: "1/500s",
          focalLength: "50mm",
          capturedAt: createdAt,
          unsafe: "ignored",
        }),
      )
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "exif-create.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    const id = created.body.photos[0].id as string;
    assert.equal(created.body.export.photoCount, 1);
    assert.deepEqual(created.body.photos[0].exif, {
      cameraBrand: "Nikon",
      cameraModel: "Z 8",
      lens: "NIKKOR Z 50mm f/1.8 S",
      iso: 640,
      aperture: "f/2",
      shutterSpeed: "1/500s",
      focalLength: "50mm",
      capturedAt: createdAt,
    });
    assert.equal(created.body.photos[0].takenAt, createdAt);

    const persistedCreate = await authed(
      request(app).get(`/api/photos/${id}`),
    ).expect(200);
    assert.deepEqual(
      persistedCreate.body.photo.exif,
      created.body.photos[0].exif,
    );

    const replacedAt = "2025-06-02T10:30:00.000Z";
    const replaced = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("photoId", id)
      .field("title", "EXIF replacement")
      .field(
        "exif",
        JSON.stringify({
          cameraBrand: "Canon",
          cameraModel: "R5",
          lensModel: "RF 24-70mm F2.8 L IS USM",
          shutterSpeed: "1/250s",
          focalLengthMm: 70,
          width: "4000",
          height: 3000,
          capturedAt: replacedAt,
        }),
      )
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "exif-replacement.jpg",
        contentType: "image/jpeg",
      })
      .expect(200);

    assert.equal(replaced.body.photo.id, id);
    assert.equal(replaced.body.photo.title, "EXIF replacement");
    assert.deepEqual(replaced.body.photo.exif, {
      cameraBrand: "Canon",
      cameraModel: "R5",
      lens: "RF 24-70mm F2.8 L IS USM",
      shutterSpeed: "1/250s",
      focalLength: "70mm",
      width: 4000,
      height: 3000,
      capturedAt: replacedAt,
    });
    assert.equal(replaced.body.photo.takenAt, replacedAt);

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);
    assert.deepEqual(listed.body.photos[0].exif, replaced.body.photo.exif);

    assert.equal(replaced.body.export.photoCount, 1);
    const exported = await readClientExport(config.exportFile);
    const exportedPhoto = exported.photos.find((photo) => photo.id === id);
    assert.ok(exportedPhoto, "auto-export includes replaced EXIF upload");
    assert.equal(exportedPhoto.title, "EXIF replacement");
    assert.deepEqual(exportedPhoto.exif, replaced.body.photo.exif);
    assertNoClientInternals(exported);
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
        exif: { cameraBrand: "Leica", cameraModel: "Q3" },
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
    assert.equal(response.body.export.photoCount, 1);
    assert.equal(response.body.photo.title, "Replaced frame");
    assert.equal(response.body.photo.image.storage, "local");
    assert.ok(response.body.photo.image.key.endsWith("replacement.jpg"));
    assert.deepEqual(response.body.photo.exif, {
      cameraBrand: "Leica",
      cameraModel: "Q3",
    });

    const listed = await authed(request(app).get("/api/photos")).expect(200);
    assert.equal(listed.body.photos.length, 1);
    assert.ok(listed.body.photos[0].image.key.endsWith("replacement.jpg"));
    assert.deepEqual(listed.body.photos[0].exif, response.body.photo.exif);

    const exported = await readClientExport(config.exportFile);
    const exportedPhoto = exported.photos.find((photo) => photo.id === id);
    assert.ok(exportedPhoto, "auto-export includes replaced image");
    assert.equal(exportedPhoto.title, "Replaced frame");
    assert.equal(exportedPhoto.asset?.original, response.body.photo.image.url);
    assertNoClientInternals(exported);
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
