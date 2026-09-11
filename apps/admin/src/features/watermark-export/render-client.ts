import { drawLogoWatermark } from "./draw-logo-watermark";
import { EXIF_HEAD_BYTES, fetchSourceExif, injectExifIntoJpeg } from "./exif";
import type {
  ExportJob,
  ExportOutcome,
  ExportQuality,
  ExportSettings,
  ExportTaskFailure,
  ExportTaskResult,
  WatermarkConfig,
} from "./types";

const LOW_QUALITY_JPEG = 0.2;
const MEDIUM_QUALITY_JPEG = 0.9;
const HIGH_QUALITY_JPEG = 0.92;
const MEDIUM_DIMENSION_SCALE = 0.5;
const CDN_HOST_PATTERN = /\.(myqcloud\.com|qcloud\.com|cdn\.ai4love\.cn)$/i;

interface WorkerTaskMessage {
  type: "render";
  id: string;
  fileName: string;
  blob: Blob;
  quality: ExportQuality;
  watermark: WatermarkConfig;
  logo?: ImageBitmap;
  exif?: Uint8Array | null;
}

interface WorkerResultMessage {
  type: "result" | "error";
  id: string;
  result?: ExportTaskResult;
  message?: string;
}

const supportsWorkerRendering = () =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap !== "undefined";

export const renderConcurrency = (jobCount: number) => {
  const hardware =
    typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(jobCount, hardware, 4));
};

const outputQualityFor = (quality: ExportQuality) =>
  quality === "low"
    ? LOW_QUALITY_JPEG
    : quality === "medium"
      ? MEDIUM_QUALITY_JPEG
      : HIGH_QUALITY_JPEG;

/**
 * 低/中质量档复用腾讯云数据万象 URL 处理，由 CDN 出压缩图，减小传输与解码成本。
 * 数据万象操作参数必须原样拼在 query 中（含 / 与 !），走 URLSearchParams
 * 会被百分号编码导致 CDN 无法识别；非 CDN 域名或已有处理参数时原样返回。
 *
 * 中档 = 宽高各 50%（与客户端 !50p 语义一致）+ 转 JPEG；
 * 低档 = 仅转 JPEG + 质量 60，最终 20% 质量由客户端编码决定。
 */
export const withQualityUrl = (url: string, quality: ExportQuality): string => {
  if (quality === "high") return url;
  if (!/^https?:\/\//i.test(url)) return url;

  const transform =
    quality === "medium"
      ? "imageMogr2/thumbnail/!50p/format/jpeg"
      : "imageMogr2/format/jpeg/quality/60";

  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  if (/imageMogr2/i.test(withoutHash)) return url;

  let parsed: URL;
  try {
    parsed = new URL(withoutHash);
  } catch {
    return url;
  }
  if (!CDN_HOST_PATTERN.test(parsed.hostname)) return url;

  const separator = withoutHash.includes("?")
    ? withoutHash.endsWith("?") || withoutHash.endsWith("&")
      ? ""
      : "&"
    : "?";
  return `${withoutHash}${separator}${transform}${hash}`;
};

const loadLogoBitmap = async (source: string): Promise<ImageBitmap> => {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`无法加载水印 Logo：${response.status}`);
  }
  return createImageBitmap(await response.blob());
};

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

const outputBaseName = (job: ExportJob) => job.fileName.replace(/\.[^.]+$/, "");

const failureName = (job: ExportJob) => `${outputBaseName(job)}-watermarked`;

const closeBitmap = (bitmap?: ImageBitmap) => bitmap?.close();

// ---------------------------------------------------------------------------
// Worker pool：队列 + 空闲 worker 领取，fetch 在派发时才启动（并发受池约束）
// ---------------------------------------------------------------------------

interface QueuedTask {
  job: ExportJob;
}

type WorkerWithTask = Worker & { __currentTask?: QueuedTask };

interface PoolHandlers {
  onResult: (result: ExportTaskResult) => void;
  onFailure: (failure: ExportTaskFailure) => void;
  onSettled: () => void;
}

