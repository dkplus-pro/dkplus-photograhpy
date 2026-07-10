import { useEffect, useRef, useState } from "react";
import { drawWatermark } from "./canvas";
import type { PhotoEntry } from "./types";

interface LiveWatermarkPreviewProps {
  photo: PhotoEntry | null;
  watermarkText: string;
  opacity: number;
  logoSource: string | null;
}

type PreviewState = "empty" | "loading" | "ready" | "error";

const maximumPreviewDimension = 1600;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法用于预览。"));
    image.src = source;
  });
}

function previewDimensions(image: HTMLImageElement) {
  const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maximumPreviewDimension / largestDimension);

  return {
    width: Math.max(1, Math.round(image.naturalWidth * scale)),
    height: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

export function LiveWatermarkPreview({
  photo,
  watermarkText,
  opacity,
  logoSource,
}: LiveWatermarkPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("empty");

  useEffect(() => {
    let active = true;

    if (!photo) {
      setPreviewState("empty");
      return () => {
        active = false;
      };
    }

    const renderPreview = async () => {
      setPreviewState("loading");

      try {
        const image = await loadImage(photo.previewUrl);
        let logo: HTMLImageElement | undefined;
        if (logoSource) {
          try {
            logo = await loadImage(logoSource);
          } catch {
            // Keep the preview useful when an imported logo cannot be read locally.
          }
        }

        if (!active || !canvasRef.current) {
          return;
        }

        const { width, height } = previewDimensions(image);
        const context = canvasRef.current.getContext("2d");
        if (!context) {
          throw new Error("当前浏览器无法创建预览画布。 ");
        }

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        context.drawImage(image, 0, 0, width, height);
        drawWatermark(
          context,
          width,
          height,
          {
            text: watermarkText.trim() || "dk+ photography",
            opacity,
            logoSource,
            exif: photo.exif,
          },
          logo,
        );
        setPreviewState("ready");
      } catch {
        if (active) {
          setPreviewState("error");
        }
      }
    };

    void renderPreview();
    return () => {
      active = false;
    };
  }, [logoSource, opacity, photo, watermarkText]);

  return (
    <section aria-labelledby="preview-heading" className="panel live-preview">
      <div className="section-heading preview-heading">
        <div>
          <p className="step">03 / 实时预览</p>
          <h2 id="preview-heading">水印效果</h2>
        </div>
        {photo ? <span className="preview-file-name">{photo.file.name}</span> : null}
      </div>

      {photo ? (
        <div className="preview-stage" aria-busy={previewState === "loading"}>
          <canvas
            aria-label={`${photo.file.name} 的实时水印预览`}
            className="preview-canvas"
            ref={canvasRef}
            role="img"
          />
          {previewState === "loading" ? (
            <span className="preview-status">正在生成实时预览…</span>
          ) : null}
          {previewState === "error" ? (
            <p className="preview-error" role="alert">
              无法生成此照片的实时预览。你仍可调整设置并导出完整批次。
            </p>
          ) : null}
        </div>
      ) : (
        <div className="preview-empty-state">
          <strong>尚未选择预览照片。</strong>
          <span>上传照片后，选择一张照片即可实时查看水印效果。</span>
        </div>
      )}
    </section>
  );
}
