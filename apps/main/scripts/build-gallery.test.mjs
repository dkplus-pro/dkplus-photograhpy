import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeGalleryData } from "./build-gallery.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceGallery = JSON.parse(
  readFileSync(path.join(dirname, "../../../data/photos.json"), "utf8"),
);

const forbiddenKeys = new Set([
  "updatedAt",
  "createdAt",
  "image",
  "imageUrl",
  "thumbnailUrl",
  "tags",
  "cdnBaseUrl",
  "sourceGeneratedAt",
]);

const assertNoForbiddenKeys = (value) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `Forbidden JSON key: ${key}`);
    assertNoForbiddenKeys(entry);
  }
};

const assertSingleAssetUrl = (photo) => {
  assert.equal(typeof photo.asset?.original, "string");
  assert.equal("thumbnail" in photo.asset, false);
  assert.equal("preview" in photo.asset, false);
};

const assertDerivedUrlBases = (photo) => {
  assert.equal(photo.urls.thumbnail, photo.urls.original);
  assert.equal(photo.urls.preview, photo.urls.original);
};

test("normalizes gallery records and writes resolved CDN urls", () => {
  const gallery = normalizeGalleryData({
    topics: [
      {
        id: "topic",
        title: "Topic",
        createdAt: "2026-06-30T00:00:00Z",
        updatedAt: "2026-06-30T00:00:00Z",
      },
    ],
    photos: [
      {
        id: "p1",
        title: "Photo",
        topicIds: ["topic"],
        takenAt: "2026-07-01T00:00:00Z",
        createdAt: "2026-06-30T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z",
        image: { url: "internal-image-record.jpg", storage: "remote" },
        asset: { original: "photo-demo?auto=format" },
      },
    ],
  });

  assert.equal(gallery.photos.length, 1);
  assert.match(
    gallery.photos[0].urls.original,
    /^https:\/\/images\.unsplash\.com\/photo-demo/,
  );
  assertSingleAssetUrl(gallery.photos[0]);
  assertDerivedUrlBases(gallery.photos[0]);
  assert.doesNotMatch(JSON.stringify(gallery), /imageMogr2/);
  assert.deepEqual(Object.keys(gallery).sort(), [
    "generatedAt",
    "photos",
    "topics",
  ]);
  assert.deepEqual(Object.keys(gallery.topics[0]).sort(), ["id", "title"]);
  assertNoForbiddenKeys(gallery);
});

test("exports only the minimal client gallery JSON contract", () => {
  const gallery = normalizeGalleryData({
    generatedAt: "2026-07-06T00:00:00Z",
    updatedAt: "2026-07-06T01:00:00Z",
    topics: [
      {
        id: "topic",
        title: "Topic",
        description: "Visible topic copy",
        slug: "topic",
        coverPhotoId: "p1",
        sortOrder: 1,
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z",
      },
    ],
    photos: [
      {
        id: "p1",
        title: "Photo",
        description: "Visible description",
        topicId: "topic",
        topicTitle: "Topic",
        topicIds: ["topic"],
        takenAt: "2026-07-01T00:00:00Z",
        location: "Shanghai",
        tags: ["internal-search-only"],
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-03T00:00:00Z",
        imageUrl: "raw-image-url.jpg",
        thumbnailUrl: "raw-thumb-url.jpg",
        image: {
          url: "raw-image-url.jpg",
          key: "uploads/raw-image-url.jpg",
          storage: "local",
        },
        asset: {
          original: "client-original.jpg",
          thumbnail: "client-thumb.jpg",
          preview: "client-preview.jpg",
          alt: "Client alt",
          width: 1600,
          height: 1200,
        },
        exif: {
          cameraBrand: "Sony",
          cameraModel: "A7R V",
          lensModel: "FE 35mm F1.4 GM",
        },
      },
    ],
  });

  assert.deepEqual(Object.keys(gallery).sort(), [
    "generatedAt",
    "photos",
    "topics",
  ]);
  assert.deepEqual(Object.keys(gallery.topics[0]).sort(), [
    "coverPhotoId",
    "description",
    "id",
    "slug",
    "sortOrder",
    "title",
  ]);
  assert.deepEqual(Object.keys(gallery.photos[0]).sort(), [
    "asset",
    "description",
    "exif",
    "id",
    "location",
    "takenAt",
    "title",
    "topicIds",
    "urls",
  ]);
  assert.deepEqual(Object.keys(gallery.photos[0].asset).sort(), [
    "alt",
    "height",
    "original",
    "width",
  ]);
  assert.equal(gallery.photos[0].asset.original, "client-original.jpg");
  assert.match(
    gallery.photos[0].urls.thumbnail,
    /^https:\/\/images\.unsplash\.com\/client-original\.jpg/,
  );
  assertDerivedUrlBases(gallery.photos[0]);
  assert.doesNotMatch(JSON.stringify(gallery), /client-(thumb|preview)\.jpg/);
  assert.doesNotMatch(JSON.stringify(gallery), /imageMogr2/);
  assertNoForbiddenKeys(gallery);
});

test("source gallery preserves b176cc1 Xinjiang records and exports a single asset url", () => {
  assert.equal(sourceGallery.topics.length, 5);
  assert.equal(sourceGallery.photos.length, 20);
  assert.equal(
    sourceGallery.topics.find((topic) => topic.id === "新疆2025")?.title,
    "新疆2025",
  );

  const xinjiangPhotos = sourceGallery.photos.filter((photo) =>
    photo.topicIds?.includes("新疆2025"),
  );
  assert.equal(xinjiangPhotos.length, 15);
  assert.deepEqual(
    xinjiangPhotos.map((photo) => photo.id),
    [
      "bd623c99-8f07-4abf-9bb4-58adb316a5cd",
      "aa95acdf-1ae8-4bca-9dd7-87ac192f0a7d",
      "2e1d3cae-e53d-4b06-82a7-dde0a06fa933",
      "0d718d6b-2ef5-4a4d-b5b0-617bb7a6f18e",
      "d9bb85d4-10ae-40ab-a7c7-9070bdef3dd4",
      "73fb9fd9-6ce9-489d-a89c-bd34601653f7",
      "0fefdbdb-24e0-4106-8724-5f415435e0d9",
      "ecf5149c-b920-4888-a30e-8885313dfbd0",
      "9db66670-acf5-44ce-ba9a-d71f61650618",
      "9dddf02f-a000-47bc-87fa-f779e83ed51a",
      "e71ae0f8-ed99-4b72-9220-a1df1ede7fd5",
      "7897d5e7-15a3-4dc3-b9c5-0e515a4afa11",
      "43836df5-d8a5-4d86-98e8-cafbe22120bd",
      "5f33cc0a-e834-4fc5-91c2-9771ffdda30b",
      "9146a7e4-2f4a-4572-bd98-38ac765815c7",
    ],
  );

  for (const photo of normalizeGalleryData(sourceGallery).photos) {
    assertSingleAssetUrl(photo);
  }
});
