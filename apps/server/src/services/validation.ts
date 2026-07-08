import { AppError } from "../errors.js";
import type {
  PhotoAsset,
  PhotoImage,
  PhotoInput,
  TopicInput,
} from "../types/gallery.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: unknown,
  field: string,
  required = false,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new AppError(400, "VALIDATION_ERROR", `${field} is required`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a string`);
  }
  return value.trim();
}

function readOptionalTrimmedString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a string`);
  }
  return value.trim();
}

function readStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${field} must be an array of strings`,
    );
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be an integer`);
  }
  return numeric;
}

function readDate(value: unknown, field: string): string | undefined {
  const raw = readString(value, field);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${field} must be an ISO-compatible date`,
    );
  }
  return date.toISOString();
}

function readAsset(value: unknown): Partial<PhotoAsset> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AppError(400, "VALIDATION_ERROR", "asset must be an object");
  }
  return {
    original: readString(value.original, "asset.original"),
    thumbnail: readString(value.thumbnail, "asset.thumbnail"),
    preview: readString(value.preview, "asset.preview"),
    alt: readString(value.alt, "asset.alt"),
    width: value.width === undefined ? undefined : Number(value.width),
    height: value.height === undefined ? undefined : Number(value.height),
  };
}

function readImage(value: unknown): Partial<PhotoImage> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AppError(400, "VALIDATION_ERROR", "image must be an object");
  }
  const url = readString(value.url, "image.url");
  const key = readString(value.key, "image.key");
  const fileName = readString(value.fileName, "image.fileName");
  const mimeType = readString(value.mimeType, "image.mimeType");
  const size = value.size === undefined ? undefined : Number(value.size);
  if (size !== undefined && (!Number.isFinite(size) || size < 0)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "image.size must be a non-negative number",
    );
  }
  const storage = readString(value.storage, "image.storage");
  if (storage && !["local", "cos", "remote"].includes(storage)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "image.storage must be local, cos, or remote",
    );
  }
  return {
    url,
    key,
    fileName,
    mimeType,
    size,
    storage: storage as PhotoImage["storage"] | undefined,
  };
}

export function validatePhotoInput(
  value: unknown,
  options: { requireImage?: boolean } = {},
): PhotoInput {
  if (!isRecord(value)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "request body must be an object",
    );
  }

  const image = readImage(value.image);
  const asset = readAsset(value.asset);
  if (options.requireImage && !image?.url && !asset?.original) {
    throw new AppError(400, "VALIDATION_ERROR", "image.url is required");
  }

  return {
    id: readString(value.id, "id"),
    title: readString(value.title, "title"),
    description: readString(value.description, "description"),
    topicId: readString(value.topicId, "topicId"),
    topicIds: readStringArray(value.topicIds, "topicIds"),
    location: readString(value.location, "location"),
    tags: readStringArray(value.tags, "tags"),
    takenAt: readDate(value.takenAt, "takenAt"),
    image:
      image ??
      (asset?.original
        ? { url: asset.original, storage: "remote" }
        : undefined),
    asset,
    exif: isRecord(value.exif) ? { ...value.exif } : undefined,
  };
}

export function validateTopicInput(
  value: unknown,
  options: { requireTitle?: boolean } = {},
): TopicInput {
  if (!isRecord(value)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "request body must be an object",
    );
  }

  const title = readOptionalTrimmedString(value.title, "title");
  if (options.requireTitle && !title) {
    throw new AppError(400, "VALIDATION_ERROR", "title is required");
  }
  if (value.title !== undefined && !title) {
    throw new AppError(400, "VALIDATION_ERROR", "title is required");
  }

  return {
    id: readString(value.id, "id"),
    title,
    description: readOptionalTrimmedString(value.description, "description"),
    slug: readString(value.slug, "slug"),
    coverPhotoId: readString(value.coverPhotoId, "coverPhotoId"),
    sortOrder: readInteger(value.sortOrder, "sortOrder"),
  };
}

export function validateIds(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.ids)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "ids must be provided as an array",
    );
  }
  const ids = value.ids;
  if (
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "ids must contain one or more non-empty strings",
    );
  }
  return ids.map((id) => id.trim());
}
