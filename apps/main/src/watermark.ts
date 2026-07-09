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
  tone: WatermarkTone;
  logo?: WatermarkLogoInput | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  lens?: string | undefined;
  focalLength?: string | undefined;
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
  stripFade: string;
  text: string;
  muted: string;
  logoBackground: string;
  logoText: string;
};

const outputMinWidth = 1200;
const outputMaxWidth = 2400;
const workerTimeoutMs = 4200;
const watermarkMetadataSpacer = "  ";
const watermarkSecondarySpacer = "     ";
const watermarkPrimaryFontFamily =
  'Futura, "Futura PT", "Avenir Next", Avenir, ui-sans-serif, system-ui, sans-serif';
const watermarkFontFamily =
  '"Fira Code", "Fira Sans", ui-sans-serif, system-ui, sans-serif';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const paletteForTone = (tone: WatermarkTone): Palette =>
  tone === "black"
    ? {
        strip: "rgba(9, 9, 11, 0.9)",
        stripFade: "rgba(9, 9, 11, 0)",
        text: "#fafafa",
        muted: "rgba(250, 250, 250, 0.78)",
        logoBackground: "#fafafa",
        logoText: "#09090b",
      }
    : {
        strip: "rgba(250, 250, 250, 0.92)",
        stripFade: "rgba(250, 250, 250, 0)",
        text: "#09090b",
        muted: "rgba(9, 9, 11, 0.7)",
        logoBackground: "#09090b",
        logoText: "#fafafa",
      };

const watermarkFont = (
  size: number,
  weight = 600,
  family = watermarkFontFamily,
): string => `${weight} ${Math.round(size)}px ${family}`;

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

const drawAdaptiveLogoImage = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: DrawableImage,
  x: number,
  centerY: number,
  maxHeight: number,
  maxWidth: number,
): number => {
  const natural = imageNaturalSize(image);
  const ratio = Math.min(maxWidth / natural.width, maxHeight / natural.height);
  const drawWidth = natural.width * ratio;
  const drawHeight = natural.height * ratio;
  context.drawImage(image, x, centerY - drawHeight / 2, drawWidth, drawHeight);
  return drawWidth;
};

