import { drawWatermark } from "./canvas";
import type { PhotoEntry, RenderedPhoto, WatermarkOptions } from "./types";

interface WorkerResult {
  type: "result" | "error";
  id: string;
  blob?: Blob;
  message?: string;
}

interface BatchResult {
  photos: RenderedPhoto[];
  fallbackCount: number;
  concurrency: number;
}

function outputFileName(name: string, index: number) {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}-watermarked-${index + 1}.jpg`;
}

function supportsWorkerRendering() {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

export function renderConcurrency(jobCount: number) {
  const hardware = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(jobCount, hardware, 4));
}

function workerRender(entry: PhotoEntry, options: WatermarkOptions) {
  return new Promise<Blob>(async (resolve, reject) => {
    const worker = new Worker(new URL("./watermark.worker.ts", import.meta.url), {
      type: "module",
    });
    const id = entry.id;
    const cleanUp = () => worker.terminate();

    worker.addEventListener("message", (event: MessageEvent<WorkerResult>) => {
      if (event.data.id !== id) {
        return;
      }

      cleanUp();
      if (event.data.type === "result" && event.data.blob) {
        resolve(event.data.blob);
      } else {
        reject(new Error(event.data.message || "The render worker could not create an image."));
      }
    });
    worker.addEventListener("error", () => {
      cleanUp();
      reject(new Error("The render worker stopped unexpectedly."));
    });

    try {
      const bitmap = await createImageBitmap(entry.file);
      worker.postMessage({ type: "render", id, bitmap, options }, [bitmap]);
    } catch (error) {
      cleanUp();
      reject(error);
    }
  });
}

function loadHtmlImage(file: File) {
  const source = URL.createObjectURL(file);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(source);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error(`Could not decode ${file.name}.`));
    };
    image.src = source;
  });
}

async function loadLogo(source: string) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error("The selected logo could not be loaded.");
  }

  const blob = await response.blob();
  if (typeof createImageBitmap !== "undefined") {
    return createImageBitmap(blob);
  }

  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected logo could not be decoded."));
    };
    image.src = url;
  });
}

function closeBitmap(image: CanvasImageSource | undefined) {
  if (image && "close" in image && typeof image.close === "function") {
    image.close();
  }
}

async function mainThreadRender(entry: PhotoEntry, options: WatermarkOptions) {
  const source =
    typeof createImageBitmap !== "undefined"
      ? await createImageBitmap(entry.file)
      : await loadHtmlImage(entry.file);
  const width = "width" in source ? source.width : source.naturalWidth;
  const height = "height" in source ? source.height : source.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    closeBitmap(source);
    throw new Error("Your browser cannot create a canvas for this image.");
  }

  let logo: CanvasImageSource | undefined;
  try {
    context.drawImage(source, 0, 0, width, height);
    if (options.logoSource) {
      try {
        logo = await loadLogo(options.logoSource);
      } catch {
        // A failed logo must not prevent the photo or editable EXIF from exporting.
      }
    }
    drawWatermark(context, width, height, options, logo);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Could not encode the watermarked image."))),
        "image/jpeg",
        0.92,
      );
    });
    return blob;
  } finally {
    closeBitmap(source);
    closeBitmap(logo);
  }
}

async function renderOne(entry: PhotoEntry, index: number, options: WatermarkOptions) {
  if (supportsWorkerRendering()) {
    try {
      return {
        id: entry.id,
        fileName: outputFileName(entry.file.name, index),
        blob: await workerRender(entry, options),
        usedWorker: true,
      } satisfies RenderedPhoto;
    } catch {
      // Safari and privacy-hardened browsers can expose the API but fail the transfer.
    }
  }

  return {
    id: entry.id,
    fileName: outputFileName(entry.file.name, index),
    blob: await mainThreadRender(entry, options),
    usedWorker: false,
  } satisfies RenderedPhoto;
}

export async function renderBatch(
  entries: PhotoEntry[],
  baseOptions: Omit<WatermarkOptions, "exif">,
  onProgress: (completed: number, total: number) => void,
): Promise<BatchResult> {
  const results = new Array<RenderedPhoto>(entries.length);
  const concurrency = renderConcurrency(entries.length);
  let nextIndex = 0;
  let completed = 0;

  async function run() {
    while (nextIndex < entries.length) {
      const index = nextIndex;
      nextIndex += 1;
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      results[index] = await renderOne(entry, index, { ...baseOptions, exif: entry.exif });
      completed += 1;
      onProgress(completed, entries.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => run()));
  const photos = results.filter((result): result is RenderedPhoto => Boolean(result));

  return {
    photos,
    fallbackCount: photos.filter((photo) => !photo.usedWorker).length,
    concurrency,
  };
}
