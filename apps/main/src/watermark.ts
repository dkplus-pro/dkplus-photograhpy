export type WatermarkTone = "black" | "white";

export interface WatermarkLogoInput {
  name: string;
  mark: string;
  url?: string | undefined;
}

export interface WatermarkRenderInput {
  imageUrl: string;
  imageWidth?: number | undefined;
  imageHeight?: number | undefined;
  title: string;
  tone: WatermarkTone;
  logo: WatermarkLogoInput;
  date?: string | undefined;
  model?: string | undefined;
  exposure?: string | undefined;
}

export interface WatermarkRenderResult {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  renderer: "worker" | "main-thread";
}

type DrawableImage = HTMLImageElement | ImageBitmap;

type Palette = {
  strip: string;
  text: string;
  muted: string;
  separator: string;
  logoBackground: string;
  logoText: string;
};

const outputMinWidth = 1200;
const outputMaxWidth = 2400;
const workerTimeoutMs = 4200;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const paletteForTone = (tone: WatermarkTone): Palette =>
  tone === "black"
    ? {
        strip: "rgba(9, 9, 11, 0.9)",
        text: "#fafafa",
        muted: "rgba(250, 250, 250, 0.76)",
        separator: "rgba(250, 250, 250, 0.36)",
        logoBackground: "#fafafa",
        logoText: "#09090b",
      }
    : {
        strip: "rgba(250, 250, 250, 0.92)",
        text: "#09090b",
        muted: "rgba(9, 9, 11, 0.68)",
        separator: "rgba(9, 9, 11, 0.24)",
        logoBackground: "#09090b",
        logoText: "#fafafa",
      };

const watermarkFont = (size: number, weight = 600): string =>
  `${weight} ${Math.round(size)}px "Fira Code", "Fira Sans", sans-serif`;

const fitText = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string => {
  const normalized = value.trim();
  if (!normalized || context.measureText(normalized).width <= maxWidth) {
    return normalized;
  }

  let candidate = normalized;
  while (candidate.length > 1) {
    candidate = candidate.slice(0, -1);
    const truncated = `${candidate}…`;
    if (context.measureText(truncated).width <= maxWidth) return truncated;
  }
  return "…";
};

const imageNaturalSize = (image: DrawableImage) => {
  if ("naturalWidth" in image) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  }
  return { width: image.width, height: image.height };
};

const drawContainedImage = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: DrawableImage,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const natural = imageNaturalSize(image);
  const ratio = Math.min(width / natural.width, height / natural.height);
  const drawWidth = natural.width * ratio;
  const drawHeight = natural.height * ratio;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
};

const drawLogoMark = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  mark: string,
  x: number,
  y: number,
  size: number,
  palette: Palette,
) => {
  context.fillStyle = palette.logoBackground;
  context.fillRect(x, y, size, size);
  context.fillStyle = palette.logoText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = watermarkFont(size * 0.26, 700);
  context.fillText(
    fitText(context, mark || "dk+", size * 0.76),
    x + size / 2,
    y + size / 2,
  );
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("图片加载失败，可能是跨域或资源不可用"));
    image.src = url;
  });

const loadOptionalLogo = async (
  url?: string,
): Promise<HTMLImageElement | undefined> => {
  if (!url) return undefined;
  try {
    return await loadImage(url);
  } catch {
    return undefined;
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("水印画布导出失败"));
    }, "image/png");
  });

