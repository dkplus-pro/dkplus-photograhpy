import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const sourcePath = process.env.GALLERY_SOURCE_JSON
  ? path.resolve(repoRoot, process.env.GALLERY_SOURCE_JSON)
  : path.join(repoRoot, 'data/photos.json');
const outputPath = path.join(appRoot, 'public/data/gallery.json');
const cdnBaseUrl = (process.env.GALLERY_CDN_BASE_URL ?? process.env.VITE_CDN_BASE_URL ?? 'https://images.unsplash.com').replace(/\/+$/, '');
const assetPrefix = (process.env.GALLERY_ASSET_PREFIX ?? '').replace(/^\/+|\/+$/g, '');

const isAbsolute = (value) => /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
const trim = (value) => String(value ?? '').replace(/^\/+|\/+$/g, '');
const joinPath = (...parts) => parts.map(trim).filter(Boolean).join('/');

export function resolveAssetUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Asset path cannot be empty');
  if (isAbsolute(raw)) return raw;
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  return `${cdnBaseUrl}/${joinPath(assetPrefix, pathname)}${query}${hash}`;
}

const assertArray = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const definedEntries = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

export function normalizeGalleryData(input) {
  const topics = assertArray(input.topics ?? [], 'topics').map(normalizeTopic);
  const topicIds = new Set(topics.map((topic) => topic.id));
  const photos = assertArray(input.photos, 'photos').map((photo, index) => {
    const asset = normalizeAsset(photo);
    if (!photo.id || !photo.title || !asset?.original) {
      throw new Error(`photos[${index}] requires id, title and asset.original/image.url`);
    }
    const topicIds = Array.isArray(photo.topicIds)
      ? photo.topicIds
      : photo.topicId
        ? [photo.topicId]
        : [];
    const takenAt = photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt ?? new Date().toISOString();
    const publicPhoto = definedEntries({
      id: photo.id,
      title: photo.title,
      description: photo.description,
      topicIds,
      takenAt,
      location: photo.location,
      asset,
      exif: photo.exif,
      urls: {
        original: resolveAssetUrl(asset.original),
        thumbnail: resolveAssetUrl(asset.thumbnail ?? asset.original),
        preview: resolveAssetUrl(asset.preview ?? asset.thumbnail ?? asset.original)
      }
    });
    return publicPhoto;
  });

  const topics = assertArray(input.topics ?? [], 'topics').map((topic) =>
    definedEntries({
      id: topic.id,
      title: topic.title,
      description: topic.description,
      coverPhotoId: topic.coverPhotoId,
      sortOrder: topic.sortOrder
    })
  );
  const topicIds = new Set(topics.map((topic) => topic.id));
  for (const photo of photos) {
    for (const topicId of photo.topicIds) {
      if (!topicIds.has(topicId)) throw new Error(`Photo ${photo.id} references unknown topic ${topicId}`);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    topics,
    photos: photos.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime())
  };
}

const raw = JSON.parse(await readFile(sourcePath, 'utf8'));
const gallery = normalizeGalleryData(raw);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(gallery, null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(repoRoot, outputPath)} from ${path.relative(repoRoot, sourcePath)} (${gallery.photos.length} photos)`);
