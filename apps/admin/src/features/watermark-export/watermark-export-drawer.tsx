import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Drawer,
  Grid,
  Message,
  Select,
  Slider,
  Spin,
} from "@arco-design/web-react";

const { Row, Col } = Grid;

import type { BrandRecord, PhotoRecord } from "../../types";
import { drawLogoWatermark } from "./draw-logo-watermark";
import type {
  ExportQuality,
  ExportSettings,
  WatermarkBlendMode,
  WatermarkPosition,
} from "./types";

export interface WatermarkExportDrawerProps {
  visible: boolean;
  photos: PhotoRecord[];
  brands: BrandRecord[];
  onCancel: () => void;
  onExport: (settings: ExportSettings) => void;
  isExporting: boolean;
}

interface LogoOption {
  id: string;
  name: string;
  source: string;
}

const { Option, OptGroup } = Select;

const defaultSettings: ExportSettings = {
  quality: "high",
  watermark: {
    logoSource: null,
    logoLabel: "",
    opacity: 80,
    blendMode: "normal",
    position: "bottom",
    scalePercent: 3,
  },
};

const positionLabels: Record<WatermarkPosition, string> = {
  "top-left": "左上",
  top: "上",
  "top-right": "右上",
  left: "左",
  center: "中间",
  right: "右",
  "bottom-left": "左下",
  bottom: "下",
  "bottom-right": "右下",
};

// 九宫格顺序：与 position key 一一对应，用于选项前的小指示符
const positionOrder: WatermarkPosition[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

// 可选位置：去掉左上/上/右上/左/右，仅保留中间与下方三档（默认「下」）
const selectablePositions: WatermarkPosition[] = [
  "center",
  "bottom-left",
  "bottom",
  "bottom-right",
];

const qualityOptions: { value: ExportQuality; short: string; full: string }[] =
  [
    { value: "high", short: "高", full: "高 — 原像素 · JPEG 92%" },
    { value: "medium", short: "中", full: "中 — CDN 缩至宽高 50%" },
    { value: "low", short: "低", full: "低 — 20% 质量 · 体积最小" },
  ];

const qualitySummary: Record<ExportQuality, string> = {
  high: "高质量",
  medium: "中质量",
  low: "低质量",
};

const blendOptions: { value: WatermarkBlendMode; label: string }[] = [
  { value: "normal", label: "正常" },
  { value: "overlay", label: "叠加" },
];

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("预览图加载失败"));
    image.src = src;
  });

/** 3×3 小圆点，高亮当前方位，一眼可辨。 */
function PositionGlyph({ active }: { active: WatermarkPosition }) {
  return (
    <span className="wm-pos-glyph" aria-hidden>
      {positionOrder.map((key) => (
        <i key={key} className={key === active ? "is-on" : ""} />
      ))}
    </span>
  );
}

