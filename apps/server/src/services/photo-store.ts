import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AppError } from "../errors.js";
import type {
  BrandInput,
  BrandLogo,
  BrandRecord,
  ExifMetadata,
  GalleryData,
  PhotoAsset,
  PhotoImage,
  PhotoInput,
  PhotoRecord,
  TopicInput,
  TopicRecord,
} from "../types/gallery.js";

export type PhotoStoreOptions = {
  databaseFile: string;
  seedFile: string;
  exportFile: string;
};

type PhotoRow = {
  id: string;
  data: string;
};

type TopicRow = {
  id: string;
  data: string;
};

type BrandRow = {
  id: string;
  data: string;
};

export type GalleryExportResult = {
  exportFile: string;
  generatedAt: string;
  photoCount: number;
  topicCount: number;
  brandCount: number;
};

export type PhotoPageQuery = {
  page: number;
  pageSize: number;
  title?: string;
  brand?: string;
  model?: string;
  topic?: string;
  sortOrder: "ascend" | "descend";
};

export type PhotoPageFacets = {
  cameraBrands: string[];
  cameraModels: string[];
};

export type PhotoPageResult = {
  photos: PhotoRecord[];
  total: number;
  allTotal: number;
  page: number;
  pageSize: number;
  facets: PhotoPageFacets;
};

type ClientGalleryPayload = {
  generatedAt: string;
  topics: Record<string, unknown>[];
  photos: Record<string, unknown>[];
  brands: Record<string, unknown>[];
};