const drawLogoMark = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  mark: string,
  x: number,
  centerY: number,
  height: number,
  palette: Palette,
): number => {
  const horizontalPadding = height * 0.42;
  context.font = watermarkFont(height * 0.36, 700);
  const normalizedMark = fitText(context, mark || "dk+", height * 2.4);
  const markWidth = clamp(
    context.measureText(normalizedMark).width + horizontalPadding * 2,
    height * 1.15,
    height * 3.2,
  );
  context.fillStyle = palette.logoBackground;
  context.fillRect(x, centerY - height / 2, markWidth, height);
  context.fillStyle = palette.logoText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(normalizedMark, x + markWidth / 2, centerY);
  return markWidth;
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
  const stripHeight = clamp(canvasHeight * 0.2, 132, 340);
  const stripY = canvasHeight - stripHeight;
  const paddingX = clamp(canvasWidth * 0.036, 36, 96);
  const hasLogo = Boolean(input.logo);

  const overlayGradient = context.createLinearGradient(
    0,
    canvasHeight,
    0,
    stripY,
  );
  overlayGradient.addColorStop(0, palette.strip);
  overlayGradient.addColorStop(1, palette.stripFade);
  context.fillStyle = overlayGradient;
  context.fillRect(0, stripY, canvasWidth, stripHeight);

  let textX = paddingX;
  let textWidth = canvasWidth - paddingX * 2;

  if (hasLogo && input.logo) {
    const logoMaxHeight = clamp(stripHeight * 0.45, 48, 132);
    const logoMaxWidth = clamp(canvasWidth * 0.2, 120, 380);
    const logoX = paddingX;
    const logoCenterY = stripY + stripHeight * 0.56;
    const logoWidth = logoImage
      ? drawAdaptiveLogoImage(
          context,
          logoImage,
          logoX,
          logoCenterY,
          logoMaxHeight,
          logoMaxWidth,
        )
      : drawLogoMark(
          context,
          input.logo.mark,
          logoX,
          logoCenterY,
          logoMaxHeight,
          palette,
        );
    const dividerGap = clamp(paddingX * 0.54, 28, 56);
    const dividerX = logoX + logoWidth + dividerGap;
    context.save();
    context.strokeStyle = palette.muted;
    context.globalAlpha = 0.55;
    context.lineWidth = clamp(canvasWidth * 0.0012, 1, 3);
    context.beginPath();
    context.moveTo(dividerX, stripY + stripHeight * 0.4);
    context.lineTo(dividerX, stripY + stripHeight * 0.7);
    context.stroke();
    context.restore();
    textX = dividerX + dividerGap;
    textWidth = canvasWidth - textX - paddingX;
  }

  const primarySize = clamp(canvasWidth * 0.018, 20, 42);
  const secondarySize = clamp(canvasWidth * 0.014, 15, 30);
  const firstRow = [input.focalLength, input.exposure]
    .filter(Boolean)
    .join(watermarkMetadataSpacer);
  const secondRow = [input.model, input.lens]
    .filter(Boolean)
    .join(watermarkSecondarySpacer);

  context.textAlign = "left";
  context.textBaseline = "middle";
  if (firstRow) {
    context.font = watermarkFont(primarySize, 400, watermarkPrimaryFontFamily);
    context.fillStyle = palette.text;
    context.fillText(
      fitText(context, firstRow, textWidth),
      textX,
      stripY + stripHeight * (secondRow ? 0.52 : 0.56),
    );
  }
  if (secondRow) {
    context.font = watermarkFont(secondarySize, 300);
    context.fillStyle = palette.muted;
    context.fillText(
      fitText(context, secondRow, textWidth),
      textX,
      stripY + stripHeight * 0.64,
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

  const logoImage = await loadOptionalLogo(input.logo?.url);
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
  strip: "rgba(9, 9, 11, 0.9)", stripFade: "rgba(9, 9, 11, 0)", text: "#fafafa", muted: "rgba(250, 250, 250, 0.78)", logoBackground: "#fafafa", logoText: "#09090b"
} : {
  strip: "rgba(250, 250, 250, 0.92)", stripFade: "rgba(250, 250, 250, 0)", text: "#09090b", muted: "rgba(9, 9, 11, 0.7)", logoBackground: "#09090b", logoText: "#fafafa"
};
const watermarkMetadataSpacer = "  ";
const watermarkSecondarySpacer = "     ";
const watermarkPrimaryFontFamily = 'Futura, "Futura PT", "Avenir Next", Avenir, ui-sans-serif, system-ui, sans-serif';
const watermarkFontFamily = '"Fira Code", "Fira Sans", ui-sans-serif, system-ui, sans-serif';
const watermarkFont = (size, weight = 600, family = watermarkFontFamily) => weight + ' ' + Math.round(size) + 'px ' + family;
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
const drawAdaptiveLogoImage = (context, image, x, centerY, maxHeight, maxWidth) => {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  context.drawImage(image, x, centerY - drawHeight / 2, drawWidth, drawHeight);
  return drawWidth;
};
const drawLogoMark = (context, mark, x, centerY, height, palette) => {
  const horizontalPadding = height * 0.42;
  context.font = watermarkFont(height * 0.36, 700);
  const normalizedMark = fitText(context, mark || "dk+", height * 2.4);
  const markWidth = clamp(context.measureText(normalizedMark).width + horizontalPadding * 2, height * 1.15, height * 3.2);
  context.fillStyle = palette.logoBackground;
  context.fillRect(x, centerY - height / 2, markWidth, height);
  context.fillStyle = palette.logoText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(normalizedMark, x + markWidth / 2, centerY);
  return markWidth;
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
    const stripHeight = clamp(height * 0.2, 132, 340);
    const stripY = height - stripHeight;
    const paddingX = clamp(width * 0.036, 36, 96);
    const overlayGradient = context.createLinearGradient(0, height, 0, stripY);
    overlayGradient.addColorStop(0, palette.strip);
    overlayGradient.addColorStop(1, palette.stripFade);
    context.fillStyle = overlayGradient;
    context.fillRect(0, stripY, width, stripHeight);
    let textX = paddingX;
    let textWidth = width - paddingX * 2;
    if (input.logo) {
      const logoMaxHeight = clamp(stripHeight * 0.45, 48, 132);
      const logoMaxWidth = clamp(width * 0.2, 120, 380);
      const logoX = paddingX;
      const logoCenterY = stripY + stripHeight * 0.56;
      const logoWidth = logoImage
        ? drawAdaptiveLogoImage(context, logoImage, logoX, logoCenterY, logoMaxHeight, logoMaxWidth)
        : drawLogoMark(context, input.logo.mark, logoX, logoCenterY, logoMaxHeight, palette);
      const dividerGap = clamp(paddingX * 0.54, 28, 56);
      const dividerX = logoX + logoWidth + dividerGap;
      context.save();
      context.strokeStyle = palette.muted;
      context.globalAlpha = 0.55;
      context.lineWidth = clamp(width * 0.0012, 1, 3);
      context.beginPath();
      context.moveTo(dividerX, stripY + stripHeight * 0.4);
      context.lineTo(dividerX, stripY + stripHeight * 0.7);
      context.stroke();
      context.restore();
      textX = dividerX + dividerGap;
      textWidth = width - textX - paddingX;
    }
    const primarySize = clamp(width * 0.018, 20, 42);
    const secondarySize = clamp(width * 0.014, 15, 30);
    const firstRow = [input.focalLength, input.exposure].filter(Boolean).join(watermarkMetadataSpacer);
    const secondRow = [input.model, input.lens].filter(Boolean).join(watermarkSecondarySpacer);
    context.textAlign = "left";
    context.textBaseline = "middle";
    if (firstRow) {
      context.font = watermarkFont(primarySize, 400, watermarkPrimaryFontFamily);
      context.fillStyle = palette.text;
      context.fillText(fitText(context, firstRow, textWidth), textX, stripY + stripHeight * (secondRow ? 0.52 : 0.56));
    }
    if (secondRow) {
      context.font = watermarkFont(secondarySize, 300);
      context.fillStyle = palette.muted;
      context.fillText(fitText(context, secondRow, textWidth), textX, stripY + stripHeight * 0.64);
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
