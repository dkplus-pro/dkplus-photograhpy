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
import type { PhotoInput } from "../types/gallery.js";

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

export function createPhotosRouter(
  store: PhotoStore,
  uploads: UploadService,
): Router {
  const router = new Router({ prefix: "/api" });

  router.get("/photos", async (ctx) => {
    ctx.body = { photos: await store.list() };
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
    const created = [];
    for (const file of incoming) {
      const stored = await uploads.store(file);
      const exif = await extractExif(stored.buffer);
      const input: PhotoInput = {
        title: field(form.title) ?? file.originalname,
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
      created.push(await store.create(input));
    }

    ctx.status = 201;
    ctx.body = { photos: created };
  });

  return router;
}