class WorkerPool {
  private readonly workers: WorkerWithTask[] = [];
  private readonly queue: QueuedTask[] = [];
  private spawnedCount = 0;
  private settled = false;

  constructor(
    private readonly settings: ExportSettings,
    private readonly logo: ImageBitmap | undefined,
    private readonly concurrency: number,
    private readonly signal: AbortSignal,
    private readonly handlers: PoolHandlers,
  ) {}

  get size() {
    return this.spawnedCount;
  }

  enqueue(job: ExportJob) {
    if (this.settled) return;
    this.queue.push({ job });
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
      new URL("./watermark.worker.ts", import.meta.url),
      { type: "module" },
    ) as WorkerWithTask;
    this.spawnedCount += 1;

    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResultMessage>) => {
        const task = worker.__currentTask;
        if (!task || event.data.id !== task.job.id) return;
        worker.__currentTask = undefined;
        if (!this.settled) {
          if (event.data.type === "result" && event.data.result) {
            this.handlers.onResult(event.data.result);
          } else {
            this.handlers.onFailure({
              id: task.job.id,
              fileName: failureName(task.job),
              message: event.data.message || "渲染失败。",
            });
          }
        }
        this.drain();
      },
    );
    worker.addEventListener("error", (event) => {
      const task = worker.__currentTask;
      worker.__currentTask = undefined;
      if (task && !this.settled) {
        this.handlers.onFailure({
          id: task.job.id,
          fileName: failureName(task.job),
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
      const task = this.queue.shift();
      if (task) this.dispatch(worker, task);
      worker = this.idleWorker();
    }

    if (
      !this.queue.length &&
      !this.workers.some((entry) => entry.__currentTask)
    ) {
      this.settled = true;
      for (const entry of this.workers) entry.terminate();
      this.handlers.onSettled();
    }
  }

  private dispatch(worker: WorkerWithTask, task: QueuedTask) {
    worker.__currentTask = task;
    const qualityUrl = withQualityUrl(task.job.url, this.settings.quality);
    // 中/低档渲染用 CDN 压缩图，EXIF 从原图头部单独提取（CDN 处理后已丢失）；
    // 高档源即原图，直接从源 blob 头部提取。
    void Promise.all([
      fetchPhotoBlob(qualityUrl, this.signal),
      this.settings.quality === "high"
        ? Promise.resolve(null)
        : fetchSourceExif(task.job.url, this.signal),
    ])
      .then(async ([blob, headExif]) => {
        if (this.settled) return;
        const exif =
          this.settings.quality === "high"
            ? await headExifFromBlob(blob)
            : headExif;
        if (this.settled) return;
        const message: WorkerTaskMessage = {
          type: "render",
          id: task.job.id,
          fileName: outputBaseName(task.job),
          blob,
          quality: this.settings.quality,
          watermark: this.settings.watermark,
        };
        if (this.logo) message.logo = this.logo;
        if (exif) message.exif = exif;
        worker.postMessage(message);
      })
      .catch((error: unknown) => {
        worker.__currentTask = undefined;
        if (!this.settled) {
          this.handlers.onFailure({
            id: task.job.id,
            fileName: failureName(task.job),
            message:
              error instanceof Error ? error.message : "图片下载失败。",
          });
        }
        this.drain();
      });
  }
}

const headExifFromBlob = async (blob: Blob) => {
  const head = blob.slice(0, EXIF_HEAD_BYTES);
  const { extractExifBytes } = await import("./exif");
  return extractExifBytes(new Uint8Array(await head.arrayBuffer()));
};

// ---------------------------------------------------------------------------
// 主线程兜底（OffscreenCanvas / Worker 不可用的环境）
// ---------------------------------------------------------------------------

const mainThreadRenderOne = async (
  job: ExportJob,
  blob: Blob,
  settings: ExportSettings,
  logo: ImageBitmap | undefined,
  exif: Uint8Array | null,
): Promise<ExportTaskResult> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = settings.quality === "medium" ? MEDIUM_DIMENSION_SCALE : 1;
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建导出画布。");

    // 透明底垫白，避免 JPEG 压平后透明像素变黑块。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outWidth, outHeight);
    context.drawImage(bitmap, 0, 0, outWidth, outHeight);
    drawLogoWatermark(context, outWidth, outHeight, settings.watermark, logo);
    const encoded = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("无法编码导出图像。")),
        "image/jpeg",
        outputQualityFor(settings.quality),
      );
    });
    const output = await injectExifIntoJpeg(
      encoded,
      exif,
      outWidth,
      outHeight,
    );

    return {
      id: job.id,
      fileName: `${outputBaseName(job)}-watermarked.jpg`,
      blob: output,
      width: outWidth,
      height: outHeight,
      bytes: output.size,
      usedWorker: false,
    };
  } finally {
    closeBitmap(bitmap);
  }
};

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function renderExportBatch(
  jobs: ExportJob[],
  settings: ExportSettings,
  onProgress: (
    completed: number,
    total: number,
    currentFileName?: string,
  ) => void,
  isCancelled: () => boolean,
): Promise<ExportOutcome> {
  if (!jobs.length) {
    return {
      results: [],
      failures: [],
      fallbackCount: 0,
      concurrency: 0,
      cancelled: false,
    };
  }

  const results: ExportTaskResult[] = [];
  const failures: ExportTaskFailure[] = [];
  const total = jobs.length;
  let completed = 0;
  let fallbackCount = 0;

  const finishJob = (result: ExportTaskResult) => {
    results.push(result);
    if (!result.usedWorker) fallbackCount += 1;
    completed += 1;
    onProgress(completed, total, result.fileName);
  };

  const failJob = (failure: ExportTaskFailure) => {
    failures.push(failure);
    completed += 1;
    onProgress(completed, total, failure.fileName);
  };

  const logo = settings.watermark.logoSource
    ? await loadLogoBitmap(settings.watermark.logoSource).catch(
        (error: unknown) => {
          // logo 加载失败降级为无水印导出，不阻断批次。
          failures.push({
            id: "__logo__",
            fileName: "watermark-logo",
            message:
              error instanceof Error ? error.message : "水印 Logo 加载失败。",
          });
          return undefined;
        },
      )
    : undefined;

  if (isCancelled()) {
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
      const pool = new WorkerPool(
        settings,
        logo,
        renderConcurrency(jobs.length),
        fetchAbort.signal,
        { onResult: finishJob, onFailure: failJob, onSettled },
      );

      for (const job of jobs) {
        if (isCancelled()) break;
        pool.enqueue(job);
      }
      if (isCancelled()) pool.cancel();
      await settledPromise;
      concurrency = pool.size;
    } else {
      concurrency = renderConcurrency(jobs.length);
      let nextIndex = 0;
      const runners = Array.from(
        { length: concurrency },
        async () => {
          while (nextIndex < jobs.length) {
            if (isCancelled()) return;
            const job = jobs[nextIndex];
            nextIndex += 1;
            if (!job) continue;
            try {
              const qualityUrl = withQualityUrl(job.url, settings.quality);
              const [blob, headExif] = await Promise.all([
                fetchPhotoBlob(qualityUrl, fetchAbort.signal),
                settings.quality === "high"
                  ? Promise.resolve(null)
                  : fetchSourceExif(job.url, fetchAbort.signal),
              ]);
              const exif =
                settings.quality === "high"
                  ? await headExifFromBlob(blob)
                  : headExif;
              finishJob(
                await mainThreadRenderOne(
                  job,
                  blob,
                  settings,
                  logo,
                  exif,
                ),
              );
            } catch (error) {
              failJob({
                id: job.id,
                fileName: failureName(job),
                message:
                  error instanceof Error ? error.message : "导出失败。",
              });
            }
          }
        },
      );
      await Promise.all(runners);
    }
  } finally {
    fetchAbort.abort();
    closeBitmap(logo);
  }

  const cancelled = isCancelled();
  return {
    results,
    failures: failures.filter((failure) => failure.id !== "__logo__"),
    fallbackCount,
    concurrency,
    cancelled,
  };
}
