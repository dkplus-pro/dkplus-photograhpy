import JSZip from "jszip";

import {
  EXIF_HEAD_BYTES,
  extractExifBytes,
  fetchSourceExif,
  injectExifIntoJpeg,
} from "../watermark-export/exif";
import {
  renderConcurrency,
  withQualityUrl,
} from "../watermark-export/render-client";
import {
  drawFrameComposition,
  frameOutputSize,
  type FrameFields,
} from "./frame-drawing";
import type { PhotoExif, PhotoRecord } from "../../types";
import type {
  ExportQuality,
  FrameJob,
  FrameOutcome,
  FrameSettings,
  FrameTaskFailure,
  FrameTaskResult,
} from "./types";

const supportsWorkerRendering = () =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap !== "undefined";

// ---------- EXIF → 画框文字（与 main 的 formatExposure/focalLength 对齐） ----------

const formatAperture = (value?: string): string => {
  const raw = value?.trim();
  if (!raw) return "";
  return raw.startsWith("f/") ? raw : `f/${raw}`;
};

const normalizeFocalLength = (value?: string): string => {
  const raw = value?.trim();
  if (!raw) return "";
  return /mm$/i.test(raw) ? raw : `${raw}mm`;
};

export const frameFieldsFromExif = (exif?: PhotoExif): FrameFields => {
  if (!exif) return {};
  const exposure = [
    formatAperture(exif.aperture),
    exif.shutter?.trim(),
    exif.iso ? `ISO ${exif.iso}` : "",
  ]
    .filter(Boolean)
    .join("  ");
  return {
    brand: exif.cameraMake?.trim(),
    model: exif.cameraModel?.trim(),
    lens: exif.lens?.trim(),
    focalLength: normalizeFocalLength(exif.focalLength),
    exposure,
  };
};

const frameFileName = (photo: PhotoRecord, index: number): string =>
  (
    photo.title?.trim() ||
    photo.image?.fileName?.replace(/\.[^.]+$/, "") ||
    photo.id ||
    `photo-${index + 1}`
  )
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 80);

export const buildFrameJobs = (photos: PhotoRecord[]): FrameJob[] =>
  photos
    .map((photo, index) => ({
      id: photo.id,
      url: photo.imageUrl || photo.image?.url || "",
      fileName: frameFileName(photo, index),
      fields: frameFieldsFromExif(photo.exif),
    }))
    .filter((job) => Boolean(job.url));

// ---------- 网络 ----------

