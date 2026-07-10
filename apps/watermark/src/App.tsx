import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { emptyExif, readExif } from "./metadata";
import { renderBatch, renderConcurrency } from "./render-client";
import type { BrandLogo, PhotoEntry, PhotoExif } from "./types";

const starterLogos: BrandLogo[] = [
  {
    id: "dkplus-wordmark",
    name: "dk+ photography wordmark",
    source:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='180' viewBox='0 0 640 180'%3E%3Crect width='640' height='180' rx='20' fill='%23111627'/%3E%3Ctext x='48' y='112' fill='white' font-family='Arial,sans-serif' font-size='76' font-weight='700'%3Edk%2B photography%3C/text%3E%3C/svg%3E",
  },
  {
    id: "dkplus-monogram",
    name: "dk+ monogram",
    source:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='180' viewBox='0 0 240 180'%3E%3Crect width='240' height='180' rx='28' fill='%23f4b942'/%3E%3Ctext x='42' y='120' fill='%23111627' font-family='Arial,sans-serif' font-size='88' font-weight='700'%3Edk%2B%3C/text%3E%3C/svg%3E",
  },
];

function validLogos(value: unknown): BrandLogo[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "logos" in value && Array.isArray(value.logos)
      ? value.logos
      : [];

  return source.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const record = candidate as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "Imported brand logo";
    const imageSource = [record.source, record.url, record.dataUri].find(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (!imageSource) {
      return [];
    }

    return [{ id: typeof record.id === "string" ? record.id : `imported-${index}`, name, source: imageSource }];
  });
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
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
  const [notice, setNotice] = useState("Your photos stay in this browser until you download the ZIP.");
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
        photo.id === id ? { ...photo, exif: { ...photo.exif, [field]: value } } : photo,
      ),
    );
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    const images = selected.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setNotice("Choose one or more image files to start a batch.");
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
    setNotice(`${entries.length} photo${entries.length === 1 ? "" : "s"} added. Review any missing EXIF below.`);
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
        throw new Error("No usable logos were found.");
      }
      setBrandLogos((current) => [...current, ...imported]);
      setSelectedLogo(imported[0]?.id || "none");
      setNotice(`${imported.length} logo${imported.length === 1 ? "" : "s"} imported from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Brand kit import failed: ${error.message}` : "Brand kit import failed.");
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
      setNotice(`Using ${file.name} as the custom logo.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The custom logo could not be read.");
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
    setNotice(`Rendering 0 of ${photos.length} photos…`);

    try {
      const batch = await renderBatch(
        photos,
        { text: watermarkText.trim() || "dk+ photography", opacity, logoSource },
        (completed, total) => setNotice(`Rendering ${completed} of ${total} photos…`),
      );
      const zip = new JSZip();
      batch.photos.forEach((photo) => zip.file(photo.fileName, photo.blob));
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      triggerDownload(archive, "watermarked-photos.zip");
      const fallback = batch.fallbackCount
        ? ` ${batch.fallbackCount} photo${batch.fallbackCount === 1 ? " used" : "s used"} the safe main-thread fallback.`
        : "";
      setNotice(`ZIP downloaded: ${batch.photos.length} photos rendered with ${batch.concurrency} concurrent worker slots.${fallback}`);
    } catch (error) {
      setNotice(error instanceof Error ? `Export failed: ${error.message}` : "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const workerSlots = renderConcurrency(Math.max(photos.length, 1));

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">dk+ photography / local export utility</p>
        <h1>Watermark an entire shoot without uploading it.</h1>
        <p className="lede">
          Add your photographs, preserve or edit the camera details, then download a single watermarked ZIP.
        </p>
      </header>

      <section aria-labelledby="settings-heading" className="panel controls">
        <div className="section-heading">
          <p className="step">01 / Configure</p>
          <h2 id="settings-heading">Watermark details</h2>
        </div>
        <div className="control-grid">
          <label>
            <span>Watermark text</span>
            <input onChange={(event) => setWatermarkText(event.target.value)} value={watermarkText} />
          </label>
          <label>
            <span>Brand logo</span>
            <select onChange={(event) => setSelectedLogo(event.target.value)} value={selectedLogo}>
              <option value="none">Text only</option>
              {brandLogos.map((logo) => (
                <option key={logo.id} value={logo.id}>
                  {logo.name}
                </option>
              ))}
              {customLogo ? <option value="custom">Custom uploaded logo</option> : null}
            </select>
          </label>
          <label>
            <span>Watermark opacity: {Math.round(opacity * 100)}%</span>
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
            <span>Custom logo</span>
            <input accept="image/*" aria-label="Upload custom logo" onChange={chooseCustomLogo} type="file" />
          </label>
          <label>
            <span>Brand kit JSON</span>
            <input accept="application/json,.json" aria-label="Import brand kit JSON" onChange={importBrandKit} type="file" />
          </label>
        </div>
      </section>

      <section aria-labelledby="photos-heading" className="panel photos-panel">
        <div className="section-heading actions-heading">
          <div>
            <p className="step">02 / Upload and export</p>
            <h2 id="photos-heading">Source photos</h2>
          </div>
          <label className="upload-button">
            <span>Add photos</span>
            <input accept="image/*" aria-label="Add source photos" multiple onChange={addPhotos} type="file" />
          </label>
        </div>

        {photos.length === 0 ? (
          <div className="empty-state">
            <strong>Nothing selected yet.</strong>
            <span>Files are processed locally; no photo is sent to a server.</span>
          </div>
        ) : (
          <ul className="photo-list" aria-label="Selected source photos">
            {photos.map((photo) => (
              <li className="photo-card" key={photo.id}>
                <img alt={`Preview of ${photo.file.name}`} height="112" src={photo.previewUrl} width="112" />
                <div className="photo-details">
                  <div className="photo-title-row">
                    <div>
                      <strong>{photo.file.name}</strong>
                      <span>{Math.round(photo.file.size / 1024)} KB</span>
                    </div>
                    <button aria-label={`Remove ${photo.file.name}`} onClick={() => removePhoto(photo.id)} type="button">
                      Remove
                    </button>
                  </div>
                  <div className="metadata-grid">
                    {exifField(photo, "Camera model", "model", updateExif)}
                    {exifField(photo, "Lens", "lens", updateExif)}
                    {exifField(photo, "Focal length", "focalLength", updateExif)}
                    {exifField(photo, "Exposure", "exposure", updateExif)}
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
          <button disabled={photos.length === 0 || isExporting} onClick={exportZip} type="button">
            {isExporting ? "Rendering ZIP…" : "Export watermarked ZIP"}
          </button>
        </div>
      </section>
    </main>
  );
}
