// Admin 导出画框的核心绘制：与 apps/main/src/watermark.ts 的底部信息条保持一致
// （黑底 + 原图 + 渐变信息条：首行焦距 + 曝光三要素，次行机型 + 镜头，左侧 logo 图/文字块）。
// 纯函数，接收任意 2D 上下文，供 worker 的 OffscreenCanvas 与主线程预览共用。

type RenderingContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

type DrawableImage = HTMLImageElement | ImageBitmap;

interface Palette {
  strip: string;
  stripFade: string;
  text: string;
  muted: string;
  logoBackground: string;
  logoText: string;
}

export interface FrameFields {
  /** 品牌名（当前绘制未单独使用，保留给上层与 main 对齐）。 */
  brand?: string;
  /** 第二行：机型 + 镜头。 */
  model?: string;
  lens?: string;
  /** 第一行：焦距 + 曝光三要素。 */
  focalLength?: string;
  exposure?: string;
}

export interface FrameLogo {
  name?: string;
  /** 无图时画的文字标（如 dk+）。 */
  mark?: string;
}

export const FRAME_OUTPUT_MIN_WIDTH = 1200;
export const FRAME_OUTPUT_MAX_WIDTH = 2400;

const stripMetadataSpacer = "  ";
const stripSecondarySpacer = "     ";
const primaryFontFamily =
  'Futura, "Futura PT", "Avenir Next", Avenir, ui-sans-serif, system-ui, sans-serif';
const monoFontFamily =
  '"Fira Code", "Fira Sans", ui-sans-serif, system-ui, sans-serif';

const palette: Palette = {
  strip: "rgba(9, 9, 11, 0.9)",
  stripFade: "rgba(9, 9, 11, 0)",
  text: "#fafafa",
  muted: "rgba(250, 250, 250, 0.78)",
  logoBackground: "#fafafa",
  logoText: "#09090b",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const frameFont = (size: number, weight = 600, family = monoFontFamily) =>
  `${weight} ${Math.round(size)}px ${family}`;

const fitText = (context: RenderingContext, value: string, maxWidth: number) => {
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

const naturalSize = (image: DrawableImage) => {
  if ("naturalWidth" in image) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  }
  return { width: image.width, height: image.height };
};

const drawAdaptiveLogo = (
  context: RenderingContext,
  image: DrawableImage,
  x: number,
  centerY: number,
  maxHeight: number,
  maxWidth: number,
) => {
  const natural = naturalSize(image);
  const ratio = Math.min(
    maxWidth / Math.max(natural.width, 1),
    maxHeight / Math.max(natural.height, 1),
  );
  const drawWidth = natural.width * ratio;
  const drawHeight = natural.height * ratio;
  context.drawImage(image, x, centerY - drawHeight / 2, drawWidth, drawHeight);
  return drawWidth;
};

const drawLogoMark = (
  context: RenderingContext,
  mark: string,
  x: number,
  centerY: number,
  height: number,
) => {
  const horizontalPadding = height * 0.42;
  context.font = frameFont(height * 0.36, 700);
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

/** 画框输出尺寸：按源图宽度 clamp 到 1200–2400，等比算高（与 main 一致）。 */
export const frameOutputSize = (sourceWidth: number, sourceHeight: number) => {
  const width = Math.round(
    clamp(sourceWidth || FRAME_OUTPUT_MAX_WIDTH, FRAME_OUTPUT_MIN_WIDTH, FRAME_OUTPUT_MAX_WIDTH),
  );
  const height = Math.round(width * (sourceHeight / (sourceWidth || 1)));
  return { width, height };
};

/**
 * 在已铺好目标尺寸的画布上绘制完整画框：黑底 → 原图 → 底部信息条。
 * logoBitmap 存在画图片 logo，否则有 mark 时画文字块，都没有则信息条占满宽度。
 */
export function drawFrameComposition(
  context: RenderingContext,
  canvasWidth: number,
  canvasHeight: number,
  image: DrawableImage,
  fields: FrameFields,
  logo?: { bitmap?: DrawableImage; mark?: string },
) {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#09090b";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

  const stripHeight = clamp(canvasHeight * 0.2, 132, 340);
  const stripY = canvasHeight - stripHeight;
  const paddingX = clamp(canvasWidth * 0.036, 36, 96);
  const hasLogo = Boolean(logo?.bitmap || logo?.mark);

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

  if (hasLogo) {
    const logoMaxHeight = clamp(stripHeight * 0.45, 48, 132);
    const logoMaxWidth = clamp(canvasWidth * 0.2, 120, 380);
    const logoX = paddingX;
    const logoCenterY = stripY + stripHeight * 0.56;
    const logoWidth = logo?.bitmap
      ? drawAdaptiveLogo(
          context,
          logo.bitmap,
          logoX,
          logoCenterY,
          logoMaxHeight,
          logoMaxWidth,
        )
      : drawLogoMark(context, logo?.mark ?? "", logoX, logoCenterY, logoMaxHeight);
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

  const metadataSize = clamp(canvasWidth * 0.018, 20, 42);
  const firstRow = [fields.focalLength, fields.exposure]
    .filter(Boolean)
    .join(stripMetadataSpacer);
  const secondRow = [fields.model, fields.lens]
    .filter(Boolean)
    .join(stripSecondarySpacer);

  context.textAlign = "left";
  context.textBaseline = "middle";
  if (firstRow) {
    context.font = frameFont(metadataSize, 400, primaryFontFamily);
    context.fillStyle = palette.text;
    context.fillText(
      fitText(context, firstRow, textWidth),
      textX,
      stripY + stripHeight * (secondRow ? 0.48 : 0.56),
    );
  }
  if (secondRow) {
    context.font = frameFont(metadataSize, 300);
    context.fillStyle = palette.muted;
    context.fillText(
      fitText(context, secondRow, textWidth),
      textX,
      stripY + stripHeight * 0.7,
    );
  }
}
