import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { createApiClient } from "./lib/api";
import { extractExif } from "./lib/exif";
import {
  exifLine,
  formatDate,
  photoTitle,
  summarizeUpload,
} from "./lib/format";
import type {
  PhotoPayload,
  PhotoRecord,
  PhotoStatus,
  ToastMessage,
  UploadPreview,
} from "./types";

const api = createApiClient();

const demoPhotos: PhotoRecord[] = [
  {
    id: "demo-01",
    title: "Harbor after rain",
    description:
      "A quiet reflective study used when the API is not connected yet.",
    topicId: "street",
    topicTitle: "Street",
    status: "published",
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-02-18T08:00:00.000Z",
    exif: {
      cameraMake: "Sony",
      cameraModel: "A7 IV",
      lens: "35mm f/1.8",
      aperture: "f/4",
      shutter: "1/250s",
      iso: 200,
    },
  },
  {
    id: "demo-02",
    title: "Studio geometry",
    description: "Monochrome topic cover candidate with high-contrast forms.",
    topicId: "studio",
    topicTitle: "Studio",
    status: "draft",
    imageUrl:
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-01-04T08:00:00.000Z",
    exif: {
      cameraMake: "Fujifilm",
      cameraModel: "GFX 100S",
      lens: "80mm f/1.7",
      aperture: "f/5.6",
      shutter: "1/125s",
      iso: 100,
    },
  },
];

const emptyPayload: PhotoPayload = {
  title: "",
  description: "",
  topicId: "",
  topicTitle: "",
  status: "draft",
  imageUrl: "",
};

const randomId = () => `${Date.now().toString(36)}-${crypto.randomUUID()}`;

const cameraIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.2-2h5l1.2 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
    <path d="M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
  </svg>
);

const uploadIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M12 4v12" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 20h14" />
  </svg>
);

const trashIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="m6 7 1 14h10l1-14" />
    <path d="M9 7V4h6v3" />
  </svg>
);

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [payload, setPayload] = useState<PhotoPayload>(emptyPayload);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<UploadPreview[]>([]);
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    body: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const pushToast = (tone: ToastMessage["tone"], text: string) => {
    const id = randomId();
    setToasts((current) => [...current, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      const records = await api.listPhotos();
      setPhotos(records);
    } catch (error) {
      setPhotos(demoPhotos);
      pushToast(
        "info",
        `API unavailable; showing demo data. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) {
      if (photo.topicId)
        map.set(photo.topicId, photo.topicTitle || photo.topicId);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return photos.filter((photo) => {
      const matchesTopic =
        topicFilter === "all" || photo.topicId === topicFilter;
      const searchable = [
        photo.title,
        photo.description,
        photo.topicTitle,
        photo.topicId,
        exifLine(photo.exif),
      ]
        .join(" ")
        .toLowerCase();
      return (
        matchesTopic &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [photos, query, topicFilter]);

  const selectedCount = selectedIds.size;
  const stagedSummary = useMemo(() => summarizeUpload(previews), [previews]);

  const resetEditor = () => {
    setEditingId(null);
    setPayload(emptyPayload);
  };

  const editPhoto = (photo: PhotoRecord) => {
    setEditingId(photo.id);
    setPayload({
      title: photo.title || "",
      description: photo.description || "",
      topicId: photo.topicId || "",
      topicTitle: photo.topicTitle || "",
      status: photo.status || "draft",
      imageUrl: photo.imageUrl,
      exif: photo.exif,
    });
  };

  const savePhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const cleanPayload: PhotoPayload = {
        ...payload,
        title: payload.title?.trim(),
        description: payload.description?.trim(),
        topicId: payload.topicId?.trim(),
        topicTitle: payload.topicTitle?.trim(),
        imageUrl: payload.imageUrl?.trim(),
      };

      if (editingId) {
        const updated = await api.updatePhoto(editingId, cleanPayload);
        setPhotos((current) =>
          current.map((photo) => (photo.id === editingId ? updated : photo)),
        );
        pushToast("success", "Photo record updated");
      } else {
        const created = await api.createPhoto(cleanPayload);
        setPhotos((current) => [created, ...current]);
        pushToast("success", "Photo record created");
      }
      resetEditor();
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Unable to save photo",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const stageFiles = async (
    files: FileList | null,
    mode: "quick" | "topic",
  ) => {
    if (!files?.length) return;
    const staged = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        topicId:
          mode === "topic"
            ? payload.topicId?.trim() || "untitled-topic"
            : payload.topicId?.trim() || "",
        description: payload.description?.trim() || "",
        exif: await extractExif(file),
      })),
    );
    setPreviews((current) => [...current, ...staged]);
    pushToast(
      "info",
      `${staged.length} upload${staged.length === 1 ? "" : "s"} staged with EXIF preview`,
    );
  };

  const clearPreviews = () => {
    for (const preview of previews) URL.revokeObjectURL(preview.previewUrl);
    setPreviews([]);
  };

  const uploadStaged = async () => {
    if (!previews.length) return;
    setIsSaving(true);
    try {
      const uploaded: PhotoRecord[] = [];
      for (const preview of previews) {
        const result = await api.uploadPhoto(preview);
        if (result.photo) uploaded.push(result.photo);
      }
      if (uploaded.length) setPhotos((current) => [...uploaded, ...current]);
      pushToast(
        "success",
        `Uploaded ${previews.length} file${previews.length === 1 ? "" : "s"}`,
      );
      clearPreviews();
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Upload failed",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const requestDeletePhoto = (photo: PhotoRecord) => {
    setConfirmAction({
      title: "Delete photo record",
      body: `Delete “${photoTitle(photo)}”? This removes the admin record and cannot be undone.`,
      async onConfirm() {
        await api.deletePhoto(photo.id);
        setPhotos((current) =>
          current.filter((record) => record.id !== photo.id),
        );
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(photo.id);
          return next;
        });
        pushToast("success", "Photo deleted");
      },
    });
  };

  const requestBatchDelete = () => {
    const ids = [...selectedIds];
    setConfirmAction({
      title: "Delete selected records",
      body: `Delete ${ids.length} selected record${ids.length === 1 ? "" : "s"}? This action cannot be undone.`,
      async onConfirm() {
        await api.batchDelete(ids);
        setPhotos((current) =>
          current.filter((photo) => !ids.includes(photo.id)),
        );
        setSelectedIds(new Set());
        pushToast("success", "Selected records deleted");
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    try {
      await confirmAction.onConfirm();
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Action failed",
      );
    } finally {
      setConfirmAction(null);
    }
  };

  return (
    <main className="admin-shell">
      <section className="hero-panel" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">DKPlus Photography CMS</p>
          <h1 id="page-title">Admin contact sheet for image operations</h1>
          <p className="hero-copy">
            Curate published gallery records, stage bulk uploads, preview EXIF,
            and keep destructive edits behind a confirmation checkpoint.
          </p>
        </div>
        <div className="hero-stats" aria-label="Gallery statistics">
          <span>
            <strong>{photos.length}</strong> records
          </span>
          <span>
            <strong>{topics.length}</strong> topics
          </span>
          <span>
            <strong>{selectedCount}</strong> selected
          </span>
        </div>
      </section>

      <section className="toolbar card" aria-label="Photo filters">
        <label>
          <span>Search records</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, topic, EXIF"
          />
        </label>
        <label>
          <span>Topic</span>
          <select
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
          >
            <option value="all">All topics</option>
            {topics.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          Refresh API
        </button>
      </section>

      <div className="workspace-grid">
        <section className="card editor-card" aria-labelledby="editor-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Record editor</p>
              <h2 id="editor-title">
                {editingId ? "Update photo metadata" : "Create photo record"}
              </h2>
            </div>
            {editingId ? (
              <button
                className="text-button"
                type="button"
                onClick={resetEditor}
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <form
            className="form-grid"
            onSubmit={(event) => void savePhoto(event)}
          >
            <label>
              <span>Title optional</span>
              <input
                value={payload.title || ""}
                onChange={(event) =>
                  setPayload({ ...payload, title: event.target.value })
                }
                placeholder="Evening study"
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={payload.status || "draft"}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    status: event.target.value as PhotoStatus,
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              <span>Topic ID</span>
              <input
                value={payload.topicId || ""}
                onChange={(event) =>
                  setPayload({ ...payload, topicId: event.target.value })
                }
                placeholder="street"
              />
            </label>
            <label>
              <span>Topic title</span>
              <input
                value={payload.topicTitle || ""}
                onChange={(event) =>
                  setPayload({ ...payload, topicTitle: event.target.value })
                }
                placeholder="Street"
              />
            </label>
            <label className="span-2">
              <span>Image URL</span>
              <input
                value={payload.imageUrl || ""}
                onChange={(event) =>
                  setPayload({ ...payload, imageUrl: event.target.value })
                }
                placeholder="https://cdn.example.com/photo.jpg"
              />
            </label>
            <label className="span-2">
              <span>Description optional</span>
              <textarea
                value={payload.description || ""}
                onChange={(event) =>
                  setPayload({ ...payload, description: event.target.value })
                }
                placeholder="Short editorial note"
                rows={4}
              />
            </label>
            <button
              className="btn-primary span-2"
              type="submit"
              disabled={isSaving}
            >
              {cameraIcon}
              {editingId ? "Save metadata" : "Create record"}
            </button>
          </form>
        </section>

        <section className="card upload-card" aria-labelledby="upload-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Upload queue</p>
              <h2 id="upload-title">Quick and topic uploads</h2>
            </div>
            <span className="status-pill">{stagedSummary}</span>
          </div>
          <div className="upload-actions">
            <label className="file-drop">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  void stageFiles(event.target.files, "quick")
                }
              />
              {uploadIcon}
              <span>Quick upload</span>
            </label>
            <label className="file-drop strong">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  void stageFiles(event.target.files, "topic")
                }
              />
              {uploadIcon}
              <span>Topic upload</span>
            </label>
          </div>
          <div className="preview-strip" aria-live="polite">
            {previews.map((preview) => (
              <article className="preview-card" key={preview.id}>
                <img src={preview.previewUrl} alt="" loading="lazy" />
                <div>
                  <strong>{preview.title}</strong>
                  <span>{preview.topicId || "No topic"}</span>
                  <small>{exifLine(preview.exif)}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="button-row">
            <button
              className="btn-primary"
              type="button"
              disabled={!previews.length || isSaving}
              onClick={() => void uploadStaged()}
            >
              Upload staged files
            </button>
            <button
              className="btn-secondary"
              type="button"
              disabled={!previews.length}
              onClick={clearPreviews}
            >
              Clear queue
            </button>
          </div>
        </section>
      </div>

      <section className="card list-card" aria-labelledby="list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2 id="list-title">Photo records</h2>
          </div>
          <button
            className="btn-danger"
            type="button"
            onClick={requestBatchDelete}
            disabled={selectedCount === 0}
          >
            {trashIcon}Delete selected
          </button>
        </div>

        {isLoading ? (
          <p className="empty-state">Loading records from API…</p>
        ) : null}
        {!isLoading && filteredPhotos.length === 0 ? (
          <p className="empty-state">No records match the current filter.</p>
        ) : null}

        <div className="photo-grid">
          {filteredPhotos.map((photo) => (
            <article className="photo-card" key={photo.id}>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={selectedIds.has(photo.id)}
                  onChange={() => toggleSelected(photo.id)}
                />
                <span>Select record</span>
              </label>
              <img
                src={photo.thumbnailUrl || photo.imageUrl}
                alt={photoTitle(photo)}
                loading="lazy"
              />
              <div className="photo-body">
                <div>
                  <p className="status-pill">{photo.status || "draft"}</p>
                  <h3>{photoTitle(photo)}</h3>
                  <p>{photo.description || "No description provided."}</p>
                </div>
                <dl>
                  <div>
                    <dt>Topic</dt>
                    <dd>{photo.topicTitle || photo.topicId || "Unassigned"}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(photo.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>EXIF</dt>
                    <dd>{exifLine(photo.exif)}</dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => editPhoto(photo)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    type="button"
                    onClick={() => requestDeletePhoto(photo)}
                  >
                    {trashIcon}Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            {toast.text}
          </div>
        ))}
      </div>

      {confirmAction ? (
        <div className="modal-overlay" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
          >
            <h2 id="confirm-title">{confirmAction.title}</h2>
            <p id="confirm-body">{confirmAction.body}</p>
            <div className="button-row end">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={() => void runConfirmedAction()}
              >
                {trashIcon}Confirm delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
