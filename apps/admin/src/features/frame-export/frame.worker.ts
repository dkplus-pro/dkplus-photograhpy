/// <reference lib="webworker" />

import { drawFrameComposition, frameOutputSize } from "./frame-drawing";
import { injectExifIntoJpeg } from "../watermark-export/exif";
import type { FrameFields } from "./frame-drawing";
import type {
  ExportQuality,
  FrameTaskResult,
} from "./types";

interface FrameRenderRequest {
  type: "render";
  id: string;
  fileName: string;
  blob: Blob;
  quality: ExportQuality;
  fields: FrameFields;
  /** 已解码的 logo 位图（主线程解码后分发）。 */
  logo?: ImageBitmap;
  /** logo 无图时的文字兜底。 */
  logoMark?: string;
  exif?: Uint8Array | null;
}

const LOW_QUALITY_JPEG = 0.2;
const MEDIUM_QUALITY_JPEG = 0.9;
const HIGH_QUALITY_JPEG = 0.92;

const qualityFor = (quality: ExportQuality) =>
  quality === "low"
    ? LOW_QUALITY_JPEG
    : quality === "medium"
      ? MEDIUM_QUALITY_JPEG
      : HIGH_QUALITY_JPEG;

async function render(request: FrameRenderRequest): Promise<FrameTaskResult> {
  const { blob: sourceBlob, quality, fields, logo, logoMark, exif } = request;
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const { width, height } = frameOutputSize(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Worker 画布不可用。");

    drawFrameComposition(context, width, height, bitmap, fields, {
      bitmap: logo,
      mark: logoMark,
    });
    const encoded = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: qualityFor(quality),
    });
    const output = await injectExifIntoJpeg(encoded, exif ?? null, width, height);

    return {
      id: request.id,
      fileName: `${request.fileName}.jpg`,
      blob: output,
      width,
      height,
      bytes: output.size,
      usedWorker: true,
    };
  } finally {
    bitmap.close();
  }
}

self.addEventListener("message", (event: MessageEvent<FrameRenderRequest>) => {
  if (event.data?.type !== "render") return;
  const request = event.data;
  void render(request)
    .then((result) =>
      self.postMessage({ type: "result", id: request.id, result }),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "渲染 Worker 失败。";
      self.postMessage({ type: "error", id: request.id, message });
    });
});
