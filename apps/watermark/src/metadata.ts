import * as exifr from "exifr";
import type { PhotoExif } from "./types";

type RawExif = Record<string, unknown>;

export const emptyExif = (): PhotoExif => ({
  model: "",
  lens: "",
  focalLength: "",
  exposure: "",
});

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function compactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function valueText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return compactNumber(value);
  }

  return "";
}

function formatFocalLength(value: unknown) {
  const focalLength = asNumber(value);
  return focalLength === null ? valueText(value) : `${compactNumber(focalLength)} mm`;
}

function formatExposure(exposureTime: unknown, aperture: unknown, iso: unknown) {
  const time = asNumber(exposureTime);
  const fNumber = asNumber(aperture);
  const sensitivity = asNumber(iso);
  const shutter =
    time === null
      ? valueText(exposureTime)
      : time > 0 && time < 1
        ? `1/${Math.round(1 / time)} s`
        : `${compactNumber(time)} s`;

  return [
    fNumber === null ? valueText(aperture) : `f/${compactNumber(fNumber)}`,
    shutter,
    sensitivity === null ? valueText(iso) : `ISO ${compactNumber(sensitivity)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function normalizeExif(raw: RawExif | undefined): PhotoExif {
  if (!raw) {
    return emptyExif();
  }

  return {
    model: valueText(raw.Model),
    lens: valueText(raw.LensModel),
    focalLength: formatFocalLength(raw.FocalLength),
    exposure: formatExposure(raw.ExposureTime, raw.FNumber, raw.ISO),
  };
}

export async function readExif(file: File) {
  try {
    const raw = (await exifr.parse(file, [
      "Model",
      "LensModel",
      "FocalLength",
      "FNumber",
      "ExposureTime",
      "ISO",
    ])) as RawExif | undefined;

    return normalizeExif(raw);
  } catch {
    return emptyExif();
  }
}

export function exifLines(exif: PhotoExif) {
  return [exif.model, exif.lens, exif.focalLength, exif.exposure].filter(Boolean);
}
