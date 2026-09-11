/// <reference lib="webworker" />

import { drawLogoWatermark } from "./draw-logo-watermark";
import { injectExifIntoJpeg } from "./exif";
import type {
  DrawWatermarkPayload,
  ExportQuality,
  ExportTaskResult,
} from "./types";

interface RenderRequest {
  type: "render";
  id: string;
  fileName: string;
  blob: Blob;
  quality: ExportQuality;
  watermark: DrawWatermarkPayload & {
    /** 兜底用：主线程未传 logo 位图时 worker 内自行拉取。 */
    logoSource?: string | null;
  };
  /** 已解码的 logo 位图，由主线程解码后随任务分发，worker 内不再重复拉取。 */
  logo?: ImageBitmap;
  /** 源图头部提取出的 EXIF 字节，编码后原样注入输出 JPEG。 */
  exif?: Uint8Array | null;
}

const LOW_QUALITY_JPEG = 0.2;
const MEDIUM_QUALITY_JPEG = 0.9;
const HIGH_QUALITY_JPEG = 0.92;

function canvasToBlob(
  canvas: OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

async function decodeLogo(source: string) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`无法加载水印 Logo：${response.status}`);
  }
  return createImageBitmap(await response.blob());
}

async function render(request: RenderRequest): Promise<ExportTaskResult> {
  const { blob: sourceBlob, quality, watermark, logo, exif } = request;
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Worker 画布不可用。");

    // 透明底垫白，避免 JPEG 压平后透明像素变黑块。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    drawLogoWatermark(context, canvas.width, canvas.height, watermark, logo);

    const outputQuality =
      quality === "low"
        ? LOW_QUALITY_JPEG
        : quality === "medium"
          ? MEDIUM_QUALITY_JPEG
          : HIGH_QUALITY_JPEG;
    const encoded = await canvasToBlob(canvas, outputQuality);
    const output = await injectExifIntoJpeg(
      encoded,
      exif ?? null,
      canvas.width,
      canvas.height,
    );

    return {
      id: request.id,
      fileName: `${request.fileName}.jpg`,
      blob: output,
      width: canvas.width,
      height: canvas.height,
      bytes: output.size,
      usedWorker: true,
    };
  } finally {
    bitmap.close();
  }
}

self.addEventListener("message", (event: MessageEvent<RenderRequest>) => {
  if (event.data?.type !== "render") return;

  const request = event.data;
  void (async () => {
    // logo 兜底加载：正常流程主线程解码后随任务传入，缺失时 worker 内自取。
    if (request.watermark.logoSource && !request.logo) {
      request.logo = await decodeLogo(request.watermark.logoSource);
    }
    return render(request);
  })()
    .then((result) =>
      self.postMessage({ type: "result", id: request.id, result }),
    )
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "渲染 Worker 失败。";
      self.postMessage({ type: "error", id: request.id, message });
    });
});
