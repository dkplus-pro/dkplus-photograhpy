import * as exifr from "exifr";
import type { ExifMetadata } from "../types/gallery.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatAperture(value: unknown): string | undefined {
  const number = asNumber(value);
  return number ? `f/${Number(number.toFixed(1))}` : undefined;
}

function formatFocalLength(value: unknown): string | undefined {
  const number = asNumber(value);
  return number ? `${Number(number.toFixed(1))}mm` : undefined;
}

function formatExposureTime(value: unknown): string | undefined {
  const number = asNumber(value);
  if (!number || number <= 0) {
    return asString(value);
  }
  if (number >= 1) {
    return `${Number(number.toFixed(2))}s`;
  }
  return `1/${Math.round(1 / number)}s`;
}

function formatDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }
  const raw = asString(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.includes("T")
    ? raw
    : raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? raw : parsed.toISOString();
}

export async function extractExif(buffer: Buffer): Promise<ExifMetadata> {
  try {
    const tags = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: false,
      xmp: false,
      icc: false,
      iptc: false,
    })) as Record<string, unknown> | undefined;

    if (!tags) {
      return {};
    }

    return {
      cameraBrand: asString(tags.Make),
      cameraModel: asString(tags.Model),
      lens: asString(tags.LensModel) ?? asString(tags.Lens),
      iso: asNumber(tags.ISO),
      aperture: formatAperture(tags.FNumber ?? tags.ApertureValue),
      shutterSpeed: formatExposureTime(
        tags.ExposureTime ?? tags.ShutterSpeedValue,
      ),
      focalLength: formatFocalLength(tags.FocalLength),
      capturedAt: formatDate(
        tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate,
      ),
    };
  } catch {
    return {};
  }
}
