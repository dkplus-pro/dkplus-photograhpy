import Router from "@koa/router";
import multer from "@koa/multer";
import type Koa from "koa";
import { AppError } from "../errors.js";
import { extractExif } from "../services/exif.js";
import { PhotoStore } from "../services/photo-store.js";
import {
  UploadService,
  type UploadedFile,
} from "../services/upload-service.js";
import { validateIds, validatePhotoInput } from "../services/validation.js";
import type { ExifMetadata, PhotoInput } from "../types/gallery.js";

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
  const stringValue = exifString(value);
  if (stringValue) {
    return stringValue;
  }
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
    throw new AppError(400, "UPLOAD_INVALID_EXIF", "exif must be a JSON object");
  }

  const normalized: ExifMetadata = {
    cameraBrand:
      exifString(value.cameraBrand) ?? exifString(value.cameraMake),
    cameraModel: exifString(value.cameraModel),
    lens: exifString(value.lens) ?? exifString(value.lensModel),
    iso: exifNumber(value.iso),
    aperture: exifString(value.aperture),
    shutterSpeed:
      exifString(value.shutterSpeed) ?? exifString(value.shutter),
    focalLength:
      focalLength(value.focalLength) ?? focalLength(value.focalLengthMm),
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
    throw new AppError(
      400,
      "UPLOAD_INVALID_EXIF",
      "exif must be valid JSON",
    );
  }
}

function mergeExif(
  serverExif: ExifMetadata,
  clientExif: ExifMetadata | undefined,
): ExifMetadata {
  return clientExif ? { ...serverExif, ...clientExif } : serverExif;
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
      const stored = await uploads.store(file);
      const exif = mergeExif(await extractExif(stored.buffer), clientExif);
      const input: PhotoInput = {
        title: photoId
          ? field(form.title)
          : (field(form.title) ?? file.originalname),
        description: field(form.description),
        topicId: field(form.topicId),
        tags: field(form.tags)
          ?.split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        takenAt: field(form.takenAt) ?? exif.capturedAt,
        image: stored.image,
        exif,
      };
      if (photoId) {
        const photo = await store.update(photoId, input);
        ctx.status = 200;
        ctx.body = { photo };
        return;
      }
      created.push(await store.create(input));
    }

    ctx.status = 201;
    ctx.body = { photos: created };
  });

  return router;
}
