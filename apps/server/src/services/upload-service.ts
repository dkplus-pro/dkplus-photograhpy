import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import mime from "mime-types";
import type { CosConfig, ServerConfig } from "../config.js";
import { AppError } from "../errors.js";
import type { PhotoImage } from "../types/gallery.js";

export type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type StoredUpload = {
  image: PhotoImage;
  buffer: Buffer;
};

function sanitizeFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const base = path
    .basename(fileName, ext)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "photo"}${ext || ".jpg"}`;
}

function buildObjectKey(prefix: string, fileName: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    prefix.replace(/^\/+|\/+$/g, ""),
    year,
    month,
    `${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}`,
  ]
    .filter(Boolean)
    .join("/");
}

function joinPublicUrl(baseUrl: string | undefined, key: string): string {
  if (!baseUrl) {
    return `/uploads/${key}`;
  }
  return `${baseUrl.replace(/\/+$/g, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function assertCosConfigured(cos: CosConfig): asserts cos is CosConfig & {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
} {
  if (!cos.secretId || !cos.secretKey || !cos.bucket || !cos.region) {
    throw new AppError(
      500,
      "COS_NOT_CONFIGURED",
      "COS is enabled but COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, or COS_REGION is missing",
    );
  }
}

export class UploadService {
  constructor(private readonly config: ServerConfig) {}

  async store(file: UploadedFile): Promise<StoredUpload> {
    if (!file.buffer?.length) {
      throw new AppError(400, "UPLOAD_EMPTY", "Uploaded file is empty");
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new AppError(
        400,
        "UPLOAD_UNSUPPORTED_TYPE",
        "Only image uploads are supported",
      );
    }

    return this.config.cos.enabled
      ? this.storeInCos(file)
      : this.storeLocally(file);
  }

  private async storeLocally(file: UploadedFile): Promise<StoredUpload> {
    const key = buildObjectKey("", file.originalname);
    const targetPath = path.join(this.config.uploadDir, key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.buffer);

    return {
      buffer: file.buffer,
      image: {
        url: joinPublicUrl(this.config.publicBaseUrl, key),
        key,
        fileName: file.originalname,
        mimeType:
          file.mimetype ||
          mime.lookup(file.originalname) ||
          "application/octet-stream",
        size: file.size,
        storage: "local",
      },
    };
  }

  private async storeInCos(file: UploadedFile): Promise<StoredUpload> {
    const cos = this.config.cos;
    assertCosConfigured(cos);
    const key = buildObjectKey(cos.prefix, file.originalname);
    const { default: COS } = await import("cos-nodejs-sdk-v5");
    const client = new COS({
      SecretId: cos.secretId,
      SecretKey: cos.secretKey,
    });

    await new Promise<void>((resolve, reject) => {
      client.putObject(
        {
          Bucket: cos.bucket,
          Region: cos.region,
          Key: key,
          Body: file.buffer,
          ContentLength: file.size,
          ContentType:
            file.mimetype ||
            mime.lookup(file.originalname) ||
            "application/octet-stream",
        },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
      );
    });

    return {
      buffer: file.buffer,
      image: {
        url: joinPublicUrl(cos.cdnBaseUrl, key),
        key,
        fileName: file.originalname,
        mimeType:
          file.mimetype ||
          mime.lookup(file.originalname) ||
          "application/octet-stream",
        size: file.size,
        storage: "cos",
      },
    };
  }
}
