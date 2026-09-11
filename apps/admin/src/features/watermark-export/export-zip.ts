import JSZip from "jszip";

import type {
  ExportJob,
  ExportOutcome,
  ExportSettings,
  ExportTaskFailure,
} from "./types";
import type { PhotoRecord as PhotoExportRecord } from "./photo-record";
import { renderExportBatch } from "./render-client";

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const uniqueZipName = (used: Set<string>, candidate: string) => {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  const dotIndex = candidate.lastIndexOf(".");
  const stem = dotIndex > 0 ? candidate.slice(0, dotIndex) : candidate;
  const extension = dotIndex > 0 ? candidate.slice(dotIndex) : "";
  let serial = 2;
  while (used.has(`${stem}-${serial}${extension}`)) serial += 1;
  const unique = `${stem}-${serial}${extension}`;
  used.add(unique);
  return unique;
};

export const buildExportJobs = (
  photos: PhotoExportRecord[],
): ExportJob[] =>
  photos
    .filter((photo) => Boolean(photo.imageUrl || photo.image?.url))
    .map((photo, index) => ({
      id: photo.id,
      url: photo.imageUrl || photo.image?.url || "",
      fileName:
        (photo.title?.trim() || photo.image?.fileName?.replace(/\.[^.]+$/, "") || photo.id)
          .replace(/[\\/:*?"<>|]+/g, "_")
          .slice(0, 80) || `photo-${index + 1}`,
    }));

export interface RunExportHandlers {
  onProgress: (completed: number, total: number, currentFileName?: string) => void;
  isCancelled: () => boolean;
}

export interface ZipExportSummary {
  outcome: ExportOutcome;
  /** 生成并触发下载后返回 zip 文件名；取消或无产物时为 null。 */
  zipFileName: string | null;
}

export async function runWatermarkExport(
  photos: PhotoExportRecord[],
  settings: ExportSettings,
  handlers: RunExportHandlers,
): Promise<ZipExportSummary> {
  const jobs = buildExportJobs(photos);
  if (!jobs.length) {
    return {
      outcome: {
        results: [],
        failures: [],
        fallbackCount: 0,
        concurrency: 0,
        cancelled: false,
      },
      zipFileName: null,
    };
  }

  const outcome = await renderExportBatch(
    jobs,
    settings,
    handlers.onProgress,
    handlers.isCancelled,
  );

  if (!outcome.results.length || outcome.cancelled) {
    return { outcome, zipFileName: null };
  }

  const usedNames = new Set<string>();
  const zip = new JSZip();
  for (const result of outcome.results) {
    const name = uniqueZipName(usedNames, result.fileName);
    zip.file(name, result.blob);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const zipFileName = `watermark-export-${stamp}.zip`;
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  triggerDownload(zipBlob, zipFileName);

  return { outcome, zipFileName };
}

export const summarizeFailures = (failures: ExportTaskFailure[]) =>
  failures
    .slice(0, 3)
    .map((failure) => `${failure.fileName}: ${failure.message}`)
    .join("；");
