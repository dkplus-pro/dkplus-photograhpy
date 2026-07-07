import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGalleryData } from './build-gallery.mjs';

test('normalizes gallery records and writes resolved CDN urls', () => {
  const gallery = normalizeGalleryData({
    updatedAt: '2026-07-03T00:00:00Z',
    topics: [
      {
        id: 'topic',
        title: 'Topic',
        slug: 'topic',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z'
      }
    ],
    photos: [
      {
        id: 'p1',
        title: 'Photo',
        topicIds: ['topic'],
        takenAt: '2026-07-01T00:00:00Z',
        tags: ['internal-search-only'],
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z',
        image: { url: 'raw-admin-image.jpg' },
        asset: { original: 'photo-demo?auto=format' }
      }
    ]
  });

  assert.equal(gallery.photos.length, 1);
  assert.match(gallery.photos[0].urls.original, /^https:\/\/images\.unsplash\.com\/photo-demo/);
  assert.deepEqual(Object.keys(gallery.topics[0]).sort(), ['id', 'title']);
  assert.equal('updatedAt' in gallery, false);
  assert.equal('createdAt' in gallery.photos[0], false);
  assert.equal('updatedAt' in gallery.photos[0], false);
  assert.equal('image' in gallery.photos[0], false);
  assert.equal('tags' in gallery.photos[0], false);
});
