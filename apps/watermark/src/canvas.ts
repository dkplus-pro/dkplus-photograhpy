import type { WatermarkOptions } from "./types";

type RenderingContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type Palette = {
  strip: string;
  stripFade: string;
  text: string;
  muted: string;
  logoBackground: string;
  logoText: string;
};

const watermarkMetadataSpacer = "  ";
const watermarkSecondarySpacer = "     ";
const watermarkPrimaryFontFamily =
  'Futura, "Futura PT", "Avenir Next", Avenir, ui-sans-serif, system-ui, sans-serif';
const watermarkFontFamily =
  '"Fira Code", "Fira Sans", ui-sans-serif, system-ui, sans-serif';

const watermarkPalette: Palette = {
  strip: "rgba(9, 9, 11, 0.9)",
  stripFade: "rgba(9, 9, 11, 0)",
  text: "#fafafa",
  muted: "rgba(250, 250, 250, 0.78)",
  logoBackground: "#fafafa",
  logoText: "#09090b",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const watermarkFont = (
  size: number,
  weight = 600,
  family = watermarkFontFamily,
) => `${weight} ${Math.round(size)}px ${family}`;

function sourceSize(source: CanvasImageSource) {
  if ("naturalWidth" in source && "naturalHeight" in source) {
    return {
      width: Number(source.naturalWidth),
      height: Number(source.naturalHeight),
    };
  }

  if ("videoWidth" in source && "videoHeight" in source) {
    return {
      width: Number(source.videoWidth),
      height: Number(source.videoHeight),
    };
  }

  if ("width" in source && "height" in source) {
    return { width: Number(source.width), height: Number(source.height) };
  }

  return { width: 1, height: 1 };
}

function fitText(context: RenderingContext, value: string, maxWidth: number) {
  const normalized = value.trim();
  if (!normalized || context.measureText(normalized).width <= maxWidth) {
    return normalized;
  }

  let candidate = normalized;
  while (candidate.length > 1) {
    candidate = candidate.slice(0, -1);
    const truncated = `${candidate}…`;
    if (context.measureText(truncated).width <= maxWidth) {
      return truncated;
    }
  }
  return "…";
}

function drawAdaptiveLogoImage(
  context: RenderingContext,
  image: CanvasImageSource,
  x: number,
  centerY: number,
  maxHeight: number,
  maxWidth: number,
) {
  const natural = sourceSize(image);
  const ratio = Math.min(
    maxWidth / Math.max(natural.width, 1),
    maxHeight / Math.max(natural.height, 1),
  );
  const drawWidth = natural.width * ratio;
  const drawHeight = natural.height * ratio;
  context.drawImage(image, x, centerY - drawHeight / 2, drawWidth, drawHeight);
  return drawWidth;
}

function drawLogoMark(
  context: RenderingContext,
  mark: string,
  x: number,
  centerY: number,
  height: number,
) {
  const horizontalPadding = height * 0.42;
  context.font = watermarkFont(height * 0.36, 700);
  const normalizedMark = fitText(context, mark || "dk+", height * 2.4);
  const markWidth = clamp(
    context.measureText(normalizedMark).width + horizontalPadding * 2,
    height * 1.15,
    height * 3.2,
  );
  context.fillStyle = watermarkPalette.logoBackground;
  context.fillRect(x, centerY - height / 2, markWidth, height);
  context.fillStyle = watermarkPalette.logoText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(normalizedMark, x + markWidth / 2, centerY);
  return markWidth;
}

export function drawWatermark(
  context: RenderingContext,
  width: number,
  height: number,
  options: WatermarkOptions,
  logo?: CanvasImageSource,
) {
  const stripHeight = clamp(height * 0.2, 132, 340);
  const stripY = height - stripHeight;
  const paddingX = clamp(width * 0.036, 36, 96);
  const hasLogo = Boolean(options.logoSource);
  const overlayGradient = context.createLinearGradient(0, height, 0, stripY);
  overlayGradient.addColorStop(0, watermarkPalette.strip);
  overlayGradient.addColorStop(1, watermarkPalette.stripFade);

  context.save();
  context.fillStyle = overlayGradient;
  context.fillRect(0, stripY, width, stripHeight);

  let textX = paddingX;
  let textWidth = width - paddingX * 2;

  if (hasLogo) {
    const logoMaxHeight = clamp(stripHeight * 0.45, 48, 132);
    const logoMaxWidth = clamp(width * 0.2, 120, 380);
    const logoX = paddingX;
    const logoCenterY = stripY + stripHeight * 0.56;
    const logoWidth = logo
      ? drawAdaptiveLogoImage(
          context,
          logo,
          logoX,
          logoCenterY,
          logoMaxHeight,
          logoMaxWidth,
        )
      : drawLogoMark(context, options.text, logoX, logoCenterY, logoMaxHeight);
    const dividerGap = clamp(paddingX * 0.54, 28, 56);
    const dividerX = logoX + logoWidth + dividerGap;
    context.save();
    context.strokeStyle = watermarkPalette.muted;
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

  const metadataSize = clamp(width * 0.018, 20, 42);
  const firstRow = [options.exif.focalLength, options.exif.exposure]
    .filter(Boolean)
    .join(watermarkMetadataSpacer);
  const secondRow = [options.exif.model, options.exif.lens]
    .filter(Boolean)
    .join(watermarkSecondarySpacer);

  context.textAlign = "left";
  context.textBaseline = "middle";
  if (firstRow) {
    context.font = watermarkFont(metadataSize, 400, watermarkPrimaryFontFamily);
    context.fillStyle = watermarkPalette.text;
    context.fillText(
      fitText(context, firstRow, textWidth),
      textX,
      stripY + stripHeight * (secondRow ? 0.48 : 0.56),
    );
  }
  if (secondRow) {
    context.font = watermarkFont(metadataSize, 300);
    context.fillStyle = watermarkPalette.muted;
    context.fillText(
      fitText(context, secondRow, textWidth),
      textX,
      stripY + stripHeight * 0.7,
    );
  }

  context.restore();
}
