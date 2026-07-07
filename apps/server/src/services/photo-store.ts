import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "../errors.js";
import type { GalleryData, PhotoInput, PhotoRecord } from "../types/gallery.js";

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

function normalizeGallery(value: unknown): GalleryData {
  if (Array.isArray(value)) {
    return {
      photos: value as PhotoRecord[],
      topics: [],
      updatedAt: new Date().toISOString(),
    };
  }
  if (!isRecord(value)) {
    return emptyGallery();
  }
  return {
    photos: Array.isArray(value.photos) ? (value.photos as PhotoRecord[]) : [],
    topics: Array.isArray(value.topics)
      ? (value.topics as GalleryData["topics"])
      : [],
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function mergePhoto(input: PhotoInput, existing?: PhotoRecord): PhotoRecord {
  const now = new Date().toISOString();
  const image = input.image ?? existing?.image;
  if (!image?.url) {
    throw new AppError(400, "VALIDATION_ERROR", "image.url is required");
  }

  return {
    id: input.id ?? existing?.id ?? randomUUID(),
    title: input.title ?? existing?.title ?? image.fileName ?? "Untitled photo",
    description: input.description ?? existing?.description,
    topicId: input.topicId ?? existing?.topicId,
    tags: input.tags ?? existing?.tags ?? [],
    takenAt: input.takenAt ?? input.exif?.capturedAt ?? existing?.takenAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    image: {
      url: image.url,
      key: image.key ?? existing?.image.key,
      fileName: image.fileName ?? existing?.image.fileName,
      mimeType: image.mimeType ?? existing?.image.mimeType,
      size: image.size ?? existing?.image.size,
      storage: image.storage ?? existing?.image.storage ?? "remote",
    },
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

  constructor(private readonly filePath: string) {}

  async read(): Promise<GalleryData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return normalizeGallery(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyGallery();
      }
      if (error instanceof SyntaxError) {
        throw new AppError(
          500,
          "DATA_FILE_INVALID_JSON",
          `Data file contains invalid JSON: ${this.filePath}`,
        );
      }
      throw error;
    }
  }

  async list(): Promise<PhotoRecord[]> {
    const data = await this.read();
    return [...data.photos].sort((left, right) => {
      const leftTime = new Date(left.takenAt ?? left.createdAt).valueOf();
      const rightTime = new Date(right.takenAt ?? right.createdAt).valueOf();
      return rightTime - leftTime;
    });
  }

  async get(id: string): Promise<PhotoRecord> {
    const data = await this.read();
    const photo = data.photos.find((item) => item.id === id);
    if (!photo) {
      throw new AppError(404, "PHOTO_NOT_FOUND", `Photo ${id} was not found`);
    }
    return photo;
  }

  async create(input: PhotoInput): Promise<PhotoRecord> {
    const next = mergePhoto(input);
    await this.mutate((data) => {
      if (data.photos.some((photo) => photo.id === next.id)) {
        throw new AppError(
          409,
          "PHOTO_ID_CONFLICT",
          `Photo ${next.id} already exists`,
        );
      }
      data.photos.push(next);
      return next;
    });
    return next;
  }

  async update(id: string, input: PhotoInput): Promise<PhotoRecord> {
    let updated: PhotoRecord | undefined;
    await this.mutate((data) => {
      const index = data.photos.findIndex((photo) => photo.id === id);
      if (index === -1) {
        throw new AppError(404, "PHOTO_NOT_FOUND", `Photo ${id} was not found`);
      }
      updated = mergePhoto({ ...input, id }, data.photos[index]);
      data.photos[index] = updated;
      return updated;
    });
    return updated!;
  }

  async delete(id: string): Promise<PhotoRecord> {
    let deleted: PhotoRecord | undefined;
    await this.mutate((data) => {
      const index = data.photos.findIndex((photo) => photo.id === id);
      if (index === -1) {
        throw new AppError(404, "PHOTO_NOT_FOUND", `Photo ${id} was not found`);
      }
      deleted = data.photos.splice(index, 1)[0];
      return deleted;
    });
    return deleted!;
  }

  async batchDelete(
    ids: string[],
  ): Promise<{ deleted: PhotoRecord[]; missing: string[] }> {
    let result: { deleted: PhotoRecord[]; missing: string[] } = {
      deleted: [],
      missing: [],
    };
    const targetIds = new Set(ids);
    await this.mutate((data) => {
      const before = data.photos;
      result = {
        deleted: before.filter((photo) => targetIds.has(photo.id)),
        missing: ids.filter((id) => !before.some((photo) => photo.id === id)),
      };
      data.photos = before.filter((photo) => !targetIds.has(photo.id));
      return result;
    });
    return result;
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