export function WatermarkExportDrawer({
  visible,
  photos,
  brands,
  onCancel,
  onExport,
  isExporting,
}: WatermarkExportDrawerProps) {
  const [settings, setSettings] = useState<ExportSettings>(defaultSettings);
  const [customLogos, setCustomLogos] = useState<LogoOption[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const brandLogoOptions = useMemo(() => flattenBrandLogos(brands), [brands]);
  const selectedLogoSource = settings.watermark.logoSource;
  const selectedLogo = useMemo(
    () =>
      selectedLogoSource
        ? [...customLogos, ...brandLogoOptions].find(
            (option) => option.source === selectedLogoSource,
          )
        : undefined,
    [brandLogoOptions, customLogos, selectedLogoSource],
  );

  useEffect(() => {
    if (!visible) return;
    setSettings(defaultSettings);
    setPreviewReady(false);
  }, [visible]);

  // 抽屉打开时默认取第一张选中照片作预览源（缩略尺寸加载更快）。
  useEffect(() => {
    if (!visible) {
      setPreviewSrc(null);
      return;
    }
    const first = photos[0];
    const raw = first?.imageUrl || first?.image?.url || first?.thumbnailUrl;
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
  }, [visible, photos]);

  const updateWatermark = (patch: Partial<ExportSettings["watermark"]>) =>
    setSettings((current) => ({
      ...current,
      watermark: { ...current.watermark, ...patch },
    }));

  // 实时预览：与 worker 共用 drawLogoWatermark，保证所见即所得。
  useEffect(() => {
    if (!visible || !previewSrc) return;
    let cancelled = false;
    setPreviewReady(false);

    void (async () => {
      try {
        const image = await loadImageElement(previewSrc);
        if (cancelled) return;
        const canvas = previewCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const maxSide = 720;
        const scale = Math.min(
          1,
          maxSide / Math.max(image.naturalWidth, image.naturalHeight),
        );
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        if (settings.watermark.logoSource) {
          try {
            const logo = await loadImageElement(settings.watermark.logoSource);
            if (cancelled) return;
            drawLogoWatermark(
              context,
              canvas.width,
              canvas.height,
              settings.watermark,
              logo,
            );
          } catch {
            Message.warning("水印 Logo 加载失败，请换一个 Logo 或检查地址。");
          }
        }
        setPreviewReady(true);
      } catch {
        if (!cancelled)
          Message.error("预览图加载失败，请检查图片地址或 CDN 跨域配置。");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewSrc, settings.watermark, visible]);

  const handleCustomUpload = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const option: LogoOption = {
      id: `custom-${Date.now()}`,
      name: file.name,
      source: previewUrl,
    };
    setCustomLogos((current) => [...current, option]);
    updateWatermark({ logoSource: option.source, logoLabel: option.name });
  };

  const selectLogo = (value: string) => {
    if (value === "none") {
      updateWatermark({ logoSource: null, logoLabel: "" });
      return;
    }
    const option = [...customLogos, ...brandLogoOptions].find(
      (entry) => entry.source === value,
    );
    updateWatermark({
      logoSource: option?.source ?? null,
      logoLabel: option?.name ?? "",
    });
  };

  const summaryText = [
    `将导出 ${photos.length} 张`,
    qualitySummary[settings.quality],
    selectedLogoSource
      ? `${positionLabels[settings.watermark.position]}水印`
      : "无水印",
  ].join(" · ");

  const logoUploadMenu = (menu: React.ReactNode) => (
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
  );

  return (
    <Drawer
      width={720}
      title={`导出水印图（已选 ${photos.length} 张）`}
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
              onClick={() => onExport(settings)}
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
                ref={previewCanvasRef}
                aria-label="水印效果预览"
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
            value={settings.quality}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                quality: value as ExportQuality,
              }))
            }
          >
            {qualityOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.full}
              </Option>
            ))}
          </Select>
        </section>

        <section className="wm-field">
          <label className="wm-field__label">水印来源</label>
          <Select
            value={selectedLogoSource ?? "none"}
            onChange={selectLogo}
            dropdownRender={logoUploadMenu}
            renderFormat={(_option, value) => {
              if (value === "none") return "不加水印";
              const match = [...customLogos, ...brandLogoOptions].find(
                (entry) => entry.source === value,
              );
              return match?.name ?? "选择水印 Logo";
            }}
          >
            <Option value="none">不加水印</Option>
            {customLogos.length > 0 && (
              <OptGroup label="本次自定义">
                {customLogos.map((logo) => (
                  <Option key={logo.id} value={logo.source}>
                    <span className="wm-logo-option">
                      <img src={logo.source} alt="" />
                      <span className="wm-logo-option__name">{logo.name}</span>
                    </span>
                  </Option>
                ))}
              </OptGroup>
            )}
            {brandLogoOptions.length > 0 && (
              <OptGroup label="品牌管理 Logo">
                {brandLogoOptions.map((logo) => (
                  <Option key={logo.id} value={logo.source}>
                    <span className="wm-logo-option">
                      <img src={logo.source} alt="" />
                      <span className="wm-logo-option__name">{logo.name}</span>
                    </span>
                  </Option>
                ))}
              </OptGroup>
            )}
          </Select>
          {selectedLogo && (
            <span className="wm-field__hint">当前水印：{selectedLogo.name}</span>
          )}
        </section>

        <section className="wm-field">
          <label className="wm-field__label">水印样式</label>
          <Row gutter={[16, 12]}>
            <Col span={12}>
              <div className="wm-slider">
                <span className="wm-slider__label">
                  透明度 <b>{settings.watermark.opacity}%</b>
                </span>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={settings.watermark.opacity}
                  disabled={!selectedLogoSource}
                  onChange={(value) =>
                    updateWatermark({ opacity: Number(value) })
                  }
                />
              </div>
            </Col>
            <Col span={12}>
              <div className="wm-slider">
                <span className="wm-slider__label">
                  大小 <b>{settings.watermark.scalePercent}%</b>（占图宽）
                </span>
                <Slider
                  min={2}
                  max={40}
                  step={1}
                  value={settings.watermark.scalePercent}
                  disabled={!selectedLogoSource}
                  onChange={(value) =>
                    updateWatermark({ scalePercent: Number(value) })
                  }
                />
              </div>
            </Col>
            <Col span={12}>
              <div className="wm-slider">
                <span className="wm-slider__label">混合模式</span>
                <Select
                  value={settings.watermark.blendMode}
                  disabled={!selectedLogoSource}
                  onChange={(value) =>
                    updateWatermark({
                      blendMode: value as WatermarkBlendMode,
                    })
                  }
                >
                  {blendOptions.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
            <Col span={12}>
              <div className="wm-slider">
                <span className="wm-slider__label">位置</span>
                <Select
                  value={settings.watermark.position}
                  disabled={!selectedLogoSource}
                  renderFormat={(_option, value) =>
                    positionLabels[value as WatermarkPosition] ?? "位置"
                  }
                  onChange={(value) =>
                    updateWatermark({ position: value as WatermarkPosition })
                  }
                >
                  {selectablePositions.map((position) => (
                    <Option key={position} value={position}>
                      <PositionGlyph active={position} />
                      {positionLabels[position]}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
          </Row>
        </section>
      </div>
    </Drawer>
  );
}

const flattenBrandLogos = (brands: BrandRecord[]): LogoOption[] => {
  const options: LogoOption[] = [];
  const seen = new Set<string>();
  for (const brand of brands) {
    for (const [index, logo] of (brand.logos ?? []).entries()) {
      const url = logo.url?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      options.push({
        id: logo.id || `${brand.id}-logo-${index + 1}`,
        name: `${brand.title || brand.name}${
          logo.label || logo.alt ? ` · ${logo.label || logo.alt}` : ""
        }`,
        source: url,
      });
    }
  }
  return options;
};