const drawWatermarkComposition = async (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  image: DrawableImage,
  input: WatermarkRenderInput,
  logoImage?: DrawableImage,
) => {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#09090b";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

  const palette = paletteForTone(input.tone);
  const stripHeight = clamp(canvasHeight * 0.16, 112, 260);
  const stripY = canvasHeight - stripHeight;
  const paddingX = clamp(canvasWidth * 0.036, 36, 96);
  const paddingY = clamp(stripHeight * 0.22, 22, 48);
  const logoSize = stripHeight - paddingY * 2;
  const logoX = paddingX;
  const logoY = stripY + paddingY;
  const separatorX = logoX + logoSize + paddingX * 0.45;
  const textX = separatorX + paddingX * 0.45;
  const textWidth = canvasWidth - textX - paddingX;

  context.fillStyle = palette.strip;
  context.fillRect(0, stripY, canvasWidth, stripHeight);

  if (logoImage) {
    context.fillStyle = palette.logoBackground;
    context.fillRect(logoX, logoY, logoSize, logoSize);
    drawContainedImage(
      context,
      logoImage,
      logoX + logoSize * 0.16,
      logoY + logoSize * 0.16,
      logoSize * 0.68,
      logoSize * 0.68,
    );
  } else {
    drawLogoMark(context, input.logo.mark, logoX, logoY, logoSize, palette);
  }

  context.fillStyle = palette.separator;
  context.fillRect(
    separatorX,
    logoY,
    Math.max(2, canvasWidth * 0.0012),
    logoSize,
  );

  const titleSize = clamp(canvasWidth * 0.024, 24, 50);
  const metaSize = clamp(canvasWidth * 0.0125, 14, 26);
  const eyebrowSize = clamp(canvasWidth * 0.0095, 11, 18);
  const brandLabel = input.logo.name || "DKPLUS";
  const meta = [input.date, input.model, input.exposure]
    .filter(Boolean)
    .join("   ·   ");

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = watermarkFont(eyebrowSize, 700);
  context.fillStyle = palette.muted;
  context.fillText(
    fitText(context, brandLabel.toUpperCase(), textWidth),
    textX,
    stripY + paddingY + eyebrowSize,
  );

  context.font = watermarkFont(titleSize, 700);
  context.fillStyle = palette.text;
  context.fillText(
    fitText(context, input.title || "DKPLUS PHOTOGRAPHY", textWidth),
    textX,
    stripY + stripHeight * 0.55,
  );

  if (meta) {
    context.font = watermarkFont(metaSize, 500);
    context.fillStyle = palette.muted;
    context.fillText(
      fitText(context, meta, textWidth),
      textX,
      stripY + stripHeight - paddingY,
    );
  }
};

const renderWatermarkOnMainThread = async (
  input: WatermarkRenderInput,
): Promise<WatermarkRenderResult> => {
  const image = await loadImage(input.imageUrl);
  const natural = imageNaturalSize(image);
  const sourceWidth = natural.width || input.imageWidth || 1600;
  const sourceHeight = natural.height || input.imageHeight || 1000;
  const outputWidth = Math.round(
    clamp(sourceWidth, outputMinWidth, outputMaxWidth),
  );
  const outputHeight = Math.round(outputWidth * (sourceHeight / sourceWidth));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 2D 渲染");

  const logoImage = await loadOptionalLogo(input.logo.url);
  await drawWatermarkComposition(
    context,
    outputWidth,
    outputHeight,
    image,
    input,
    logoImage,
  );
  const blob = await canvasToBlob(canvas);
  return {
    url: URL.createObjectURL(blob),
    blob,
    width: outputWidth,
    height: outputHeight,
    renderer: "main-thread",
  };
};

