import type {
  ExifData,
  GalleryPayload,
  PhotoAsset,
  ResolvedPhoto,
  Topic,
} from "./types";

const fallbackCdnBaseUrl = "https://images.unsplash.com";
const thumbnailDisplayQuery = "imageMogr2/thumbnail/800x";
const isAbsoluteUrl = (value: string): boolean =>
  /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");
const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const hasSkippedListThumbnailProtocol = (value: string): boolean =>
  /^(?:data|blob):/i.test(value);
const hasListThumbnailTransform = (value: string): boolean =>
  /(?:^|[?&#])imageMogr2(?:\/|%2F)/i.test(value);

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

export const resolveDisplayAssetUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw) || raw.startsWith("/")) return raw;
  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf("?");
  const pathname =
    queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  return `${fallbackCdnBaseUrl}/${trimSlashes(pathname)}${query}${hash}`;
};

const isUnsplashUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
    return parsed.hostname === "images.unsplash.com";
  } catch {
    return false;
  }
};

export const withThumbnailDisplayQuery = (value: string): string => {
  const raw = value.trim();
  if (
    !raw ||
    /^(data|blob):/i.test(raw) ||
    !/^(https?:)?\/\//i.test(raw) ||
    raw.includes("imageMogr2") ||
    isUnsplashUrl(raw)
  ) {
    return value;
  }

  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const separator = withoutHash.includes("?")
    ? withoutHash.endsWith("?") || withoutHash.endsWith("&")
      ? ""
      : "&"
    : "?";

  return `${withoutHash}${separator}${thumbnailDisplayQuery}${hash}`;
};

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
  for (const photo of photos) {
    const key = formatMonthKey(photo.takenAt);
    const group = groups.get(key);
    if (group) {
      group.push(photo);
    } else {
      groups.set(key, [photo]);
    }
  }
  return [...groups.entries()].map(([month, items]) => ({
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

export interface TopicSummary {
  topic: Topic;
  cover?: ResolvedPhoto;
  count: number;
  photos: ResolvedPhoto[];
}

export const buildTopicSummaries = (
  topics: Topic[],
  photos: ResolvedPhoto[],
): TopicSummary[] => {
  const summariesById = new Map<string, TopicSummary>();
  const photosById = new Map<string, ResolvedPhoto>();
  for (const topic of topics) {
    summariesById.set(topic.id, {
      topic,
      count: 0,
      photos: [],
    });
  }

  for (const photo of photos) {
    photosById.set(photo.id, photo);
    for (const topicId of photo.topicIds) {
      const summary = summariesById.get(topicId);
      if (!summary) continue;
      summary.count += 1;
      summary.photos.push(photo);
      if (!summary.cover || photo.id === summary.topic.coverPhotoId) {
        summary.cover = photo;
      }
    }
  }

  for (const summary of summariesById.values()) {
    const explicitCover = summary.topic.coverPhotoId
      ? photosById.get(summary.topic.coverPhotoId)
      : undefined;
    if (explicitCover) summary.cover = explicitCover;
  }

  return topics.map((topic) => summariesById.get(topic.id)!).filter(Boolean);
};

type RawExif = ExifData;

type RawPhoto = Partial<Omit<ResolvedPhoto, "asset" | "urls">> & {
  asset?: Partial<PhotoAsset>;
  urls?: Partial<ResolvedPhoto["urls"]>;
  image?: { url?: string };
  imageUrl?: string;
  thumbnailUrl?: string;
  topicId?: string;
  topicTitle?: string;
  createdAt?: string;
  exif?: RawExif;
};

type RawTopic = Partial<Topic>;

type RawPayload = Partial<Omit<GalleryPayload, "photos" | "topics">> & {
  photos?: RawPhoto[];
  data?: RawPhoto[];
  topics?: RawTopic[];
  updatedAt?: string;
};

const titleFallback = (id: string): string => `未命名 ${id}`;

const compact = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const normalizeExif = (exif?: RawExif): ExifData | undefined => {
  if (!exif) return undefined;
  const normalized = compact({
    ...exif,
    cameraBrand: exif.cameraBrand ?? exif.cameraMake,
    lensModel: exif.lensModel ?? exif.lens,
    shutterSpeed: exif.shutterSpeed ?? exif.shutter,
  });
  return Object.keys(normalized).length ? (normalized as ExifData) : undefined;
};

const normalizeTopic = (topic: RawTopic): Topic | undefined => {
  if (!topic.id || !topic.title) return undefined;
  return compact({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    slug: topic.slug,
    coverPhotoId: topic.coverPhotoId,
    sortOrder: topic.sortOrder,
  }) as Topic;
};

const deriveTopics = (photos: RawPhoto[]): Topic[] => {
  const topics = new Map<string, Topic>();
  for (const photo of photos) {
    const topicIds = [
      photo.topicId,
      ...(Array.isArray(photo.topicIds) ? photo.topicIds : []),
    ].filter((topicId): topicId is string => Boolean(topicId));
    for (const topicId of topicIds) {
      if (!topics.has(topicId)) {
        topics.set(topicId, {
          id: topicId,
          title:
            photo.topicId === topicId && photo.topicTitle
              ? photo.topicTitle
              : topicId,
        });
      }
    }
  }
  return [...topics.values()];
};

const resolveUrls = (
  asset: PhotoAsset,
  urls?: Partial<ResolvedPhoto["urls"]>,
): ResolvedPhoto["urls"] => ({
  original: resolveDisplayAssetUrl(urls?.original ?? asset.original),
  thumbnail: reduceListThumbnailQuality(
    resolveDisplayAssetUrl(
      urls?.thumbnail ?? asset.thumbnail ?? asset.original,
    ),
  ),
  preview: resolveDisplayAssetUrl(
    urls?.preview ?? asset.preview ?? asset.thumbnail ?? asset.original,
  ),
});

const normalizePhoto = (photo: RawPhoto, index: number): ResolvedPhoto => {
  const id = photo.id ?? `photo-${index}`;
  const title = photo.title ?? titleFallback(id);
  const imageUrl = photo.image?.url ?? photo.imageUrl;
  const original = photo.asset?.original ?? imageUrl ?? photo.urls?.original;
  if (!original) throw new Error(`photos[${index}] 缺少图片地址`);
  const asset = compact({
    original,
    thumbnail: photo.asset?.thumbnail ?? photo.thumbnailUrl ?? imageUrl,
    preview:
      photo.asset?.preview ??
      photo.asset?.thumbnail ??
      photo.thumbnailUrl ??
      imageUrl,
    alt: photo.asset?.alt ?? title,
    width: photo.asset?.width ?? photo.exif?.width,
    height: photo.asset?.height ?? photo.exif?.height,
  }) as PhotoAsset;
  const topicIds = Array.isArray(photo.topicIds)
    ? photo.topicIds
    : photo.topicId
      ? [photo.topicId]
      : [];
  const takenAt =
    photo.takenAt ??
    photo.exif?.capturedAt ??
    photo.createdAt ??
    new Date(0).toISOString();

  return compact({
    id,
    title,
    description: photo.description,
    topicIds,
    takenAt,
    location: photo.location,
    asset,
    urls: resolveUrls(asset, photo.urls),
    exif: normalizeExif(photo.exif),
  }) as ResolvedPhoto;
};

export const normalizePayload = (payload: unknown): GalleryPayload => {
  const raw = payload as RawPayload;
  const sourcePhotos = Array.isArray(raw.photos)
    ? raw.photos
    : Array.isArray(raw.data)
      ? raw.data
      : [];
  const sourceTopics = Array.isArray(raw.topics)
    ? raw.topics
        .map(normalizeTopic)
        .filter((topic): topic is Topic => Boolean(topic))
    : [];
  const topics = sourceTopics.length
    ? sourceTopics
    : deriveTopics(sourcePhotos);

  return {
    generatedAt: raw.generatedAt ?? raw.updatedAt ?? new Date().toISOString(),
    topics: topics.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
    photos: sourcePhotos.map(normalizePhoto).sort(compareNewest),
  };
};