function emptyGallery(): GalleryData {
  return {
    photos: [],
    topics: [],
    brands: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeGallery(value: unknown): GalleryData {
  if (Array.isArray(value)) {
    return {
      photos: value.map(normalizePhotoRecord),
      topics: [],
      brands: [],
      updatedAt: new Date().toISOString(),
    };
  }
  if (!isRecord(value)) {
    return emptyGallery();
  }
  return {
    photos: Array.isArray(value.photos)
      ? value.photos.map(normalizePhotoRecord)
      : [],
    topics: Array.isArray(value.topics)
      ? value.topics.map(normalizeTopicRecord)
      : [],
    brands: Array.isArray(value.brands)
      ? value.brands.map(normalizeBrandRecord)
      : [],
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : typeof value.generatedAt === "string"
          ? value.generatedAt
          : undefined,
  };
}

function normalizePhotoAsset(value: unknown): PhotoAsset | undefined {
  if (!isRecord(value)) return undefined;
  const original = readString(value.original);
  if (!original) return undefined;
  return {
    original,
    thumbnail: readString(value.thumbnail),
    preview: readString(value.preview),
    alt: readString(value.alt),
    width: readPositiveNumber(value.width),
    height: readPositiveNumber(value.height),
  };
}

function normalizePhotoImage(
  value: unknown,
  fallbackAsset?: PhotoAsset,
): PhotoImage | undefined {
  if (isRecord(value)) {
    const url = readString(value.url);
    if (url) {
      const storage = readString(value.storage);
      return {
        url,
        key: readString(value.key),
        fileName: readString(value.fileName),
        mimeType: readString(value.mimeType),
        size:
          typeof value.size === "number" && Number.isFinite(value.size)
            ? value.size
            : undefined,
        storage:
          storage === "local" || storage === "cos" || storage === "remote"
            ? storage
            : "remote",
      };
    }
  }

  if (!fallbackAsset) return undefined;
  return {
    url: fallbackAsset.original,
    fileName: fallbackAsset.alt,
    storage: "remote",
  };
}

function normalizeTopicRecord(value: unknown): TopicRecord {
  const source = isRecord(value) ? value : {};
  const id = readString(source.id) ?? randomUUID();
  return {
    id,
    title: readString(source.title) ?? id,
    description: readString(source.description),
    slug: readString(source.slug),
    coverPhotoId: readString(source.coverPhotoId),
    sortOrder:
      typeof source.sortOrder === "number" && Number.isInteger(source.sortOrder)
        ? source.sortOrder
        : undefined,
    createdAt: readString(source.createdAt),
    updatedAt: readString(source.updatedAt),
  };
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s/_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTopicId(value: string): string {
  return normalizeSlug(value);
}

/** EXIF 自动同步品牌的 id 规则，与 admin 前端 brandIdForName 保持一致 */
function brandIdForName(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `brand-${Array.from(name)
    .map((char) => (char.codePointAt(0) ?? 0).toString(36))
    .join("-")}`;
}

function normalizeBrandId(value: string): string {
  return normalizeSlug(value);
}

function normalizePhotoRecord(value: unknown): PhotoRecord {
  const source = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const asset = normalizePhotoAsset(source.asset);
  const image = normalizePhotoImage(source.image, asset);
  if (!image?.url) {
    throw new AppError(400, "VALIDATION_ERROR", "image.url is required");
  }

  const topicIds = readStringArray(source.topicIds);
  const topicId = readString(source.topicId) ?? topicIds?.[0];
  const takenAt =
    readString(source.takenAt) ?? readString(source.createdAt) ?? now;

  return {
    id: readString(source.id) ?? randomUUID(),
    title:
      readString(source.title) ??
      readString(asset?.alt) ??
      image.fileName ??
      "Untitled photo",
    description: readString(source.description),
    topicId,
    topicIds: topicIds ?? (topicId ? [topicId] : []),
    location: readString(source.location),
    tags: readStringArray(source.tags) ?? [],
    takenAt,
    createdAt: readString(source.createdAt) ?? takenAt,
    updatedAt: readString(source.updatedAt) ?? now,
    image,
    asset,
    exif: isRecord(source.exif) ? { ...source.exif } : undefined,
  };
}

function normalizeLogoStorage(
  value: unknown,
): BrandLogo["storage"] | undefined {
  const storage = readString(value);
  return storage === "local" || storage === "cos" || storage === "remote"
    ? storage
    : undefined;
}

function normalizeBrandLogo(value: unknown): BrandLogo | undefined {
  if (!isRecord(value)) return undefined;
  const url = readString(value.url);
  if (!url) return undefined;
  const size =
    typeof value.size === "number" && Number.isFinite(value.size)
      ? value.size
      : undefined;
  return {
    url,
    key: readString(value.key),
    fileName: readString(value.fileName),
    mimeType: readString(value.mimeType),
    size,
    storage: normalizeLogoStorage(value.storage),
    alt: readString(value.alt),
    createdAt: readString(value.createdAt),
  };
}

function logoFromUrl(url: string): BrandLogo {
  return { url, storage: "remote" };
}

function normalizeBrandLogos(logos: unknown, logoUrls: unknown): BrandLogo[] {
  const normalized: BrandLogo[] = [];
  if (Array.isArray(logos)) {
    for (const logo of logos) {
      const normalizedLogo = normalizeBrandLogo(logo);
      if (normalizedLogo) normalized.push(normalizedLogo);
    }
  }
  for (const url of readStringArray(logoUrls) ?? []) {
    normalized.push(logoFromUrl(url));
  }

  const seen = new Set<string>();
  return normalized.filter((logo) => {
    const key = logo.url.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withLogoUrls(brand: Omit<BrandRecord, "logoUrls">): BrandRecord {
  const logos = normalizeBrandLogos(brand.logos, undefined);
  return {
    ...brand,
    logos,
    logoUrls: logos.map((logo) => logo.url),
  };
}

function normalizeBrandRecord(value: unknown): BrandRecord {
  const source = isRecord(value) ? value : {};
  const now = new Date().toISOString();
  const name =
    readString(source.name) ??
    readString(source.title) ??
    readString(source.id);
  if (!name) {
    throw new AppError(400, "VALIDATION_ERROR", "brand name is required");
  }
  const id = normalizeBrandId(readString(source.id) ?? name) || randomUUID();
  return withLogoUrls({
    id,
    name,
    title: readString(source.title),
    aliases: readStringArray(source.aliases) ?? [],
    logos: normalizeBrandLogos(source.logos, source.logoUrls),
    createdAt: readString(source.createdAt) ?? now,
    updatedAt: readString(source.updatedAt) ?? now,
  });
}

function mergeBrand(input: BrandInput, existing?: BrandRecord): BrandRecord {
  const now = new Date().toISOString();
  const name = input.name ?? input.title ?? existing?.name;
  if (!name?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "name is required");
  }
  const logos =
    input.logos !== undefined || input.logoUrls !== undefined
      ? normalizeBrandLogos(input.logos, input.logoUrls)
      : (existing?.logos ?? []);
  const id =
    input.id ??
    existing?.id ??
    (normalizeBrandId(input.name ?? input.title ?? name) || randomUUID());

  return withLogoUrls({
    id,
    name: name.trim(),
    title: input.title ?? existing?.title,
    aliases: input.aliases ?? existing?.aliases ?? [],
    logos,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

function mergeAsset(
  input: PhotoInput,
  image: PhotoImage,
  existing?: PhotoRecord,
): PhotoAsset | undefined {
  const replacesImage =
    Boolean(input.image?.url) && input.image?.url !== existing?.image.url;
  const source = input.asset ?? (replacesImage ? undefined : existing?.asset);
  const original = source?.original ?? image.url;
  if (!original) return undefined;
  return {
    original,
    thumbnail:
      source?.thumbnail ??
      (replacesImage ? undefined : existing?.asset?.thumbnail) ??
      image.url,
    preview:
      source?.preview ??
      (replacesImage ? undefined : existing?.asset?.preview) ??
      source?.thumbnail ??
      (replacesImage ? undefined : existing?.asset?.thumbnail) ??
      image.url,
    alt: source?.alt ?? input.title ?? existing?.title ?? image.fileName,
    width:
      source?.width ??
      (replacesImage ? input.exif?.width : existing?.asset?.width),
    height:
      source?.height ??
      (replacesImage ? input.exif?.height : existing?.asset?.height),
  };
}

function mergePhoto(input: PhotoInput, existing?: PhotoRecord): PhotoRecord {
  const now = new Date().toISOString();
  const image = input.image ?? existing?.image;
  if (!image?.url) {
    throw new AppError(400, "VALIDATION_ERROR", "image.url is required");
  }

  const hasTopicIds = input.topicIds !== undefined;
  const topicIds = hasTopicIds
    ? (input.topicIds ?? [])
    : input.topicId
      ? [input.topicId]
      : (existing?.topicIds ?? []);
  const topicId = hasTopicIds
    ? (input.topicId ?? topicIds[0])
    : (input.topicId ?? existing?.topicId);
  const mergedImage: PhotoImage = {
    url: image.url,
    key: image.key ?? existing?.image.key,
    fileName: image.fileName ?? existing?.image.fileName,
    mimeType: image.mimeType ?? existing?.image.mimeType,
    size: image.size ?? existing?.image.size,
    storage: image.storage ?? existing?.image.storage ?? "remote",
  };

  return {
    id: input.id ?? existing?.id ?? randomUUID(),
    title: input.title ?? existing?.title ?? image.fileName ?? "Untitled photo",
    description: input.description ?? existing?.description,
    topicId,
    topicIds,
    location: input.location ?? existing?.location,
    tags: input.tags ?? existing?.tags ?? [],
    takenAt: input.takenAt ?? input.exif?.capturedAt ?? existing?.takenAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    image: mergedImage,
    asset: mergeAsset(input, mergedImage, existing),
    exif: input.exif ?? existing?.exif,
  };
}

function sortTime(photo: PhotoRecord): string {
  const raw = photo.takenAt ?? photo.createdAt;
  const timestamp = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : photo.createdAt;
}

const FACET_LOCALE = "zh-CN";

function exifFacetValue(
  photo: PhotoRecord,
  keys: string[],
): string | undefined {
  const exif = photo.exif;
  if (!exif) return undefined;
  for (const key of keys) {
    const value = (exif as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function collectFacetValues(photos: PhotoRecord[], keys: string[]): string[] {
  const values = new Set<string>();
  for (const photo of photos) {
    const value = exifFacetValue(photo, keys);
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, FACET_LOCALE));
}

function pageSortKey(photo: PhotoRecord): string {
  // Same derivation as the persisted sort_time column (see sortTime): records
  // written through mergePhoto/normalizePhotoRecord already fold
  // exif.capturedAt into takenAt, so this matches store.list() ordering.
  const raw = photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt;
  const timestamp = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : photo.createdAt;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function parsePhotoRow(row: PhotoRow | undefined, id: string): PhotoRecord {
  if (!row) {
    throw new AppError(404, "PHOTO_NOT_FOUND", `Photo ${id} was not found`);
  }
  return normalizePhotoRecord(JSON.parse(row.data));
}

function parseTopicRow(row: TopicRow | undefined, id: string): TopicRecord {
  if (!row) {
    throw new AppError(404, "TOPIC_NOT_FOUND", `Topic ${id} was not found`);
  }
  return normalizeTopicRecord(JSON.parse(row.data));
}

function parseBrandRow(row: BrandRow | undefined, id: string): BrandRecord {
  if (!row) {
    throw new AppError(404, "BRAND_NOT_FOUND", `Brand ${id} was not found`);
  }
  return normalizeBrandRecord(JSON.parse(row.data));
}

function mergeTopic(input: TopicInput, existing?: TopicRecord): TopicRecord {
  const now = new Date().toISOString();
  const title = input.title ?? existing?.title;
  if (!title?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "title is required");
  }

  const normalizedSlug =
    input.slug ?? existing?.slug ?? normalizeTopicId(input.title ?? title);
  const id =
    input.id ||
    existing?.id ||
    normalizedSlug ||
    normalizeTopicId(title) ||
    randomUUID();

  return {
    id,
    title: title.trim(),
    description:
      input.description !== undefined
        ? readString(input.description)
        : existing?.description,
    slug: normalizedSlug || undefined,
    coverPhotoId: input.coverPhotoId ?? existing?.coverPhotoId,
    sortOrder: input.sortOrder ?? existing?.sortOrder,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function compactObject(
  entries: [string, unknown][],
  options: { keepEmptyArrays?: boolean } = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    if (
      Array.isArray(value) &&
      value.length === 0 &&
      !options.keepEmptyArrays
    ) {
      continue;
    }
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    result[key] = value;
  }
  return result;
}

function compactAsset(asset: PhotoAsset): Record<string, unknown> {
  return compactObject([
    ["original", asset.original],
    ["thumbnail", asset.thumbnail],
    ["preview", asset.preview],
    ["alt", asset.alt],
    ["width", asset.width],
    ["height", asset.height],
  ]);
}

function compactExif(
  exif: PhotoRecord["exif"],
): Record<string, unknown> | undefined {
  if (!exif) return undefined;
  const compact = compactObject(Object.entries(exif));
  return Object.keys(compact).length ? compact : undefined;
}

function toClientTopic(topic: TopicRecord): Record<string, unknown> {
  return compactObject([
    ["id", topic.id],
    ["title", topic.title],
    ["description", topic.description],
    ["slug", topic.slug],
    ["coverPhotoId", topic.coverPhotoId],
    ["sortOrder", topic.sortOrder],
  ]);
}

function toClientBrandLogo(logo: BrandLogo): Record<string, unknown> {
  return compactObject([
    ["url", logo.url],
    ["alt", logo.alt],
  ]);
}

function toClientBrand(brand: BrandRecord): Record<string, unknown> {
  const logos = brand.logos
    .map(toClientBrandLogo)
    .filter((logo) => Boolean(logo.url));
  return compactObject(
    [
      ["id", brand.id],
      ["name", brand.name],
      ["title", brand.title],
      ["aliases", brand.aliases],
      ["logoUrls", brand.logoUrls],
      ["logos", logos],
    ],
    { keepEmptyArrays: true },
  );
}

function toClientPhoto(photo: PhotoRecord): Record<string, unknown> {
  const topicIds = photo.topicIds?.length
    ? photo.topicIds
    : photo.topicId
      ? [photo.topicId]
      : [];
  const asset = photo.asset ?? {
    original: photo.image.url,
    thumbnail: photo.image.url,
    preview: photo.image.url,
    alt: photo.title,
    width: typeof photo.exif?.width === "number" ? photo.exif.width : undefined,
    height:
      typeof photo.exif?.height === "number" ? photo.exif.height : undefined,
  };

  return compactObject(
    [
      ["id", photo.id],
      ["title", photo.title],
      ["description", photo.description],
      ["topicIds", topicIds],
      ["takenAt", photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt],
      ["location", photo.location],
      ["asset", compactAsset(asset)],
      ["exif", compactExif(photo.exif)],
    ],
    { keepEmptyArrays: true },
  );
}

export class PhotoStore {
  private readonly db: Database.Database;

  constructor(private readonly options: PhotoStoreOptions) {
    mkdirSync(path.dirname(options.databaseFile), { recursive: true });
    this.db = new Database(options.databaseFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.createSchema();
    this.seedFromJsonIfEmpty();
  }

  async read(): Promise<GalleryData> {
    return {
      photos: await this.list(),
      topics: this.listTopics(),
      brands: this.listBrands(),
      updatedAt: this.readMeta("updatedAt"),
    };
  }

  async list(): Promise<PhotoRecord[]> {
    return this.listAll();
  }

  /** 同步取全量照片，供同步方法（专题/品牌统计）复用 */
  listAll(): PhotoRecord[] {
    return this.db
      .prepare<[], PhotoRow>(
        `SELECT id, data
         FROM photos
         ORDER BY sort_time DESC, id ASC`,
      )
      .all()
      .map((row) => parsePhotoRow(row, row.id));
  }

  async pagePhotos(query: PhotoPageQuery): Promise<PhotoPageResult> {
    const all = await this.list();
    const allTotal = all.length;
    const facets: PhotoPageFacets = {
      cameraBrands: collectFacetValues(all, ["cameraBrand", "cameraMake"]),
      cameraModels: collectFacetValues(all, ["cameraModel"]),
    };

    const title = query.title?.toLowerCase();
    const { brand, model, topic, sortOrder } = query;

    const filtered = all.filter((photo) => {
      if (
        title !== undefined &&
        !photo.title.toLowerCase().includes(title) &&
        !(photo.description ?? "").toLowerCase().includes(title)
      ) {
        return false;
      }
      if (
        brand !== undefined &&
        exifFacetValue(photo, ["cameraBrand", "cameraMake"]) !== brand
      ) {
        return false;
      }
      if (
        model !== undefined &&
        exifFacetValue(photo, ["cameraModel"]) !== model
      ) {
        return false;
      }
      if (
        topic !== undefined &&
        photo.topicId !== topic &&
        !(photo.topicIds ?? []).includes(topic)
      ) {
        return false;
      }
      return true;
    });

    const direction = sortOrder === "ascend" ? 1 : -1;
    filtered.sort(
      (a, b) =>
        compareStrings(pageSortKey(a), pageSortKey(b)) * direction ||
        compareStrings(a.id, b.id),
    );

    const start = (query.page - 1) * query.pageSize;
    return {
      photos: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      allTotal,
      page: query.page,
      pageSize: query.pageSize,
      facets,
    };
  }

  async get(id: string): Promise<PhotoRecord> {
    return parsePhotoRow(
      this.db
        .prepare<[string], PhotoRow>("SELECT id, data FROM photos WHERE id = ?")
        .get(id),
      id,
    );
  }

  listTopics(): TopicRecord[] {
    const topics = this.db
      .prepare<[], TopicRow>(
        `SELECT id, data
         FROM topics
         ORDER BY sort_order IS NULL, sort_order ASC, id ASC`,
      )
      .all()
      .map((row) => normalizeTopicRecord(JSON.parse(row.data)));

    // 附加关联照片数：前端图片列表走服务端分页，无法再靠全量照片推导
    const usage = new Map<string, number>();
    for (const photo of this.listAll()) {
      const topicIds = new Set(
        [photo.topicId, ...(photo.topicIds ?? [])].filter(
          (topicId): topicId is string => Boolean(topicId),
        ),
      );
      for (const topicId of topicIds) {
        usage.set(topicId, (usage.get(topicId) ?? 0) + 1);
      }
    }

    return topics.map((topic) => ({
      ...topic,
      photoCount: usage.get(topic.id) ?? 0,
    }));
  }

  async getTopic(id: string): Promise<TopicRecord> {
    return parseTopicRow(
      this.db
        .prepare<[string], TopicRow>("SELECT id, data FROM topics WHERE id = ?")
        .get(id),
      id,
    );
  }

  /** 只读取已落库的品牌 */
  private listStoredBrands(): BrandRecord[] {
    return this.db
      .prepare<[], BrandRow>(
        `SELECT id, data
         FROM brands
         ORDER BY sort_name ASC, id ASC`,
      )
      .all()
      .map((row) => normalizeBrandRecord(JSON.parse(row.data)));
  }

  listBrands(): BrandRecord[] {
    const stored = this.listStoredBrands();

    // 照片 EXIF 自动同步：图片列表走服务端分页后前端拿不到全量照片，
    // 未配置的相机品牌需要在这里补进品牌列表
    const usage = new Map<string, { name: string; count: number }>();
    for (const photo of this.listAll()) {
      const name = (
        photo.exif?.cameraBrand ??
        photo.exif?.cameraMake ??
        ""
      ).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const current = usage.get(key) ?? { name, count: 0 };
      usage.set(key, { name, count: current.count + 1 });
    }

    const byName = new Map<string, BrandRecord>();
    for (const brand of stored) {
      const name = brand.name || brand.title || brand.id;
      const key = name.trim().toLowerCase();
      if (!key) continue;
      byName.set(key, {
        ...brand,
        name,
        title: brand.title || name,
        photoCount: usage.get(key)?.count ?? brand.photoCount ?? 0,
      });
    }

    for (const [key, metric] of usage) {
      if (byName.has(key)) continue;
      byName.set(key, {
        id: `auto-${brandIdForName(metric.name)}`,
        name: metric.name,
        title: metric.name,
        aliases: [],
        logos: [],
        logoUrls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photoCount: metric.count,
      });
    }

    return [...byName.values()].sort((left, right) =>
      (left.title || left.name).localeCompare(right.title || right.name, "zh-CN"),
    );
  }

  async getBrand(id: string): Promise<BrandRecord> {
    return parseBrandRow(
      this.db
        .prepare<[string], BrandRow>("SELECT id, data FROM brands WHERE id = ?")
        .get(id),
      id,
    );
  }

  async createBrand(input: BrandInput): Promise<BrandRecord> {
    const next = mergeBrand(input);
    const operation = this.db.transaction(() => {
      if (this.brandExists(next.id)) {
        throw new AppError(
          409,
          "BRAND_ID_CONFLICT",
          `Brand ${next.id} already exists`,
        );
      }
      this.insertBrand(next);
      this.touch();
    });
    operation();
    return next;
  }

  async updateBrand(id: string, input: BrandInput): Promise<BrandRecord> {
    const current = await this.getBrand(id);
    const updated = mergeBrand({ ...input, id }, current);
    const operation = this.db.transaction(() => {
      this.insertBrand(updated);
      this.touch();
    });
    operation();
    return updated;
  }

  async appendBrandLogos(id: string, logos: BrandLogo[]): Promise<BrandRecord> {
    const current = await this.getBrand(id);
    const updated = mergeBrand(
      {
        id,
        name: current.name,
        title: current.title,
        aliases: current.aliases,
        logos: [...current.logos, ...logos],
      },
      current,
    );
    const operation = this.db.transaction(() => {
      this.insertBrand(updated);
      this.touch();
    });
    operation();
    return updated;
  }

  async deleteBrand(id: string): Promise<BrandRecord> {
    const deleted = await this.getBrand(id);
    const operation = this.db.transaction(() => {
      this.db.prepare("DELETE FROM brands WHERE id = ?").run(id);
      this.touch();
    });
    operation();
    return deleted;
  }

  async createTopic(input: TopicInput): Promise<TopicRecord> {
    const next = mergeTopic(input);
    const operation = this.db.transaction(() => {
      if (this.topicExists(next.id)) {
        throw new AppError(
          409,
          "TOPIC_ID_CONFLICT",
          `Topic ${next.id} already exists`,
        );
      }
      this.insertTopic(next);
      this.touch();
    });
    operation();
    return next;
  }

  async updateTopic(id: string, input: TopicInput): Promise<TopicRecord> {
    const current = await this.getTopic(id);
    const updated = mergeTopic({ ...input, id }, current);
    const operation = this.db.transaction(() => {
      this.insertTopic(updated);
      this.touch();
    });
    operation();
    return updated;
  }

  async deleteTopic(id: string): Promise<TopicRecord> {
    const deleted = await this.getTopic(id);
    const operation = this.db.transaction(() => {
      const usageCount = this.countTopicReferences(id);
      if (usageCount > 0) {
        throw new AppError(
          409,
          "TOPIC_IN_USE",
          `Topic ${id} is used by ${usageCount} photo(s)`,
        );
      }
      this.db.prepare("DELETE FROM topics WHERE id = ?").run(id);
      this.touch();
    });
    operation();
    return deleted;
  }

  async create(input: PhotoInput): Promise<PhotoRecord> {
    const next = mergePhoto(input);
    const operation = this.db.transaction(() => {
      if (this.photoExists(next.id)) {
        throw new AppError(
          409,
          "PHOTO_ID_CONFLICT",
          `Photo ${next.id} already exists`,
        );
      }
      this.insertPhoto(next);
      this.syncBrandFromExif(next.exif);
      this.touch();
    });
    operation();
    return next;
  }

  async update(id: string, input: PhotoInput): Promise<PhotoRecord> {
    const current = await this.get(id);
    const updated = mergePhoto({ ...input, id }, current);
    const operation = this.db.transaction(() => {
      this.insertPhoto(updated);
      this.syncBrandFromExif(updated.exif);
      this.touch();
    });
    operation();
    return updated;
  }

  async delete(id: string): Promise<PhotoRecord> {
    const deleted = await this.get(id);
    const operation = this.db.transaction(() => {
      this.db.prepare("DELETE FROM photos WHERE id = ?").run(id);
      this.touch();
    });
    operation();
    return deleted;
  }

  async batchDelete(
    ids: string[],
  ): Promise<{ deleted: PhotoRecord[]; missing: string[] }> {
    const deleted: PhotoRecord[] = [];
    const missing: string[] = [];
    const operation = this.db.transaction(() => {
      for (const id of ids) {
        const row = this.db
          .prepare<[string], PhotoRow>(
            "SELECT id, data FROM photos WHERE id = ?",
          )
          .get(id);
        if (!row) {
          missing.push(id);
          continue;
        }
        deleted.push(parsePhotoRow(row, id));
        this.db.prepare("DELETE FROM photos WHERE id = ?").run(id);
      }
      if (deleted.length) this.touch();
    });
    operation();
    return { deleted, missing };
  }

  async clientGalleryPayload(
    generatedAt = new Date().toISOString(),
  ): Promise<ClientGalleryPayload> {
    return {
      generatedAt,
      topics: this.listTopics().map(toClientTopic),
      photos: (await this.list()).map(toClientPhoto),
      brands: this.listBrands().map(toClientBrand),
    };
  }

  async exportToJson(): Promise<GalleryExportResult> {
    const generatedAt = new Date().toISOString();
    const payload = await this.clientGalleryPayload(generatedAt);
    await fs.mkdir(path.dirname(this.options.exportFile), { recursive: true });
    const tempFile = `${this.options.exportFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(
      tempFile,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(tempFile, this.options.exportFile);
    return {
      exportFile: this.options.exportFile,
      generatedAt,
      photoCount: payload.photos.length,
      topicCount: payload.topics.length,
      brandCount: payload.brands.length,
    };
  }

  close(): void {
    this.db.close();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        sort_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        sort_order INTEGER
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        sort_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gallery_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private seedFromJsonIfEmpty(): void {
    const count = this.db
      .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM photos")
      .get()?.count;
    if (count || !existsSync(this.options.seedFile)) return;

    let data: GalleryData;
    try {
      data = normalizeGallery(
        JSON.parse(readFileSync(this.options.seedFile, "utf8")),
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AppError(
          500,
          "DATA_FILE_INVALID_JSON",
          `Seed data file contains invalid JSON: ${this.options.seedFile}`,
        );
      }
      throw error;
    }

    const operation = this.db.transaction(() => {
      for (const topic of data.topics) this.insertTopic(topic);
      for (const brand of data.brands) this.insertBrand(brand);
      for (const photo of data.photos) {
        this.insertPhoto(photo);
        this.syncBrandFromExif(photo.exif);
      }
      this.setMeta("updatedAt", data.updatedAt ?? new Date().toISOString());
    });
    operation();
  }

  private insertPhoto(photo: PhotoRecord): void {
    this.db
      .prepare<{
        id: string;
        data: string;
        sortTime: string;
        createdAt: string;
        updatedAt: string;
      }>(
        `INSERT INTO photos (id, data, sort_time, created_at, updated_at)
         VALUES (@id, @data, @sortTime, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           sort_time = excluded.sort_time,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: photo.id,
        data: JSON.stringify(photo),
        sortTime: sortTime(photo),
        createdAt: photo.createdAt,
        updatedAt: photo.updatedAt,
      });
  }

  private insertTopic(topic: TopicRecord): void {
    this.db
      .prepare<{ id: string; data: string; sortOrder?: number }>(
        `INSERT INTO topics (id, data, sort_order)
         VALUES (@id, @data, @sortOrder)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           sort_order = excluded.sort_order`,
      )
      .run({
        id: topic.id,
        data: JSON.stringify(topic),
        sortOrder: topic.sortOrder,
      });
  }

  private insertBrand(brand: BrandRecord): void {
    const normalized = withLogoUrls(brand);
    this.db
      .prepare<{
        id: string;
        data: string;
        sortName: string;
        createdAt: string;
        updatedAt: string;
      }>(
        `INSERT INTO brands (id, data, sort_name, created_at, updated_at)
         VALUES (@id, @data, @sortName, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           sort_name = excluded.sort_name,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: normalized.id,
        data: JSON.stringify(normalized),
        sortName: normalized.name.toLocaleLowerCase(),
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
      });
  }

  private photoExists(id: string): boolean {
    return Boolean(
      this.db.prepare<[string]>("SELECT 1 FROM photos WHERE id = ?").get(id),
    );
  }

  private topicExists(id: string): boolean {
    return Boolean(
      this.db.prepare<[string]>("SELECT 1 FROM topics WHERE id = ?").get(id),
    );
  }

  private brandExists(id: string): boolean {
    return Boolean(
      this.db.prepare<[string]>("SELECT 1 FROM brands WHERE id = ?").get(id),
    );
  }

  private findBrandByName(name: string): BrandRecord | undefined {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (!normalizedName) return undefined;
    // 只查已落库的品牌：listBrands 会补齐照片 EXIF 派生品牌，
    // 若用它判断会导致 syncBrandFromExif 误以为品牌已存在而永远不落库
    return this.listStoredBrands().find(
      (brand) =>
        brand.name.toLocaleLowerCase() === normalizedName ||
        brand.aliases?.some(
          (alias) => alias.toLocaleLowerCase() === normalizedName,
        ),
    );
  }

  private syncBrandFromExif(exif: ExifMetadata | undefined): void {
    const name = readString(exif?.cameraBrand);
    if (!name || this.findBrandByName(name)) {
      return;
    }
    const id = normalizeBrandId(name) || randomUUID();
    if (this.brandExists(id)) {
      return;
    }
    this.insertBrand(
      mergeBrand({
        id,
        name,
      }),
    );
  }

  private countTopicReferences(id: string): number {
    return this.db
      .prepare<[], PhotoRow>("SELECT id, data FROM photos")
      .all()
      .map((row) => parsePhotoRow(row, row.id))
      .filter(
        (photo) =>
          photo.topicId === id || Boolean(photo.topicIds?.includes(id)),
      ).length;
  }

  private touch(): void {
    this.setMeta("updatedAt", new Date().toISOString());
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare<[string, string]>(
        `INSERT INTO gallery_meta (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  private readMeta(key: string): string | undefined {
    return this.db
      .prepare<[string], { value: string }>(
        "SELECT value FROM gallery_meta WHERE key = ?",
      )
      .get(key)?.value;
  }
}
