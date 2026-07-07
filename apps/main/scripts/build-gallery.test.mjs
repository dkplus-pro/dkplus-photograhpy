import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGalleryData } from "./build-gallery.mjs";

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
  assert.equal("createdAt" in gallery.photos[0], false);
  assert.equal("updatedAt" in gallery.photos[0], false);
  assert.equal("image" in gallery.photos[0], false);
  assert.equal("createdAt" in gallery.topics[0], false);
  assert.equal("updatedAt" in gallery.topics[0], false);
  assert.equal("cdnBaseUrl" in gallery, false);
  assert.equal("sourceGeneratedAt" in gallery, false);
});
