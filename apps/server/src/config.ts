import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: envLocalPath, override: false });

export type CosConfig = {
  enabled: boolean;
  secretId?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
  prefix: string;
  cdnBaseUrl?: string;
};

export type ServerConfig = {
  env: string;
  host: string;
  port: number;
  adminToken?: string;
  corsOrigins: string[];
  databaseFile: string;
  exportFile: string;
  uploadDir: string;
  publicBaseUrl?: string;
  cos: CosConfig;
};

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "4010", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4010;
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(): ServerConfig {
  const exportFile = path.resolve(
    process.cwd(),
    process.env.GALLERY_EXPORT_FILE ??
      process.env.DATA_FILE ??
      "../../data/photos.json",
  );
  const databaseFile = path.resolve(
    process.cwd(),
    process.env.SQLITE_DATABASE_FILE ??
      process.env.DATABASE_FILE ??
      "../../data/gallery.sqlite",
  );
  const exportFile = path.resolve(
    process.cwd(),
    process.env.EXPORT_FILE ??
      process.env.DATA_FILE ??
      "../../data/photos.json",
  );
  const uploadDir = path.resolve(
    process.cwd(),
    process.env.UPLOAD_DIR ?? "./uploads",
  );

  return {
    env: process.env.NODE_ENV ?? "development",
    host: process.env.HOST ?? "0.0.0.0",
    port: parsePort(process.env.PORT),
    adminToken: optional(process.env.ADMIN_TOKEN),
    corsOrigins: parseList(process.env.CORS_ORIGINS),
    databaseFile,
    exportFile,
    uploadDir,
    publicBaseUrl: optional(process.env.PUBLIC_BASE_URL),
    cos: {
      enabled: parseBoolean(process.env.COS_ENABLED),
      secretId: optional(process.env.COS_SECRET_ID),
      secretKey: optional(process.env.COS_SECRET_KEY),
      bucket: optional(process.env.COS_BUCKET),
      region: optional(process.env.COS_REGION),
      prefix: process.env.COS_PREFIX?.trim() || "photos",
      cdnBaseUrl: optional(process.env.COS_CDN_BASE_URL),
    },
  };
}
