import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { emptyExif, readExif } from "./metadata";
import { renderBatch, renderConcurrency } from "./render-client";
import type { BrandLogo, PhotoEntry, PhotoExif } from "./types";

const starterLogos: BrandLogo[] = [
  {
    id: "dkplus-wordmark",
    name: "dk+ photography 文字标志",
    source:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='180' viewBox='0 0 640 180'%3E%3Crect width='640' height='180' rx='20' fill='%23111627'/%3E%3Ctext x='48' y='112' fill='white' font-family='Arial,sans-serif' font-size='76' font-weight='700'%3Edk%2B photography%3C/text%3E%3C/svg%3E",
  },
  {
    id: "dkplus-monogram",
    name: "dk+ 字母组合标志",
    source:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='180' viewBox='0 0 240 180'%3E%3Crect width='240' height='180' rx='28' fill='%23f4b942'/%3E%3Ctext x='42' y='120' fill='%23111627' font-family='Arial,sans-serif' font-size='88' font-weight='700'%3Edk%2B%3C/text%3E%3C/svg%3E",
  },
];

function validLogos(value: unknown): BrandLogo[] {
  const source = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        "logos" in value &&
        Array.isArray(value.logos)
      ? value.logos
      : [];

  return source.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const record = candidate as Record<string, unknown>;
    const name =
      typeof record.name === "string" ? record.name : "导入的品牌标志";
    const imageSource = [record.source, record.url, record.dataUri].find(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (!imageSource) {
      return [];
    }

    return [
      {
        id: typeof record.id === "string" ? record.id : `imported-${index}`,
        name,
        source: imageSource,
      },
    ];
  });
}

