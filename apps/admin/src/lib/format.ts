import type { PhotoExif, PhotoRecord, UploadPreview } from "../types";

export const formatDate = (value?: string): string => {
  if (!value) return "无日期";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeZone: "UTC",
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
  if (!exif) return "暂无 EXIF";
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
  return details || "暂无 EXIF";
};

export const photoTitle = (photo: PhotoRecord): string =>
  photo.title?.trim() || `未命名 ${photo.id}`;

export const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "未知大小";
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === "GB") {
      return `${Number(value.toFixed(value >= 100 ? 0 : 1))} ${unit}`;
    }
    value /= 1024;
  }
  return "未知大小";
};

export const imageSummary = (photo: PhotoRecord): string => {
  const fileName =
    photo.image?.fileName ||
    photo.image?.key?.split("/").at(-1) ||
    photo.imageUrl.split("/").at(-1) ||
    "未命名文件";
  const storage = photo.image?.storage ? ` · ${photo.image.storage}` : "";
  return `${fileName}${storage}`;
};

export const summarizeUpload = (previews: UploadPreview[]): string => {
  if (previews.length === 0) return "未暂存文件";
  const topics = new Set(
    previews.map((preview) => preview.topicId).filter(Boolean),
  );
  return `${previews.length} 个文件已暂存${
    topics.size ? `，覆盖 ${topics.size} 个专题` : ""
  }`;
};
