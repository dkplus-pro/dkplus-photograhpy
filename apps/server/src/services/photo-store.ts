import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  promises as fs,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AppError } from "../errors.js";
import type {
  GalleryData,
  PhotoAsset,
  PhotoImage,
  PhotoInput,
  PhotoRecord,
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

export type GalleryExportResult = {
  exportFile: string;
  generatedAt: string;
  photoCount: number;
  topicCount: number;
};

export type GalleryExportResult = {
  exportedAt: string;
  updatedAt?: string;
  photoCount: number;
  topicCount: number;
};

export type GalleryExportResult = {
  exportedAt: string;
  updatedAt?: string;
  photoCount: number;
  topicCount: number;
};

function emptyGallery(): GalleryData {
  return { photos: [], topics: [], updatedAt: new Date(0).toISOString() };
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
  const takenAt = readString(source.takenAt) ?? readString(source.createdAt) ?? now;

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

function mergeAsset(
  input: PhotoInput,
  image: PhotoImage,
  existing?: PhotoRecord,
): PhotoAsset | undefined {
  const source = input.asset ?? existing?.asset;
  const original = source?.original ?? image.url;
  if (!original) return undefined;
  return {
    original,
    thumbnail: source?.thumbnail ?? existing?.asset?.thumbnail ?? image.url,
    preview:
      source?.preview ??
      existing?.asset?.preview ??
      source?.thumbnail ??
      existing?.asset?.thumbnail ??
      image.url,
    alt: source?.alt ?? input.title ?? existing?.title ?? image.fileName,
    width: source?.width ?? existing?.asset?.width,
    height: source?.height ?? existing?.asset?.height,
  };
}

function mergePhoto(input: PhotoInput, existing?: PhotoRecord): PhotoRecord {
  const now = new Date().toISOString();
  const image = input.image ?? existing?.image;
  if (!image?.url) {
    throw new AppError(400, "VALIDATION_ERROR", "image.url is required");
  }

  const topicId = input.topicId ?? existing?.topicId;
  const topicIds = input.topicIds ?? (topicId ? [topicId] : existing?.topicIds ?? []);
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

async function writeGalleryFile(
  filePath: string,
  data: GalleryData,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, filePath);
}

export class PhotoStore {
  private writeQueue: Promise<void> = Promise.resolve();

function parsePhotoRow(row: PhotoRow | undefined, id: string): PhotoRecord {
  if (!row) {
    throw new AppError(404, "PHOTO_NOT_FOUND", `Photo ${id} was not found`);
  }
  return normalizePhotoRecord(JSON.parse(row.data));
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
    width:
      typeof photo.exif?.width === "number" ? photo.exif.width : undefined,
    height:
      typeof photo.exif?.height === "number" ? photo.exif.height : undefined,
  };

  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    topicIds,
    takenAt: photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt,
    location: photo.location,
    tags: photo.tags ?? [],
    asset,
    exif: photo.exif,
    createdAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
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
      updatedAt: this.readMeta("updatedAt"),
    };
  }

  async list(): Promise<PhotoRecord[]> {
    return this.db
      .prepare<[], PhotoRow>(
        `SELECT id, data
         FROM photos
         ORDER BY sort_time DESC, id ASC`,
      )
      .all()
      .map((row) => parsePhotoRow(row, row.id));
  }

  async get(id: string): Promise<PhotoRecord> {
    return parsePhotoRow(
      this.db
        .prepare<[string], PhotoRow>("SELECT id, data FROM photos WHERE id = ?")
        .get(id),
      id,
    );
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
          .prepare<[string], PhotoRow>("SELECT id, data FROM photos WHERE id = ?")
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

  async exportToJson(): Promise<GalleryExportResult> {
    const generatedAt = new Date().toISOString();
    const photos = (await this.list()).map(toClientPhoto);
    const topics = this.listTopics();
    const payload = {
      generatedAt,
      updatedAt: generatedAt,
      topics,
      photos,
    };
    await fs.mkdir(path.dirname(this.options.exportFile), { recursive: true });
    const tempFile = `${this.options.exportFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await fs.rename(tempFile, this.options.exportFile);
    return {
      exportFile: this.options.exportFile,
      generatedAt,
      photoCount: photos.length,
      topicCount: topics.length,
    };
  }

  async exportToClient(exportFile: string): Promise<GalleryExportResult> {
    await this.writeQueue;
    const data = await this.read();
    const exportedAt = new Date().toISOString();
    const payload: GalleryData = {
      photos: data.photos,
      topics: data.topics,
      updatedAt: data.updatedAt ?? exportedAt,
    };
    await writeGalleryFile(exportFile, payload);
    return {
      exportedAt,
      updatedAt: payload.updatedAt,
      photoCount: payload.photos.length,
      topicCount: payload.topics.length,
    };
  }

  private async mutate<T>(updater: (data: GalleryData) => T): Promise<T> {
    let result: T;
    const operation = this.writeQueue.then(async () => {
      const data = await this.read();
      result = updater(data);
      data.updatedAt = new Date().toISOString();
      await this.write(data);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  private async write(data: GalleryData): Promise<void> {
    await writeGalleryFile(this.filePath, data);
  }
}
