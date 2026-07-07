import type { ExifData, GalleryPayload, PhotoAsset, ResolvedPhoto, Topic } from "./types";

const fallbackCdnBaseUrl = "https://images.unsplash.com";
const isAbsoluteUrl = (value: string): boolean =>
  /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

export const resolveDisplayAssetUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw) || raw.startsWith("/")) return raw;
  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  return `${fallbackCdnBaseUrl}/${trimSlashes(pathname)}${query}${hash}`;
};

const withResolvedUrls = (photo: ResolvedPhoto): ResolvedPhoto => ({
  ...photo,
  urls: photo.urls ?? {
    original: resolveDisplayAssetUrl(photo.asset.original),
    thumbnail: resolveDisplayAssetUrl(photo.asset.thumbnail ?? photo.asset.original),
    preview: resolveDisplayAssetUrl(
      photo.asset.preview ?? photo.asset.thumbnail ?? photo.asset.original,
    ),
  },
});

const fallbackCdnBaseUrl = "https://images.unsplash.com";
const isAbsoluteUrl = (value: string): boolean =>
  /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

export const resolveDisplayAssetUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw) || raw.startsWith("/")) return raw;
  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  return `${fallbackCdnBaseUrl}/${trimSlashes(pathname)}${query}${hash}`;
};

const withResolvedUrls = (photo: ResolvedPhoto): ResolvedPhoto => ({
  ...photo,
  urls: photo.urls ?? {
    original: resolveDisplayAssetUrl(photo.asset.original),
    thumbnail: resolveDisplayAssetUrl(photo.asset.thumbnail ?? photo.asset.original),
    preview: resolveDisplayAssetUrl(
      photo.asset.preview ?? photo.asset.thumbnail ?? photo.asset.original,
    ),
  },
});

export const tabLabels = {
  latest: "最新",
  topics: "专题",
  timeline: "时间轴",
} as const;

export const formatMonthKey = (value: string): string => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const formatMonthLabel = (month: string): string => {
  const [year = 1970, monthValue = 1] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthValue - 1, 1)));
};

export const compareNewest = (
  left: ResolvedPhoto,
  right: ResolvedPhoto,
): number =>
  new Date(right.takenAt).getTime() - new Date(left.takenAt).getTime();

export const groupByMonth = (photos: ResolvedPhoto[]) => {
  const groups = new Map<string, ResolvedPhoto[]>();
  [...photos].sort(compareNewest).forEach((photo) => {
    const key = formatMonthKey(photo.takenAt);
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  });
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, items]) => ({
      month,
      label: formatMonthLabel(month),
      photos: items,
    }));
};

export const topicCover = (
  topic: Topic,
  photos: ResolvedPhoto[],
): ResolvedPhoto | undefined =>
  photos.find((photo) => photo.id === topic.coverPhotoId) ??
  photos.find((photo) => photo.topicIds.includes(topic.id));

export const normalizePayload = (payload: GalleryPayload): GalleryPayload => ({
  ...payload,
  topics: [...payload.topics].sort(
    (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999),
  ),
  photos: [...payload.photos].map(withResolvedUrls).sort(compareNewest),
});
