import Router from "@koa/router";
import multer from "@koa/multer";
import type Koa from "koa";
import { AppError, isAppError } from "../errors.js";
import { extractExif } from "../services/exif.js";
import { PhotoStore } from "../services/photo-store.js";
import {
  UploadService,
  type UploadedFile,
} from "../services/upload-service.js";
import {
  validateIds,
  validatePhotoInput,
  validateTopicInput,
} from "../services/validation.js";
import type { ExifMetadata, PhotoInput } from "../types/gallery.js";

type BulkUploadItem = {
  title?: unknown;
  description?: unknown;
  topicId?: unknown;
  tags?: unknown;
  takenAt?: unknown;
  exif?: unknown;
};

type BulkUploadFailure = {
  index: number;
  fileName: string;
  code: string;
  message: string;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 50,
  },
});

function body(ctx: Koa.Context): unknown {
  return ctx.request.body;
}

function files(ctx: Koa.Context): UploadedFile[] {
  const request = ctx.request as Koa.Request & { files?: unknown };
  if (!Array.isArray(request.files)) {
    return [];
  }
  return request.files as UploadedFile[];
}

function field(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return undefined;
}

function itemField(
  value: unknown,
  path: string,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AppError(400, "UPLOAD_INVALID_ITEM", `${path} must be a string`);
  }
  return value.trim() || undefined;
}

