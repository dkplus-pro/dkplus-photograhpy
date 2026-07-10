/// <reference lib="webworker" />

import { drawWatermark } from "./canvas";
import type { WatermarkOptions } from "./types";

interface RenderRequest {
  type: "render";
  id: string;
  bitmap: ImageBitmap;
  options: WatermarkOptions;
}

async function loadLogo(source: string) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error("无法获取品牌标志资源。");
  }

  return createImageBitmap(await response.blob());
}

async function render(request: RenderRequest) {
  const { bitmap, options } = request;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Worker 画布不可用。");
  }

  let logo: ImageBitmap | undefined;
  try {
    context.fillStyle = "#09090b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    if (options.logoSource) {
      try {
        logo = await loadLogo(options.logoSource);
      } catch {
        // Keep rendering when a brand-kit asset is malformed or unavailable.
      }
    }
    drawWatermark(context, canvas.width, canvas.height, options, logo);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  } finally {
    bitmap.close();
    logo?.close();
  }
}

self.addEventListener("message", (event: MessageEvent<RenderRequest>) => {
  if (event.data.type !== "render") {
    return;
  }

  void render(event.data)
    .then((blob) =>
      self.postMessage({ type: "result", id: event.data.id, blob }),
    )
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "渲染 Worker 失败。";
      self.postMessage({ type: "error", id: event.data.id, message });
    });
});
