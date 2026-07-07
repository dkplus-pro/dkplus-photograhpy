import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import request, { type Test } from "supertest";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config.js";

type ExifRecord = Record<string, unknown>;

type PhotoBody = {
  id: string;
  title: string;
  exif?: ExifRecord;
};

async function makeConfig(): Promise<{ config: ServerConfig; root: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "dkplus-exif-contract-"));
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

function authed(testRequest: Test): Test {
  return testRequest.set("Authorization", "Bearer test-token");
}

type ClientExportArtifact = {
  photos: Array<PhotoBody & { image?: unknown; imageUrl?: unknown }>;
};

async function readClientExport(
  filePath: string,
): Promise<ClientExportArtifact> {
  return JSON.parse(await readFile(filePath, "utf8")) as ClientExportArtifact;
}

function expectAdminExifPersisted(
  exif: ExifRecord | undefined,
  expected: {
    cameraBrand: string;
    cameraModel: string;
    lens: string;
    shutterSpeed: string;
  },
): void {
  assert.ok(exif, "photo exposes persisted EXIF metadata");
  assert.equal(exif.cameraBrand, expected.cameraBrand);
  assert.equal(exif.cameraModel, expected.cameraModel);
  assert.equal(exif.lens ?? exif.lensModel, expected.lens);
  assert.equal(exif.shutterSpeed ?? exif.shutter, expected.shutterSpeed);
}

test("multipart Admin EXIF persists through upload, replacement, auto-export, and explicit export", async () => {
  const { config, root } = await makeConfig();
  try {
    const app = createApp(config).callback();
    const uploadExif = {
      cameraMake: "Nikon",
      cameraModel: "Z8",
      lens: "NIKKOR Z 24-70mm f/2.8 S",
      shutter: "1/200s",
      iso: 64,
      capturedAt: "2026-06-03T12:30:00.000Z",
    };

    const uploaded = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("title", "Admin EXIF upload")
      .field("exif", JSON.stringify(uploadExif))
      .attach("files", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "admin-exif.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    const created = uploaded.body.photos[0] as PhotoBody;
    assert.equal(uploaded.body.export.photoCount, 1);
    expectAdminExifPersisted(created.exif, {
      cameraBrand: "Nikon",
      cameraModel: "Z8",
      lens: "NIKKOR Z 24-70mm f/2.8 S",
      shutterSpeed: "1/200s",
    });

    const listedAfterCreate = await authed(
      request(app).get("/api/photos"),
    ).expect(200);
    const listedCreated = (listedAfterCreate.body.photos as PhotoBody[]).find(
      (photo) => photo.id === created.id,
    );
    expectAdminExifPersisted(listedCreated?.exif, {
      cameraBrand: "Nikon",
      cameraModel: "Z8",
      lens: "NIKKOR Z 24-70mm f/2.8 S",
      shutterSpeed: "1/200s",
    });

    const exportedAfterCreate = await readClientExport(config.exportFile);
    const exportedCreate = exportedAfterCreate.photos.find(
      (photo) => photo.id === created.id,
    );
    assert.ok(exportedCreate, "auto-export includes uploaded photo");
    expectAdminExifPersisted(exportedCreate.exif, {
      cameraBrand: "Nikon",
      cameraModel: "Z8",
      lens: "NIKKOR Z 24-70mm f/2.8 S",
      shutterSpeed: "1/200s",
    });

    const replacementExif = {
      cameraMake: "Sony",
      cameraModel: "A7R V",
      lens: "FE 35mm F1.4 GM",
      shutter: "1/500s",
      iso: 100,
      capturedAt: "2026-06-04T08:15:00.000Z",
    };

    const replaced = await request(app)
      .post("/api/uploads")
      .set("Authorization", "Bearer test-token")
      .field("photoId", created.id)
      .field("title", "Admin EXIF replacement")
      .field("exif", JSON.stringify(replacementExif))
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "admin-exif-replacement.jpg",
        contentType: "image/jpeg",
      })
      .expect(200);

    const replacement = replaced.body.photo as PhotoBody;
    assert.equal(replaced.body.export.photoCount, 1);
    assert.equal(replacement.id, created.id);
    expectAdminExifPersisted(replacement.exif, {
      cameraBrand: "Sony",
      cameraModel: "A7R V",
      lens: "FE 35mm F1.4 GM",
      shutterSpeed: "1/500s",
    });

    const listedAfterReplace = await authed(
      request(app).get("/api/photos"),
    ).expect(200);
    const listedReplacement = (
      listedAfterReplace.body.photos as PhotoBody[]
    ).find((photo) => photo.id === created.id);
    expectAdminExifPersisted(listedReplacement?.exif, {
      cameraBrand: "Sony",
      cameraModel: "A7R V",
      lens: "FE 35mm F1.4 GM",
      shutterSpeed: "1/500s",
    });

    const autoExported = await readClientExport(config.exportFile);
    const autoExportedPhoto = autoExported.photos.find(
      (photo) => photo.id === created.id,
    );
    assert.ok(autoExportedPhoto, "replacement auto-export includes photo");
    expectAdminExifPersisted(autoExportedPhoto.exif, {
      cameraBrand: "Sony",
      cameraModel: "A7R V",
      lens: "FE 35mm F1.4 GM",
      shutterSpeed: "1/500s",
    });

    await authed(request(app).post("/api/export/client")).send({}).expect(200);
    const exported = await readClientExport(config.exportFile);
    const exportedPhoto = exported.photos.find(
      (photo) => photo.id === created.id,
    );
    assert.ok(exportedPhoto, "explicit export includes uploaded photo");
    expectAdminExifPersisted(exportedPhoto.exif, {
      cameraBrand: "Sony",
      cameraModel: "A7R V",
      lens: "FE 35mm F1.4 GM",
      shutterSpeed: "1/500s",
    });
    assert.equal("image" in exportedPhoto, false);
    assert.equal("imageUrl" in exportedPhoto, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
