import type { DrawWatermarkPayload } from "./types";

type RenderingContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

const marginRatio = 0.03;

export const WATERMARK_POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export const blendModeToComposite = (
  blendMode: DrawWatermarkPayload["blendMode"],
): GlobalCompositeOperation => (blendMode === "overlay" ? "overlay" : "source-over");

/**
 * 在已绘制原图的画布上叠加 logo 水印。
 * logo 为空时保持画布不变，调用方无需自行判断。
 */
export function drawLogoWatermark(
  context: RenderingContext,
  width: number,
  height: number,
  payload: DrawWatermarkPayload,
  logo?: CanvasImageSource,
) {
  if (!logo) return;

  const natural = sourceSize(logo);
  if (!natural.width || !natural.height) return;

  const margin = Math.min(width, height) * marginRatio;
  const logoWidth = clamp(
    (width * payload.scalePercent) / 100,
    4,
    width - margin * 2,
  );
  const logoHeight = (logoWidth / natural.width) * natural.height;
  const { x, y } = positionToXY(payload.position, width, height, logoWidth, logoHeight, margin);

  context.save();
  context.globalAlpha = clamp(payload.opacity / 100, 0.05, 1);
  context.globalCompositeOperation = blendModeToComposite(payload.blendMode);
  context.drawImage(logo, x, y, logoWidth, logoHeight);
  context.restore();
}

function positionToXY(
  position: DrawWatermarkPayload["position"],
  width: number,
  height: number,
  logoWidth: number,
  logoHeight: number,
  margin: number,
) {
  const left = margin;
  const centerX = (width - logoWidth) / 2;
  const right = width - logoWidth - margin;
  const top = margin;
  const centerY = (height - logoHeight) / 2;
  const bottom = height - logoHeight - margin;

  switch (position) {
    case "top-left":
      return { x: left, y: top };
    case "top":
      return { x: centerX, y: top };
    case "top-right":
      return { x: right, y: top };
    case "left":
      return { x: left, y: centerY };
    case "center":
      return { x: centerX, y: centerY };
    case "right":
      return { x: right, y: centerY };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom":
      return { x: centerX, y: bottom };
    case "bottom-right":
      return { x: right, y: bottom };
  }
}

function sourceSize(source: CanvasImageSource) {
  if ("naturalWidth" in source && "naturalHeight" in source) {
    return {
      width: Number(source.naturalWidth),
      height: Number(source.naturalHeight),
    };
  }
  if ("width" in source && "height" in source) {
    return { width: Number(source.width), height: Number(source.height) };
  }
  return { width: 0, height: 0 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