const fetchPhotoBlob = async (
  url: string,
  signal: AbortSignal,
): Promise<Blob> => {
  let response: Response;
  try {
    response = await fetch(url, { signal, mode: "cors" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("图片下载失败（跨域或网络原因），请检查 CDN CORS 配置。", {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status} ${response.statusText}`);
  }
  return response.blob();
};

const loadLogoBitmap = async (source: string): Promise<ImageBitmap> => {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`无法加载 Logo：${response.status}`);
  return createImageBitmap(await response.blob());
};

const headExifFromBlob = async (blob: Blob): Promise<Uint8Array | null> => {
  const head = blob.slice(0, EXIF_HEAD_BYTES);
  return extractExifBytes(new Uint8Array(await head.arrayBuffer()));
};

const outputBaseName = (job: FrameJob) => job.fileName.replace(/\.[^.]+$/, "");
const failureName = (job: FrameJob) => `${outputBaseName(job)}-frame`;
const closeBitmap = (bitmap?: ImageBitmap) => bitmap?.close();

// ---------- worker 池（与导出水印图同款：队列 + 空闲领取） ----------

interface FrameMessage {
  type: "render";
  id: string;
  fileName: string;
  blob: Blob;
  quality: ExportQuality;
  fields: FrameFields;
  logo?: ImageBitmap;
  logoMark?: string;
  exif?: Uint8Array | null;
}

interface FrameResultMessage {
  type: "result" | "error";
  id: string;
  result?: FrameTaskResult;
  message?: string;
}

type WorkerWithTask = Worker & { __currentTask?: FrameJob };

interface PoolHandlers {
  onResult: (result: FrameTaskResult) => void;
  onFailure: (failure: FrameTaskFailure) => void;
  onSettled: () => void;
}

class FrameWorkerPool {
  private readonly workers: WorkerWithTask[] = [];
  private readonly queue: FrameJob[] = [];
  private spawnedCount = 0;
  private settled = false;

  constructor(
    private readonly settings: FrameSettings,
    private readonly logo: ImageBitmap | undefined,
    private readonly concurrency: number,
    private readonly signal: AbortSignal,
    private readonly handlers: PoolHandlers,
  ) {}

  get size() {
    return this.spawnedCount;
  }

  enqueue(job: FrameJob) {
    if (this.settled) return;
    this.queue.push(job);
    this.drain();
  }

  cancel() {
    if (this.settled) return;
    this.settled = true;
    for (const worker of this.workers) worker.terminate();
    this.queue.length = 0;
    this.handlers.onSettled();
  }

  private spawn() {
    const worker = new Worker(
      new URL("./frame.worker.ts", import.meta.url),
      { type: "module" },
    ) as WorkerWithTask;
    this.spawnedCount += 1;

    worker.addEventListener("message", (event: MessageEvent<FrameResultMessage>) => {
      const task = worker.__currentTask;
      if (!task || event.data.id !== task.id) return;
      worker.__currentTask = undefined;
      if (!this.settled) {
        if (event.data.type === "result" && event.data.result) {
          this.handlers.onResult(event.data.result);
        } else {
          this.handlers.onFailure({
            id: task.id,
            fileName: failureName(task),
            message: event.data.message || "渲染失败。",
          });
        }
      }
      this.drain();
    });
    worker.addEventListener("error", (event) => {
      const task = worker.__currentTask;
      worker.__currentTask = undefined;
      if (task && !this.settled) {
        this.handlers.onFailure({
          id: task.id,
          fileName: failureName(task),
          message: event.message || "渲染 Worker 意外停止。",
        });
      }
      worker.terminate();
      const index = this.workers.indexOf(worker);
      if (index >= 0) this.workers.splice(index, 1);
      this.drain();
    });

    this.workers.push(worker);
  }

  private idleWorker() {
    return this.workers.find((entry) => !entry.__currentTask);
  }

  private drain() {
    if (this.settled) return;
    while (this.queue.length && this.workers.length < this.concurrency) {
      this.spawn();
    }
    let worker = this.idleWorker();
    while (worker && this.queue.length) {
      const job = this.queue.shift();
      if (job) this.dispatch(worker, job);
      worker = this.idleWorker();
    }
    if (!this.queue.length && !this.workers.some((entry) => entry.__currentTask)) {
      this.settled = true;
      for (const entry of this.workers) entry.terminate();
      this.handlers.onSettled();
    }
  }

  private dispatch(worker: WorkerWithTask, job: FrameJob) {
    worker.__currentTask = job;
    const qualityUrl = withQualityUrl(job.url, this.settings.quality);
    void Promise.all([
      fetchPhotoBlob(qualityUrl, this.signal),
      this.settings.quality === "high"
        ? Promise.resolve(null)
        : fetchSourceExif(job.url, this.signal),
    ])
      .then(async ([blob, headExif]) => {
        if (this.settled) return;
        const exif =
          this.settings.quality === "high"
            ? await headExifFromBlob(blob)
            : headExif;
        if (this.settled) return;
        const message: FrameMessage = {
          type: "render",
          id: job.id,
          fileName: outputBaseName(job),
          blob,
          quality: this.settings.quality,
          fields: job.fields,
        };
        if (this.logo) message.logo = this.logo;
        if (this.settings.logo.mark) message.logoMark = this.settings.logo.mark;
        if (exif) message.exif = exif;
        worker.postMessage(message);
      })
      .catch((error: unknown) => {
        worker.__currentTask = undefined;
        if (!this.settled) {
          this.handlers.onFailure({
            id: job.id,
            fileName: failureName(job),
            message: error instanceof Error ? error.message : "图片下载失败。",
          });
        }
        this.drain();
      });
  }
}

// ---------- 主线程兜底（无 OffscreenCanvas 时） ----------

const mainThreadRender = async (
  job: FrameJob,
  blob: Blob,
  settings: FrameSettings,
  logo: ImageBitmap | undefined,
  exif: Uint8Array | null,
): Promise<FrameTaskResult> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = frameOutputSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建导出画布。");
    const quality =
      settings.quality === "low" ? 0.2 : settings.quality === "medium" ? 0.9 : 0.92;
    drawFrameComposition(context, width, height, bitmap, job.fields, {
      bitmap: logo,
      mark: settings.logo.mark,
    });
    const encoded = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("无法编码导出图像。")),
        "image/jpeg",
        quality,
      );
    });
    const output = await injectExifIntoJpeg(encoded, exif, width, height);
    return {
      id: job.id,
      fileName: `${outputBaseName(job)}-frame.jpg`,
      blob: output,
      width,
      height,
      bytes: output.size,
      usedWorker: false,
    };
  } finally {
    closeBitmap(bitmap);
  }
};

// ---------- 主入口 ----------

export interface RunFrameHandlers {
  onProgress: (completed: number, total: number, currentFileName?: string) => void;
  isCancelled: () => boolean;
}

export const renderFrameBatch = async (
  jobs: FrameJob[],
  settings: FrameSettings,
  handlers: RunFrameHandlers,
): Promise<FrameOutcome> => {
  if (!jobs.length) {
    return { results: [], failures: [], fallbackCount: 0, concurrency: 0, cancelled: false };
  }

  const results: FrameTaskResult[] = [];
  const failures: FrameTaskFailure[] = [];
  const total = jobs.length;
  let completed = 0;
  let fallbackCount = 0;

  const finish = (result: FrameTaskResult) => {
    results.push(result);
    if (!result.usedWorker) fallbackCount += 1;
    completed += 1;
    handlers.onProgress(completed, total, result.fileName);
  };
  const fail = (failure: FrameTaskFailure) => {
    failures.push(failure);
    completed += 1;
    handlers.onProgress(completed, total, failure.fileName);
  };

  const logo = settings.logo.source
    ? await loadLogoBitmap(settings.logo.source).catch(() => undefined)
    : undefined;

  if (handlers.isCancelled()) {
    closeBitmap(logo);
    return { results, failures, fallbackCount, concurrency: 0, cancelled: true };
  }

  const fetchAbort = new AbortController();
  let concurrency: number;

  try {
    if (supportsWorkerRendering()) {
      let onSettled!: () => void;
      const settledPromise = new Promise<void>((resolve) => {
        onSettled = resolve;
      });
      const pool = new FrameWorkerPool(
        settings,
        logo,
        renderConcurrency(jobs.length),
        fetchAbort.signal,
        { onResult: finish, onFailure: fail, onSettled },
      );
      for (const job of jobs) {
        if (handlers.isCancelled()) break;
        pool.enqueue(job);
      }
      if (handlers.isCancelled()) pool.cancel();
      await settledPromise;
      concurrency = pool.size;
    } else {
      concurrency = renderConcurrency(jobs.length);
      let nextIndex = 0;
      const runners = Array.from({ length: concurrency }, async () => {
        while (nextIndex < jobs.length) {
          if (handlers.isCancelled()) return;
          const job = jobs[nextIndex];
          nextIndex += 1;
          if (!job) continue;
          try {
            const [blob, headExif] = await Promise.all([
              fetchPhotoBlob(
                withQualityUrl(job.url, settings.quality),
                fetchAbort.signal,
              ),
              settings.quality === "high"
                ? Promise.resolve(null)
                : fetchSourceExif(job.url, fetchAbort.signal),
            ]);
            const exif =
              settings.quality === "high"
                ? await headExifFromBlob(blob)
                : headExif;
            finish(await mainThreadRender(job, blob, settings, logo, exif));
          } catch (error) {
            fail({
              id: job.id,
              fileName: failureName(job),
              message: error instanceof Error ? error.message : "导出失败。",
            });
          }
        }
      });
      await Promise.all(runners);
    }
  } finally {
    fetchAbort.abort();
    closeBitmap(logo);
  }

  return {
    results,
    failures,
    fallbackCount,
    concurrency,
    cancelled: handlers.isCancelled(),
  };
};

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
  const ext = dotIndex > 0 ? candidate.slice(dotIndex) : "";
  let serial = 2;
  while (used.has(`${stem}-${serial}${ext}`)) serial += 1;
  const name = `${stem}-${serial}${ext}`;
  used.add(name);
  return name;
};

export interface FrameExportSummary {
  outcome: FrameOutcome;
  zipFileName: string | null;
}

export const runFrameExport = async (
  photos: PhotoRecord[],
  settings: FrameSettings,
  handlers: RunFrameHandlers,
): Promise<FrameExportSummary> => {
  const jobs = buildFrameJobs(photos);
  if (!jobs.length) {
    return {
      outcome: { results: [], failures: [], fallbackCount: 0, concurrency: 0, cancelled: false },
      zipFileName: null,
    };
  }

  const outcome = await renderFrameBatch(jobs, settings, handlers);
  if (!outcome.results.length || outcome.cancelled) {
    return { outcome, zipFileName: null };
  }

  const usedNames = new Set<string>();
  const zip = new JSZip();
  for (const result of outcome.results) {
    zip.file(uniqueZipName(usedNames, result.fileName), result.blob);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const zipFileName = `frame-export-${stamp}.zip`;
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  triggerDownload(zipBlob, zipFileName);
  return { outcome, zipFileName };
};

export const summarizeFrameFailures = (failures: FrameTaskFailure[]) =>
  failures
    .slice(0, 3)
    .map((failure) => `${failure.fileName}: ${failure.message}`)
    .join("；");
