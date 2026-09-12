import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Drawer,
  Grid,
  Message,
  Select,
  Spin,
} from "@arco-design/web-react";

const { Row, Col } = Grid;
const { Option, OptGroup } = Select;

import type { BrandRecord, PhotoRecord } from "../../types";
import {
  drawFrameComposition,
  frameOutputSize,
} from "./frame-drawing";
import { frameFieldsFromExif } from "./export-frames";
import type { ExportQuality, FrameSettings } from "./types";

export interface FrameExportDrawerProps {
  visible: boolean;
  photos: PhotoRecord[];
  brands: BrandRecord[];
  onCancel: () => void;
  onExport: (settings: FrameSettings) => void;
  isExporting: boolean;
}

interface LogoOption {
  id: string;
  name: string;
  source: string;
  mark: string;
}

const qualityOptions: { value: ExportQuality; full: string }[] = [
  { value: "high", full: "高 — 原像素 · JPEG 92%" },
  { value: "medium", full: "中 — CDN 缩至宽高 50%" },
  { value: "low", full: "低 — 20% 质量 · 体积最小" },
];

const qualitySummary: Record<ExportQuality, string> = {
  high: "高质量",
  medium: "中质量",
  low: "低质量",
};

const normalizeLogoMark = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return "dk+";
  const ascii = normalized.match(/[A-Za-z0-9+]/g)?.join("") ?? "";
  if (ascii) return ascii.slice(0, 4);
  return normalized.slice(0, 2);
};

const flattenBrandLogos = (brands: BrandRecord[]): LogoOption[] => {
  const options: LogoOption[] = [];
  const seen = new Set<string>();
  for (const brand of brands) {
    const brandName = brand.title || brand.name;
    for (const [index, logo] of (brand.logos ?? []).entries()) {
      const url = logo.url?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const label = logo.label || logo.alt;
      const name = `${brandName}${label ? ` · ${label}` : ""}`;
      options.push({
        id: logo.id || `${brand.id}-logo-${index + 1}`,
        name,
        source: url,
        mark: normalizeLogoMark(brand.name || brandName),
      });
    }
  }
  return options;
};

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("预览图加载失败"));
    image.src = src;
  });

