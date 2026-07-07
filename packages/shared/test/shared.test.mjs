import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMonthKey,
  groupPhotosByMonth,
  resolveCdnUrl,
  resolvePhotoAssetUrls,
  validateGalleryData,
} from "../dist/index.js";

const gallery = {
  topics: [
    { id: "city", title: "城市", coverPhotoId: "night-001", sortOrder: 1 },
    { id: "portrait", title: "人像", sortOrder: 2 },
  ],
  photos: [
    {
      id: "night-001",
      title: "夜色",
      topicIds: ["city"],
      takenAt: "2026-07-06T20:00:00Z",
      asset: {
        original: "photos/night 001.jpg",
        thumbnail: "thumbs/night 001.jpg",
      },
      exif: {
        cameraBrand: "Sony",
        cameraModel: "A7",
        iso: 400,
        aperture: 2.8,
        shutterSpeed: "1/125",
      },
    },
    {
      id: "portrait-001",
      title: "窗边",
      topicIds: ["portrait"],
      takenAt: "2026-06-15",
      asset: { original: "photos/portrait.jpg" },
    },
  ],
};

test("validates gallery data and cross references", () => {
  const result = validateGalleryData(gallery);

  assert.equal(result.ok, true);
  assert.equal(result.data.photos.length, 2);
  assert.equal(result.data.topics[0].coverPhotoId, "night-001");
});

test("reports unknown topic references", () => {
  const result = validateGalleryData({
    topics: [{ id: "known", title: "Known" }],
    photos: [{ ...gallery.photos[0], topicIds: ["missing"] }],
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((entry) => entry.code === "unknown_topic"),
    true,
  );
});

test("groups photos by newest month", () => {
  const result = validateGalleryData(gallery);
  assert.equal(result.ok, true);

  const groups = groupPhotosByMonth(result.data.photos, "en-US");

  assert.deepEqual(
    groups.map((group) => group.month),
    ["2026-07", "2026-06"],
  );
  assert.equal(groups[0].photos[0].id, "night-001");
  assert.equal(formatMonthKey("2026-07-06T20:00:00Z"), "2026-07");
});

test("resolves relative asset keys against CDN config", () => {
  assert.equal(
    resolveCdnUrl("photos/night 001.jpg", {
      baseUrl: "https://cdn.example.com/",
      assetPrefix: "/gallery/",
      searchParams: { v: "20260707" },
    }),
    "https://cdn.example.com/gallery/photos/night%20001.jpg?v=20260707",
  );

  const result = validateGalleryData(gallery);
  assert.equal(result.ok, true);

  const resolved = resolvePhotoAssetUrls(result.data.photos[0], {
    baseUrl: "https://cdn.example.com",
  });
  assert.equal(
    resolved.urls.thumbnail,
    "https://cdn.example.com/thumbs/night%20001.jpg",
  );
  assert.equal(
    resolved.urls.preview,
    "https://cdn.example.com/thumbs/night%20001.jpg",
  );
});