const workerSource = String.raw`
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const paletteForTone = (tone) => tone === "black" ? {
  strip: "rgba(9, 9, 11, 0.9)", text: "#fafafa", muted: "rgba(250, 250, 250, 0.76)", separator: "rgba(250, 250, 250, 0.36)", logoBackground: "#fafafa", logoText: "#09090b"
} : {
  strip: "rgba(250, 250, 250, 0.92)", text: "#09090b", muted: "rgba(9, 9, 11, 0.68)", separator: "rgba(9, 9, 11, 0.24)", logoBackground: "#09090b", logoText: "#fafafa"
};
const watermarkFont = (size, weight = 600) => Math.round(size) + 'px "Fira Code", "Fira Sans", sans-serif';
const fitText = (context, value, maxWidth) => {
  const normalized = String(value || "").trim();
  if (!normalized || context.measureText(normalized).width <= maxWidth) return normalized;
  let candidate = normalized;
  while (candidate.length > 1) {
    candidate = candidate.slice(0, -1);
    const truncated = candidate + "…";
    if (context.measureText(truncated).width <= maxWidth) return truncated;
  }
  return "…";
};
const loadBitmap = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('图片加载失败：' + response.status);
  return createImageBitmap(await response.blob());
};
const drawContainedImage = (context, image, x, y, width, height) => {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
};
const drawLogoMark = (context, mark, x, y, size, palette) => {
  context.fillStyle = palette.logoBackground;
  context.fillRect(x, y, size, size);
  context.fillStyle = palette.logoText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '700 ' + watermarkFont(size * 0.26);
  context.fillText(fitText(context, mark || "dk+", size * 0.76), x + size / 2, y + size / 2);
};
self.onmessage = async (event) => {
  const input = event.data;
  try {
    const image = await loadBitmap(input.imageUrl);
    let logoImage;
    if (input.logo && input.logo.url) {
      try { logoImage = await loadBitmap(input.logo.url); } catch {}
    }
    const sourceWidth = image.width || input.imageWidth || 1600;
    const sourceHeight = image.height || input.imageHeight || 1000;
    const width = Math.round(clamp(sourceWidth, 1200, 2400));
    const height = Math.round(width * (sourceHeight / sourceWidth));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OffscreenCanvas 2D is unavailable");
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#09090b";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const palette = paletteForTone(input.tone);
    const stripHeight = clamp(height * 0.16, 112, 260);
    const stripY = height - stripHeight;
    const paddingX = clamp(width * 0.036, 36, 96);
    const paddingY = clamp(stripHeight * 0.22, 22, 48);
    const logoSize = stripHeight - paddingY * 2;
    const logoX = paddingX;
    const logoY = stripY + paddingY;
    const separatorX = logoX + logoSize + paddingX * 0.45;
    const textX = separatorX + paddingX * 0.45;
    const textWidth = width - textX - paddingX;
    context.fillStyle = palette.strip;
    context.fillRect(0, stripY, width, stripHeight);
    if (logoImage) {
      context.fillStyle = palette.logoBackground;
      context.fillRect(logoX, logoY, logoSize, logoSize);
      drawContainedImage(context, logoImage, logoX + logoSize * 0.16, logoY + logoSize * 0.16, logoSize * 0.68, logoSize * 0.68);
    } else {
      drawLogoMark(context, input.logo && input.logo.mark, logoX, logoY, logoSize, palette);
    }
    context.fillStyle = palette.separator;
    context.fillRect(separatorX, logoY, Math.max(2, width * 0.0012), logoSize);
    const titleSize = clamp(width * 0.024, 24, 50);
    const metaSize = clamp(width * 0.0125, 14, 26);
    const eyebrowSize = clamp(width * 0.0095, 11, 18);
    const brandLabel = (input.logo && input.logo.name) || "DKPLUS";
    const meta = [input.date, input.model, input.exposure].filter(Boolean).join("   ·   ");
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.font = '700 ' + watermarkFont(eyebrowSize);
    context.fillStyle = palette.muted;
    context.fillText(fitText(context, brandLabel.toUpperCase(), textWidth), textX, stripY + paddingY + eyebrowSize);
    context.font = '700 ' + watermarkFont(titleSize);
    context.fillStyle = palette.text;
    context.fillText(fitText(context, input.title || "DKPLUS PHOTOGRAPHY", textWidth), textX, stripY + stripHeight * 0.55);
    if (meta) {
      context.font = '500 ' + watermarkFont(metaSize);
      context.fillStyle = palette.muted;
      context.fillText(fitText(context, meta, textWidth), textX, stripY + stripHeight - paddingY);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    image.close && image.close();
    logoImage && logoImage.close && logoImage.close();
    self.postMessage({ ok: true, blob, width, height });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
  }
};
`;

const renderWatermarkInWorker = (
  input: WatermarkRenderInput,
): Promise<WatermarkRenderResult> =>
  new Promise((resolve, reject) => {
    if (
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      typeof URL === "undefined" ||
      typeof Blob === "undefined"
    ) {
      reject(new Error("Offscreen worker rendering is unavailable"));
      return;
    }

    const sourceUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
    const worker = new Worker(sourceUrl);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("Offscreen worker rendering timed out"));
    }, workerTimeoutMs);

    worker.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(sourceUrl);
      const data = event.data as
        | { ok: true; blob: Blob; width: number; height: number }
        | { ok: false; error: string };
      if (!data.ok) {
        reject(new Error(data.error));
        return;
      }
      resolve({
        url: URL.createObjectURL(data.blob),
        blob: data.blob,
        width: data.width,
        height: data.height,
        renderer: "worker",
      });
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(sourceUrl);
      reject(new Error(event.message || "Offscreen worker rendering failed"));
    };
    worker.postMessage(input);
  });

export const renderWatermarkExport = async (
  input: WatermarkRenderInput,
): Promise<WatermarkRenderResult> => {
  try {
    return await renderWatermarkInWorker(input);
  } catch {
    return renderWatermarkOnMainThread(input);
  }
};
