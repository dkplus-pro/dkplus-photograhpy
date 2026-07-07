import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGalleryData } from './build-gallery.mjs';

test('normalizes gallery records and writes resolved CDN urls', () => {
  const gallery = normalizeGalleryData({
    topics: [{ id: 'topic', title: 'Topic' }],
    photos: [
      {
        id: 'p1',
        title: 'Photo',
        topicIds: ['topic'],
        takenAt: '2026-07-01T00:00:00Z',
        asset: { original: 'photo-demo?auto=format' }
      }
    ]
  });

  assert.equal(gallery.photos.length, 1);
  assert.match(gallery.photos[0].urls.original, /^https:\/\/images\.unsplash\.com\/photo-demo/);
});
