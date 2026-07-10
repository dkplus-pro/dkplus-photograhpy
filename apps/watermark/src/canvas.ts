import { exifLines } from "./metadata";
import type { WatermarkOptions } from "./types";

type RenderingContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function sourceSize(source: CanvasImageSource) {
  if ("naturalWidth" in source && "naturalHeight" in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }

  if ("videoWidth" in source && "videoHeight" in source) {
    return { width: source.videoWidth, height: source.videoHeight };
  }

  if ("width" in source && "height" in source) {
    return { width: source.width, height: source.height };
  }

  return { width: 1, height: 1 };
}

function drawLogo(
  context: RenderingContext,
  logo: CanvasImageSource,
  width: number,
  baseline: number,
  gap: number,
) {
  const source = sourceSize(logo);
  const logoHeight = Math.max(28, Math.min(width * 0.075, 80));
  const logoWidth = Math.min(width * 0.24, (source.width / source.height) * logoHeight);
  const y = baseline - logoHeight;

  context.drawImage(logo, width - gap - logoWidth, y, logoWidth, logoHeight);
}

export function drawWatermark(
  context: RenderingContext,
  width: number,
  height: number,
  options: WatermarkOptions,
  logo?: CanvasImageSource,
) {
  const padding = Math.max(20, Math.round(Math.min(width, height) * 0.03));
  const titleSize = Math.max(18, Math.round(Math.min(width, height) * 0.028));
  const metadataSize = Math.max(13, Math.round(titleSize * 0.68));
  const footerTop = Math.round(height * 0.64);
  const gradient = context.createLinearGradient(0, footerTop, 0, height);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.76)");

  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, footerTop, width, height - footerTop);
  context.globalAlpha = Math.max(0.15, Math.min(options.opacity, 1));
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = `600 ${titleSize}px ui-sans-serif, system-ui, sans-serif`;
  context.fillText(options.text, padding, height - padding);

  const lines = exifLines(options.exif);
  context.font = `400 ${metadataSize}px ui-sans-serif, system-ui, sans-serif`;
  const metadataBottom =
    height - padding - titleSize - Math.max(9, Math.round(titleSize * 0.35));
  lines.slice(0, 2).forEach((line, index) => {
    context.fillText(
      line,
      padding,
      metadataBottom - index * (metadataSize + 5),
    );
  });

  if (logo) {
    drawLogo(context, logo, width, height - padding, padding);
  }

  context.restore();
}
