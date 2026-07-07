import type { PhotoExif, PhotoRecord, UploadPreview } from "../types";

export const formatDate = (value?: string): string => {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatExposure = (
  seconds?: number | string,
): string | undefined => {
  if (seconds === undefined || seconds === "") return undefined;
  if (typeof seconds === "string") return seconds;
  if (seconds >= 1) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  const denominator = Math.round(1 / seconds);
  return `1/${denominator}s`;
};

export const formatAperture = (value?: number | string): string | undefined => {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "string")
    return value.startsWith("f/") ? value : `f/${value}`;
  return `f/${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
};

export const exifLine = (exif?: PhotoExif): string => {
  if (!exif) return "EXIF pending";
  const camera = [exif.cameraMake, exif.cameraModel].filter(Boolean).join(" ");
  const details = [
    camera,
    exif.lens,
    exif.aperture,
    exif.shutter,
    exif.iso ? `ISO ${exif.iso}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return details || "EXIF pending";
};

export const photoTitle = (photo: PhotoRecord): string =>
  photo.title?.trim() || `Untitled ${photo.id}`;

export const summarizeUpload = (previews: UploadPreview[]): string => {
  if (previews.length === 0) return "No files staged";
  const topics = new Set(
    previews.map((preview) => preview.topicId).filter(Boolean),
  );
  return `${previews.length} file${previews.length === 1 ? "" : "s"} staged${
    topics.size
      ? ` across ${topics.size} topic${topics.size === 1 ? "" : "s"}`
      : ""
  }`;
};
