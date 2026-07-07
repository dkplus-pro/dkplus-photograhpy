import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGalleryData } from './build-gallery.mjs';

const forbiddenClientKeys = [
  'createdAt',
  'updatedAt',
  'image',
  'imageUrl',
  'thumbnailUrl',
  'topicId',
  'topicTitle',
  'tags'
];

const assertNoForbiddenKeys = (value, path = '$') => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const key of forbiddenClientKeys) {
    assert.ok(!(key in value), `${path} must not expose ${key}`);
  }
  for (const [key, entry] of Object.entries(value)) {
    assertNoForbiddenKeys(entry, `${path}.${key}`);
  }
};

test('normalizes gallery records and writes resolved CDN urls', () => {
  const gallery = normalizeGalleryData({
    topics: [
      {
        id: 'topic',
        title: 'Topic',
        createdAt: '2026-06-30T00:00:00Z',
        updatedAt: '2026-06-30T00:00:00Z'
      }
    ],
    photos: [
      {
        id: 'p1',
        title: 'Photo',
        topicIds: ['topic'],
        takenAt: '2026-07-01T00:00:00Z',
        createdAt: '2026-06-30T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
        image: { url: 'internal-image-record.jpg', storage: 'remote' },
        asset: { original: 'photo-demo?auto=format' }
      }
    ]
  });

  assert.equal(gallery.photos.length, 1);
  assert.match(gallery.photos[0].urls.original, /^https:\/\/images\.unsplash\.com\/photo-demo/);
  assert.equal('createdAt' in gallery.photos[0], false);
  assert.equal('updatedAt' in gallery.photos[0], false);
  assert.equal('image' in gallery.photos[0], false);
  assert.equal('createdAt' in gallery.topics[0], false);
  assert.equal('updatedAt' in gallery.topics[0], false);
  assert.equal('cdnBaseUrl' in gallery, false);
  assert.equal('sourceGeneratedAt' in gallery, false);
});

test('exports only the minimal client gallery JSON contract', () => {
  const gallery = normalizeGalleryData({
    generatedAt: '2026-07-06T00:00:00Z',
    updatedAt: '2026-07-06T01:00:00Z',
    topics: [
      {
        id: 'topic',
        title: 'Topic',
        description: 'Visible topic copy',
        slug: 'topic',
        coverPhotoId: 'p1',
        sortOrder: 1,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z'
      }
    ],
    photos: [
      {
        id: 'p1',
        title: 'Photo',
        description: 'Visible description',
        topicId: 'topic',
        topicTitle: 'Topic',
        topicIds: ['topic'],
        takenAt: '2026-07-01T00:00:00Z',
        location: 'Shanghai',
        tags: ['internal-search-only'],
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-03T00:00:00Z',
        imageUrl: 'raw-image-url.jpg',
        thumbnailUrl: 'raw-thumb-url.jpg',
        image: {
          url: 'raw-image-url.jpg',
          key: 'uploads/raw-image-url.jpg',
          storage: 'local'
        },
        asset: {
          original: 'client-original.jpg',
          thumbnail: 'client-thumb.jpg',
          preview: 'client-preview.jpg',
          alt: 'Client alt',
          width: 1600,
          height: 1200
        },
        exif: {
          cameraBrand: 'Sony',
          cameraModel: 'A7R V',
          lensModel: 'FE 35mm F1.4 GM'
        }
      }
    ]
  });

  assert.deepEqual(Object.keys(gallery).sort(), ['generatedAt', 'photos', 'topics']);
  assert.deepEqual(Object.keys(gallery.topics[0]).sort(), [
    'coverPhotoId',
    'description',
    'id',
    'slug',
    'sortOrder',
    'title'
  ]);
  assert.deepEqual(Object.keys(gallery.photos[0]).sort(), [
    'asset',
    'description',
    'exif',
    'id',
    'location',
    'takenAt',
    'title',
    'topicIds',
    'urls'
  ]);
  assert.equal(gallery.photos[0].asset.original, 'client-original.jpg');
  assert.match(gallery.photos[0].urls.thumbnail, /^https:\/\/images\.unsplash\.com\/client-thumb\.jpg/);
  assertNoForbiddenKeys(gallery);
});
