import type { PhotoExif } from "../types";
import { formatAperture, formatExposure } from "./format";

type RawExif = Record<string, unknown>;

const readString = (source: RawExif, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return undefined;
};

const readNumber = (source: RawExif, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const dateToIso = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return undefined;
};

export const extractExif = async (file: File): Promise<PhotoExif> => {
  try {
    const exifr = await import("exifr");
    const raw = ((await exifr.parse(file, {
      pick: [
        "Make",
        "Model",
        "LensModel",
        "Lens",
        "ISO",
        "FNumber",
        "ApertureValue",
        "ExposureTime",
        "ShutterSpeedValue",
        "FocalLength",
        "DateTimeOriginal",
        "CreateDate",
      ],
    })) ?? {}) as RawExif;

    return {
      cameraMake: readString(raw, ["Make"]),
      cameraModel: readString(raw, ["Model"]),
      lens: readString(raw, ["LensModel", "Lens"]),
      iso: readNumber(raw, ["ISO"]),
      aperture: formatAperture(
        readNumber(raw, ["FNumber", "ApertureValue"]) ??
          readString(raw, ["FNumber", "ApertureValue"]),
      ),
      shutter: formatExposure(
        readNumber(raw, ["ExposureTime", "ShutterSpeedValue"]) ??
          readString(raw, ["ExposureTime", "ShutterSpeedValue"]),
      ),
      focalLength: readString(raw, ["FocalLength"]),
      capturedAt: dateToIso(raw.DateTimeOriginal ?? raw.CreateDate),
    };
  } catch (error) {
    return {
      cameraMake: "EXIF unavailable",
      cameraModel:
        error instanceof Error ? error.message : "Unknown parse error",
    };
  }
};