function withUniqueLogoIds(
  existing: BrandLogo[],
  imported: BrandLogo[],
): BrandLogo[] {
  const usedIds = new Set(existing.map((logo) => logo.id));

  return imported.map((logo) => {
    const baseId = logo.id || "imported-logo";
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return { ...logo, id };
  });
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}。`));
    reader.readAsDataURL(file);
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exifField(
  photo: PhotoEntry,
  label: string,
  field: keyof PhotoExif,
  onChange: (id: string, field: keyof PhotoExif, value: string) => void,
) {
  return (
    <label className="metadata-field" key={field}>
      <span>{label}</span>
      <input
        aria-label={`${photo.file.name} ${label}`}
        onChange={(event) => onChange(photo.id, field, event.target.value)}
        value={photo.exif[field]}
      />
    </label>
  );
}

export default function App() {
  const previewUrls = useRef(new Set<string>());
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [brandLogos, setBrandLogos] = useState(starterLogos);
  const [selectedLogo, setSelectedLogo] = useState("dkplus-wordmark");
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState("dk+ photography");
  const [opacity, setOpacity] = useState(0.9);
  const [notice, setNotice] = useState(
    "照片会始终保留在当前浏览器中，直到您下载 ZIP 文件。",
  );
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    return () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    };
  }, []);

  const updateExif = (id: string, field: keyof PhotoExif, value: string) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id
          ? { ...photo, exif: { ...photo.exif, [field]: value } }
          : photo,
      ),
    );
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    const images = selected.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setNotice("请选择一个或多个图像文件以开始批量处理。");
      return;
    }

    const entries = await Promise.all(
      images.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl,
          exif: await readExif(file),
        } satisfies PhotoEntry;
      }),
    );
    setPhotos((current) => [...current, ...entries]);
    setNotice(
      `已添加 ${entries.length} 张照片。请在下方检查并补全缺失的 EXIF 信息。`,
    );
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrls.current.delete(removed.previewUrl);
      }
      return current.filter((photo) => photo.id !== id);
    });
  };

  const importBrandKit = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const imported = validLogos(JSON.parse(await file.text()) as unknown);
      if (imported.length === 0) {
        throw new Error("未找到可用的品牌标志。");
      }
      const uniqueImported = withUniqueLogoIds(brandLogos, imported);
      setBrandLogos((current) => [...current, ...uniqueImported]);
      setSelectedLogo(uniqueImported[0]?.id || "none");
      setNotice(`已从 ${file.name} 导入 ${imported.length} 个品牌标志。`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `品牌素材包导入失败：${error.message}`
          : "品牌素材包导入失败。",
      );
    }
  };

  const chooseCustomLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      setCustomLogo(await readAsDataUrl(file));
      setSelectedLogo("custom");
      setNotice(`已将 ${file.name} 用作自定义标志。`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "无法读取自定义标志。",
      );
    }
  };

  const exportZip = async () => {
    if (photos.length === 0) {
      return;
    }

    const logoSource =
      selectedLogo === "custom"
        ? customLogo
        : brandLogos.find((logo) => logo.id === selectedLogo)?.source || null;
    setIsExporting(true);
    setNotice(`正在渲染：0 / ${photos.length} 张照片…`);

    try {
      const batch = await renderBatch(
        photos,
        {
          text: watermarkText.trim() || "dk+ photography",
          opacity,
          logoSource,
        },
        (completed, total) =>
          setNotice(`正在渲染：${completed} / ${total} 张照片…`),
      );
      const zip = new JSZip();
      batch.photos.forEach((photo) => zip.file(photo.fileName, photo.blob));
      const archive = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
      });
      triggerDownload(archive, "watermarked-photos.zip");
      const fallback = batch.fallbackCount
        ? `其中 ${batch.fallbackCount} 张照片使用了安全的主线程回退方案。`
        : "";
      setNotice(
        `ZIP 已下载：已渲染 ${batch.photos.length} 张照片，使用 ${batch.concurrency} 个并发工作槽位。${fallback}`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `导出失败：${error.message}`
          : "导出失败，请重试。",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const workerSlots = renderConcurrency(Math.max(photos.length, 1));

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">dk+ photography / 本地导出工具</p>
        <h1>无需上传，即可为整组照片添加水印。</h1>
        <p className="lede">
          添加照片，保留或编辑相机信息，然后下载一个包含水印照片的 ZIP 压缩包。
        </p>
      </header>

      <section aria-labelledby="settings-heading" className="panel controls">
        <div className="section-heading">
          <p className="step">01 / 设置</p>
          <h2 id="settings-heading">水印设置</h2>
        </div>
        <div className="control-grid">
          <label>
            <span>水印文字</span>
            <input
              onChange={(event) => setWatermarkText(event.target.value)}
              value={watermarkText}
            />
          </label>
          <label>
            <span>品牌标志</span>
            <select
              onChange={(event) => setSelectedLogo(event.target.value)}
              value={selectedLogo}
            >
              <option value="none">仅文字</option>
              {brandLogos.map((logo) => (
                <option key={logo.id} value={logo.id}>
                  {logo.name}
                </option>
              ))}
              {customLogo ? (
                <option value="custom">已上传的自定义标志</option>
              ) : null}
            </select>
          </label>
          <label>
            <span>水印透明度：{Math.round(opacity * 100)}%</span>
            <input
              max="1"
              min="0.15"
              onChange={(event) => setOpacity(Number(event.target.value))}
              step="0.05"
              type="range"
              value={opacity}
            />
          </label>
          <label>
            <span>自定义标志</span>
            <input
              accept="image/*"
              aria-label="上传自定义标志"
              onChange={chooseCustomLogo}
              type="file"
            />
          </label>
          <label>
            <span>品牌素材包 JSON</span>
            <input
              accept="application/json,.json"
              aria-label="导入品牌素材包 JSON"
              onChange={importBrandKit}
              type="file"
            />
          </label>
        </div>
      </section>

      <section aria-labelledby="photos-heading" className="panel photos-panel">
        <div className="section-heading actions-heading">
          <div>
            <p className="step">02 / 上传与导出</p>
            <h2 id="photos-heading">源照片</h2>
          </div>
          <label className="upload-button">
            <span>添加照片</span>
            <input
              accept="image/*"
              aria-label="添加源照片"
              multiple
              onChange={addPhotos}
              type="file"
            />
          </label>
        </div>

        {photos.length === 0 ? (
          <div className="empty-state">
            <strong>尚未选择照片。</strong>
            <span>文件只会在本地处理，照片不会上传到服务器。</span>
          </div>
        ) : (
          <ul className="photo-list" aria-label="已选择的源照片">
            {photos.map((photo) => (
              <li className="photo-card" key={photo.id}>
                <img
                  alt={`${photo.file.name} 的预览`}
                  height="112"
                  src={photo.previewUrl}
                  width="112"
                />
                <div className="photo-details">
                  <div className="photo-title-row">
                    <div>
                      <strong>{photo.file.name}</strong>
                      <span>{Math.round(photo.file.size / 1024)} KB</span>
                    </div>
                    <button
                      aria-label={`移除 ${photo.file.name}`}
                      onClick={() => removePhoto(photo.id)}
                      type="button"
                    >
                      移除
                    </button>
                  </div>
                  <div className="metadata-grid">
                    {exifField(photo, "相机型号", "model", updateExif)}
                    {exifField(photo, "镜头", "lens", updateExif)}
                    {exifField(photo, "焦距", "focalLength", updateExif)}
                    {exifField(photo, "曝光参数", "exposure", updateExif)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="export-bar">
          <p aria-live="polite" role="status">
            {notice}
          </p>
          <button
            disabled={photos.length === 0 || isExporting}
            onClick={exportZip}
            type="button"
          >
            {isExporting ? "正在生成 ZIP…" : "导出已加水印的 ZIP"}
          </button>
        </div>
      </section>
    </main>
  );
}