function tags(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  throw new AppError(
    400,
    "UPLOAD_INVALID_ITEM",
    `${path} must be a comma-separated string or string array`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exifString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function exifNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function focalLength(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Number(value.toFixed(1))}mm`;
  }
  return exifString(value);
}

function focalLengthMm(value: unknown): string | undefined {
  const numberValue = exifNumber(value);
  return numberValue === undefined
    ? undefined
    : `${Number(numberValue.toFixed(1))}mm`;
}

function normalizeClientExif(value: unknown): ExifMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AppError(
      400,
      "UPLOAD_INVALID_EXIF",
      "exif must be a JSON object",
    );
  }

  const normalized: ExifMetadata = {
    cameraBrand: exifString(value.cameraBrand) ?? exifString(value.cameraMake),
    cameraModel: exifString(value.cameraModel),
    lens: exifString(value.lens) ?? exifString(value.lensModel),
    iso: exifNumber(value.iso),
    aperture: exifString(value.aperture),
    shutterSpeed: exifString(value.shutterSpeed) ?? exifString(value.shutter),
    focalLength:
      focalLength(value.focalLength) ?? focalLengthMm(value.focalLengthMm),
    width: exifNumber(value.width),
    height: exifNumber(value.height),
    capturedAt: exifString(value.capturedAt),
  };

  return Object.values(normalized).some((entry) => entry !== undefined)
    ? normalized
    : undefined;
}

function parseClientExif(value: unknown): ExifMetadata | undefined {
  const raw = field(value);
  if (!raw) {
    return undefined;
  }

  try {
    return normalizeClientExif(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(400, "UPLOAD_INVALID_EXIF", "exif must be valid JSON");
  }
}

function parseInlineClientExif(
  value: unknown,
  path: string,
): ExifMetadata | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      return normalizeClientExif(JSON.parse(value));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        400,
        "UPLOAD_INVALID_EXIF",
        `${path} must be valid JSON`,
      );
    }
  }
  return normalizeClientExif(value);
}

function mergeExif(
  serverExif: ExifMetadata,
  clientExif: ExifMetadata | undefined,
): ExifMetadata | undefined {
  const merged = clientExif ? { ...serverExif, ...clientExif } : serverExif;
  return Object.values(merged).some((entry) => entry !== undefined)
    ? merged
    : undefined;
}

function parseBulkItems(
  value: unknown,
  expectedCount: number,
): BulkUploadItem[] | undefined {
  const raw = field(value);
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError(400, "UPLOAD_INVALID_ITEMS", "items must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new AppError(
      400,
      "UPLOAD_INVALID_ITEMS",
      "items must be a JSON array",
    );
  }
  if (parsed.length !== expectedCount) {
    throw new AppError(
      400,
      "UPLOAD_INVALID_ITEMS",
      "items length must match uploaded file count",
    );
  }

  return parsed.map((item, index) => {
    if (!isRecord(item)) {
      throw new AppError(
        400,
        "UPLOAD_INVALID_ITEMS",
        `items[${index}] must be an object`,
      );
    }
    return item;
  });
}

async function createUploadedPhoto(
  file: UploadedFile,
  {
    store,
    uploads,
    title,
    description,
    topicId,
    tags: tagList,
    takenAt,
    clientExif,
  }: {
    store: PhotoStore;
    uploads: UploadService;
    title?: string;
    description?: string;
    topicId?: string;
    tags?: string[];
    takenAt?: string;
    clientExif?: ExifMetadata;
  },
) {
  const stored = await uploads.store(file);
  const exif = mergeExif(await extractExif(stored.buffer), clientExif);
  const input: PhotoInput = {
    title: title ?? file.originalname,
    description,
    topicId,
    tags: tagList,
    takenAt: takenAt ?? exif?.capturedAt,
    image: stored.image,
    exif,
  };
  return store.create(input);
}

function bulkFailure(
  index: number,
  file: UploadedFile,
  error: unknown,
): BulkUploadFailure {
  return {
    index,
    fileName: file.originalname,
    code: isAppError(error) ? error.code : "UPLOAD_FAILED",
    message: error instanceof Error ? error.message : "Upload failed",
  };
}

export function createPhotosRouter(
  store: PhotoStore,
  uploads: UploadService,
): Router {
  const router = new Router({ prefix: "/api" });

  router.get("/photos", async (ctx) => {
    ctx.body = { photos: await store.list() };
  });

  router.get("/gallery", async (ctx) => {
    ctx.body = await store.clientGalleryPayload();
  });

  router.get("/photos/:id", async (ctx) => {
    ctx.body = { photo: await store.get(ctx.params.id) };
  });

  router.get("/topics", (ctx) => {
    ctx.body = { topics: store.listTopics() };
  });

  router.get("/topics/:id", async (ctx) => {
    ctx.body = { topic: await store.getTopic(ctx.params.id) };
  });

  router.post("/topics", async (ctx) => {
    const topic = await store.createTopic(
      validateTopicInput(body(ctx), { requireTitle: true }),
    );
    ctx.status = 201;
    ctx.body = { topic };
  });

  router.put("/topics/:id", async (ctx) => {
    const topic = await store.updateTopic(
      ctx.params.id,
      validateTopicInput(body(ctx)),
    );
    ctx.body = { topic };
  });

  router.patch("/topics/:id", async (ctx) => {
    const topic = await store.updateTopic(
      ctx.params.id,
      validateTopicInput(body(ctx)),
    );
    ctx.body = { topic };
  });

  router.delete("/topics/:id", async (ctx) => {
    const deleted = await store.deleteTopic(ctx.params.id);
    ctx.body = { deleted };
  });

  router.post("/photos", async (ctx) => {
    const photo = await store.create(
      validatePhotoInput(body(ctx), { requireImage: true }),
    );
    ctx.status = 201;
    ctx.body = { photo };
  });

  router.put("/photos/:id", async (ctx) => {
    const photo = await store.update(
      ctx.params.id,
      validatePhotoInput(body(ctx)),
    );
    ctx.body = { photo };
  });

  router.patch("/photos/:id", async (ctx) => {
    const photo = await store.update(
      ctx.params.id,
      validatePhotoInput(body(ctx)),
    );
    ctx.body = { photo };
  });

  router.delete("/photos/:id", async (ctx) => {
    const deleted = await store.delete(ctx.params.id);
    ctx.body = { deleted };
  });

  router.post("/photos/batch-delete", async (ctx) => {
    const result = await store.batchDelete(validateIds(body(ctx)));
    ctx.body = result;
  });

  router.post("/export/client", async (ctx) => {
    ctx.body = { export: await store.exportToJson() };
  });

  router.post("/uploads/bulk", upload.any(), async (ctx) => {
    const incoming = files(ctx);
    if (incoming.length === 0) {
      throw new AppError(
        400,
        "UPLOAD_REQUIRED",
        "Provide one or more multipart image files",
      );
    }

    const form = body(ctx) as Record<string, unknown>;
    const itemInputs = parseBulkItems(form.items, incoming.length);
    const sharedClientExif = itemInputs ? undefined : parseClientExif(form.exif);
    const created = [];
    const failed: BulkUploadFailure[] = [];

    for (const [index, file] of incoming.entries()) {
      const item = itemInputs?.[index];
      try {
        created.push(
          await createUploadedPhoto(file, {
            store,
            uploads,
            title: item
              ? itemField(item.title, `items[${index}].title`)
              : field(form.title),
            description: item
              ? itemField(item.description, `items[${index}].description`)
              : field(form.description),
            topicId: item
              ? itemField(item.topicId, `items[${index}].topicId`)
              : field(form.topicId),
            tags: item
              ? tags(item.tags, `items[${index}].tags`)
              : tags(field(form.tags), "tags"),
            takenAt: item
              ? itemField(item.takenAt, `items[${index}].takenAt`)
              : field(form.takenAt),
            clientExif: item
              ? parseInlineClientExif(item.exif, `items[${index}].exif`)
              : sharedClientExif,
          }),
        );
      } catch (error) {
        failed.push(bulkFailure(index, file, error));
      }
    }

    const exported = created.length ? await store.exportToJson() : undefined;
    ctx.status = failed.length ? (created.length ? 207 : 400) : 201;
    ctx.body = { photos: created, failed, export: exported };
  });

  router.post("/uploads", upload.any(), async (ctx) => {
    const incoming = files(ctx);
    if (incoming.length === 0) {
      throw new AppError(
        400,
        "UPLOAD_REQUIRED",
        "Provide one or more multipart image files",
      );
    }

    const form = body(ctx) as Record<string, unknown>;
    const photoId = field(form.photoId);
    const clientExif = parseClientExif(form.exif);
    if (photoId && incoming.length !== 1) {
      throw new AppError(
        400,
        "UPLOAD_SINGLE_FILE_REQUIRED",
        "Updating an existing photo requires exactly one image file",
      );
    }

    const created = [];
    for (const file of incoming) {
      if (photoId) {
        const stored = await uploads.store(file);
        const exif = mergeExif(await extractExif(stored.buffer), clientExif);
        const input: PhotoInput = {
          title: field(form.title),
          description: field(form.description),
          topicId: field(form.topicId),
          tags: tags(field(form.tags), "tags"),
          takenAt: field(form.takenAt) ?? exif?.capturedAt,
          image: stored.image,
          exif,
        };
        const photo = await store.update(photoId, input);
        const exported = await store.exportToJson();
        ctx.status = 200;
        ctx.body = { photo, export: exported };
        return;
      }
      created.push(
        await createUploadedPhoto(file, {
          store,
          uploads,
          title: field(form.title) ?? file.originalname,
          description: field(form.description),
          topicId: field(form.topicId),
          tags: tags(field(form.tags), "tags"),
          takenAt: field(form.takenAt),
          clientExif,
        }),
      );
    }

    const exported = await store.exportToJson();
    ctx.status = 201;
    ctx.body = { photos: created, export: exported };
  });

  return router;
}