export function FrameExportDrawer({
  visible,
  photos,
  brands,
  onCancel,
  onExport,
  isExporting,
}: FrameExportDrawerProps) {
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [logo, setLogo] = useState<LogoOption | null>(null);
  const [customLogos, setCustomLogos] = useState<LogoOption[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const brandLogos = useMemo(() => flattenBrandLogos(brands), [brands]);
  const previewPhoto = photos[0];
  const previewFields = useMemo(
    () => frameFieldsFromExif(previewPhoto?.exif),
    [previewPhoto],
  );

  useEffect(() => {
    if (!visible) return;
    setQuality("high");
    setLogo(null);
    setPreviewReady(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setPreviewSrc(null);
      return;
    }
    const raw =
      previewPhoto?.imageUrl || previewPhoto?.image?.url || previewPhoto?.thumbnailUrl;
    if (!raw) {
      setPreviewSrc(null);
      return;
    }
    const source = new URL(raw, window.location.href);
    if (
      /^https?:$/.test(source.protocol) &&
      !source.search.includes("imageMogr2")
    ) {
      source.searchParams.append("imageMogr2/thumbnail/!50p", "");
    }
    setPreviewSrc(source.toString());
  }, [visible, previewPhoto]);

  // 预览：与 worker 共用 drawFrameComposition，所见即所得。
  useEffect(() => {
    if (!visible || !previewSrc) return;
    let cancelled = false;
    setPreviewReady(false);
    void (async () => {
      try {
        const image = await loadImageElement(previewSrc);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const natural = { width: image.naturalWidth, height: image.naturalHeight };
        const size = frameOutputSize(natural.width, natural.height);
        // 预览按显示比例缩小，绘制缓冲不超过 1200 宽。
        const previewScale = Math.min(1, 1200 / size.width);
        canvas.width = Math.round(size.width * previewScale);
        canvas.height = Math.round(size.height * previewScale);
        let logoBitmap: HTMLImageElement | undefined;
        if (logo?.source) {
          try {
            logoBitmap = await loadImageElement(logo.source);
          } catch {
            Message.warning("Logo 加载失败，将以文字兜底。");
          }
        }
        if (cancelled) return;
        drawFrameComposition(
          context,
          canvas.width,
          canvas.height,
          image,
          previewFields,
          { bitmap: logoBitmap, mark: logo?.mark },
        );
        setPreviewReady(true);
      } catch {
        if (!cancelled)
          Message.error("预览图加载失败，请检查图片地址或 CDN 跨域配置。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSrc, previewFields, logo, visible]);

  const handleCustomUpload = (file: File) => {
    const source = URL.createObjectURL(file);
    const option: LogoOption = {
      id: `custom-${Date.now()}`,
      name: file.name,
      source,
      mark: normalizeLogoMark(file.name),
    };
    setCustomLogos((current) => [...current, option]);
    setLogo(option);
  };

  const selectLogo = (value: string) => {
    if (value === "none") {
      setLogo(null);
      return;
    }
    const option = [...customLogos, ...brandLogos].find(
      (entry) => entry.source === value,
    );
    setLogo(option ?? null);
  };

  const summaryText = [
    `将导出 ${photos.length} 张`,
    qualitySummary[quality],
    logo ? `${logo.name}` : "无 Logo",
  ].join(" · ");

  return (
    <Drawer
      width={720}
      title={`导出画框（已选 ${photos.length} 张）`}
      visible={visible}
      onCancel={onCancel}
      footer={
        <div className="wm-footer">
          <span className="wm-footer__summary">{summaryText}</span>
          <div className="wm-footer__actions">
            <Button onClick={onCancel} disabled={isExporting}>
              取消
            </Button>
            <Button
              type="primary"
              loading={isExporting}
              onClick={() =>
                onExport({
                  quality,
                  logo: {
                    source: logo?.source ?? null,
                    name: logo?.name ?? "",
                    mark: logo?.mark ?? "",
                  },
                })
              }
            >
              开始导出
            </Button>
          </div>
        </div>
      }
      unmountOnExit
    >
      <div className="wm-drawer">
        <section className="wm-preview">
          {previewSrc ? (
            <div className="wm-preview__stage">
              <canvas
                ref={canvasRef}
                aria-label="画框效果预览"
                className={previewReady ? "" : "is-loading"}
              />
              {!previewReady && <Spin tip="正在生成预览…" />}
            </div>
          ) : (
            <div className="wm-preview__empty">所选图片缺少可预览的地址</div>
          )}
        </section>

        <section className="wm-field">
          <label className="wm-field__label">导出质量</label>
          <Select
            value={quality}
            onChange={(value) => setQuality(value as ExportQuality)}
          >
            {qualityOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.full}
              </Option>
            ))}
          </Select>
          <span className="wm-field__hint">
            低/中档用腾讯云数据万象出压缩图减少流量；输出统一为 JPG，并保留源图 EXIF。
          </span>
        </section>

        <section className="wm-field">
          <label className="wm-field__label">信息条 Logo</label>
          <Row gutter={[8, 8]}>
            <Col span={24}>
              <Select
                value={logo?.source ?? "none"}
                onChange={selectLogo}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div className="wm-select-upload">
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept="image/*"
                        className="wm-hidden-input"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) handleCustomUpload(file);
                          event.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="text"
                        size="mini"
                        icon={<span>＋</span>}
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        上传自定义 Logo（仅本次使用）
                      </Button>
                    </div>
                  </>
                )}
              >
                <Option value="none">不显示 Logo（仅信息文字）</Option>
                {customLogos.length > 0 && (
                  <OptGroup label="本次自定义">
                    {customLogos.map((entry) => (
                      <Option key={entry.id} value={entry.source}>
                        <span className="wm-logo-option">
                          <img src={entry.source} alt="" />
                          <span className="wm-logo-option__name">
                            {entry.name}
                          </span>
                        </span>
                      </Option>
                    ))}
                  </OptGroup>
                )}
                {brandLogos.length > 0 && (
                  <OptGroup label="品牌管理 Logo">
                    {brandLogos.map((entry) => (
                      <Option key={entry.id} value={entry.source}>
                        <span className="wm-logo-option">
                          <img src={entry.source} alt="" />
                          <span className="wm-logo-option__name">
                            {entry.name}
                          </span>
                        </span>
                      </Option>
                    ))}
                  </OptGroup>
                )}
              </Select>
            </Col>
          </Row>
        </section>

        <section className="wm-field">
          <label className="wm-field__label">信息内容（取自图片 EXIF）</label>
          <div className="wm-frame-info">
            <span className="wm-frame-info__primary">
              {[previewFields.focalLength, previewFields.exposure]
                .filter(Boolean)
                .join("  ") || "（该图无焦距 / 曝光信息）"}
            </span>
            <span className="wm-frame-info__secondary">
              {[previewFields.model, previewFields.lens]
                .filter(Boolean)
                .join("     ") || "（该图无机型 / 镜头信息）"}
            </span>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
