import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "@arco-design/web-react";
import type {
  ConfigProviderProps,
  TableColumnProps,
} from "@arco-design/web-react";
import zhCN from "@arco-design/web-react/es/locale/zh-CN";

import { createApiClient } from "./lib/api";
import { extractExif } from "./lib/exif";
import {
  withAdminPreviewDisplayUrl,
  withAdminThumbnailDisplayUrl,
} from "./lib/display-url";
import {
  exifLine,
  formatDate,
  imageSummary,
  photoTitle,
  summarizeUpload,
} from "./lib/format";
import type {
  PhotoPayload,
  PhotoRecord,
  TopicRecord,
  ToastMessage,
  UploadPreview,
} from "./types";

const api = createApiClient();
const TextArea = Input.TextArea;
const { Text } = Typography;

const arcoTheme: ConfigProviderProps["theme"] = {
  primaryColor: "#141414",
  infoColor: "#343434",
  dangerColor: "#a32121",
};

const demoPhotos: PhotoRecord[] = [
  {
    id: "demo-01",
    title: "雨后港口",
    description: "API 未连接时用于预览后台列表的反光街景样片。",
    topicId: "street",
    topicTitle: "街头",
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-02-18T08:00:00.000Z",
    updatedAt: "2026-02-18T08:00:00.000Z",
    image: {
      url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
      fileName: "harbor-after-rain.jpg",
      mimeType: "image/jpeg",
      size: 924_000,
      storage: "remote",
    },
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
    title: "几何影棚",
    description: "用于检查专题与 EXIF 展示的黑白样片。",
    topicId: "studio",
    topicTitle: "影棚",
    imageUrl:
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-01-04T08:00:00.000Z",
    updatedAt: "2026-01-04T08:00:00.000Z",
    image: {
      url: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80",
      fileName: "studio-geometry.jpg",
      mimeType: "image/jpeg",
      size: 1_320_000,
      storage: "remote",
    },
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
};

type TopicDraft = {
  id: string;
  title: string;
  description: string;
};

type TopicOption = [id: string, title: string];
type AdminPage = "photos" | "topics";

const emptyTopicDraft: TopicDraft = { id: "", title: "", description: "" };

const normalizeTopicId = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s/_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const randomId = () => `${Date.now().toString(36)}-${crypto.randomUUID()}`;

const allFilterValue = "all";

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-CN"));

function App() {
  const [activePage, setActivePage] = useState<AdminPage>("photos");
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [managedTopics, setManagedTopics] = useState<TopicRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [payload, setPayload] = useState<PhotoPayload>(emptyPayload);
  const [customTopics, setCustomTopics] = useState<TopicOption[]>([]);
  const [topicDraft, setTopicDraft] = useState<TopicDraft>(emptyTopicDraft);
  const [managedTopicDraft, setManagedTopicDraft] =
    useState<TopicDraft>(emptyTopicDraft);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<UploadPreview[]>([]);
  const [editorPreview, setEditorPreview] = useState<UploadPreview | null>(
    null,
  );
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRecord | null>(null);
  const previewsRef = useRef<UploadPreview[]>([]);
  const editorPreviewRef = useRef<UploadPreview | null>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const topicFileInputRef = useRef<HTMLInputElement>(null);
  const [titleFilter, setTitleFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState(true);
  const [isTopicSaving, setIsTopicSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTopicEditorOpen, setIsTopicEditorOpen] = useState(false);
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    body: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const pushMessage = (tone: "success" | "error" | "info", text: string) => {
    const message: ToastMessage = { id: randomId(), tone, text };
    setMessages((current) => [message, ...current].slice(0, 3));
    window.setTimeout(() => {
      setMessages((current) =>
        current.filter((item) => item.id !== message.id),
      );
    }, 5000);
  };

  const refresh = async () => {
    setIsLoading(true);
    setIsTopicLoading(true);
    const [photoResult, topicResult] = await Promise.allSettled([
      api.listPhotos(),
      api.listTopics(),
    ]);

    if (photoResult.status === "fulfilled") {
      setPhotos(photoResult.value);
    } else {
      setPhotos(demoPhotos);
      pushMessage(
        "info",
        `API 暂不可用，正在显示演示数据。${
          photoResult.reason instanceof Error ? photoResult.reason.message : ""
        }`.trim(),
      );
    }

    if (topicResult.status === "fulfilled") {
      setManagedTopics(topicResult.value);
    } else {
      pushMessage(
        "info",
        `专题 API 暂不可用，专题管理将显示从图片推导的专题。${
          topicResult.reason instanceof Error ? topicResult.reason.message : ""
        }`.trim(),
      );
    }

    setIsLoading(false);
    setIsTopicLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(
    () => () => {
      for (const preview of previewsRef.current) {
        URL.revokeObjectURL(preview.previewUrl);
      }
      if (editorPreviewRef.current) {
        URL.revokeObjectURL(editorPreviewRef.current.previewUrl);
      }
    },
    [],
  );

  const topicUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const photo of photos) {
      for (const topicId of [photo.topicId, ...(photo.topicIds ?? [])]) {
        const normalizedTopicId = topicId?.trim();
        if (!normalizedTopicId) continue;
        map.set(normalizedTopicId, (map.get(normalizedTopicId) ?? 0) + 1);
      }
    }
    return map;
  }, [photos]);

  const topicRows = useMemo<TopicRecord[]>(() => {
    const map = new Map<string, TopicRecord>();
    const upsertTopic = (topic: TopicRecord) => {
      const id = topic.id.trim();
      if (!id) return;
      map.set(id, {
        ...map.get(id),
        ...topic,
        id,
        title: topic.title?.trim() || map.get(id)?.title || id,
        description:
          topic.description?.trim() || map.get(id)?.description || undefined,
      });
    };

    for (const topic of managedTopics) {
      upsertTopic(topic);
    }

    for (const photo of photos) {
      if (photo.topicId) {
        upsertTopic({
          id: photo.topicId,
          title: photo.topicTitle || photo.topicId,
        });
      }
      for (const topicId of photo.topicIds ?? []) {
        if (!map.has(topicId)) {
          upsertTopic({ id: topicId, title: topicId });
        }
      }
    }

    for (const [id, title] of customTopics) {
      upsertTopic({ id, title: title || id });
    }

    return [...map.values()].sort((a, b) =>
      a.title.localeCompare(b.title, "zh-CN"),
    );
  }, [customTopics, managedTopics, photos]);

  const topics = useMemo<TopicOption[]>(
    () => topicRows.map((topic) => [topic.id, topic.title]),
    [topicRows],
  );

  const cameraBrands = useMemo(
    () => uniqueSorted(photos.map((photo) => photo.exif?.cameraMake)),
    [photos],
  );

  const cameraModels = useMemo(
    () => uniqueSorted(photos.map((photo) => photo.exif?.cameraModel)),
    [photos],
  );

  const filteredPhotos = useMemo(() => {
    const normalizedTitle = titleFilter.trim().toLowerCase();
    return photos.filter((photo) => {
      const topicIds = [photo.topicId, ...(photo.topicIds ?? [])].filter(
        Boolean,
      );
      const brand = photo.exif?.cameraMake?.trim() || "";
      const model = photo.exif?.cameraModel?.trim() || "";
      const matchesTopic =
        topicFilter === "all" || topicIds.includes(topicFilter);
      const matchesBrand = brandFilter === "all" || brand === brandFilter;
      const matchesModel = modelFilter === "all" || model === modelFilter;
      const searchableTitle = [photoTitle(photo), photo.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesTitle =
        !normalizedTitle || searchableTitle.includes(normalizedTitle);
      return matchesTopic && matchesBrand && matchesModel && matchesTitle;
    });
  }, [brandFilter, modelFilter, photos, titleFilter, topicFilter]);

  const selectedCount = selectedIds.size;
  const stagedSummary = useMemo(() => summarizeUpload(previews), [previews]);
  const visibleCount = filteredPhotos.length;
  const topicCount = topics.length;
  const usedTopicCount = [...topicUsage.values()].filter(
    (count) => count > 0,
  ).length;
  const topicReferenceCount = [...topicUsage.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const editingPhoto = useMemo(
    () => photos.find((photo) => photo.id === editingId) ?? null,
    [editingId, photos],
  );
  const editorImageUrl =
    editorPreview?.previewUrl ||
    withAdminPreviewDisplayUrl(
      editingPhoto?.imageUrl ||
        editingPhoto?.image?.url ||
        editingPhoto?.thumbnailUrl,
    ) ||
    "";

  const replaceEditorPreview = (nextPreview: UploadPreview | null) => {
    if (editorPreviewRef.current) {
      URL.revokeObjectURL(editorPreviewRef.current.previewUrl);
    }
    editorPreviewRef.current = nextPreview;
    setEditorPreview(nextPreview);
  };

  const selectTopic = (topicId: string) => {
    const topicTitle = topics.find(([id]) => id === topicId)?.[1] || "";
    setPayload((current) => ({ ...current, topicId, topicTitle }));
  };

  const upsertManagedTopic = (topic: TopicRecord) => {
    setManagedTopics((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== topic.id);
      return [...withoutDuplicate, topic].sort((a, b) =>
        a.title.localeCompare(b.title, "zh-CN"),
      );
    });
  };

  const createTopicFromDraft = async () => {
    const title = topicDraft.title.trim();
    const topicId = normalizeTopicId(topicDraft.id || title);

    if (!title || !topicId) {
      pushMessage("error", "请填写专题名称，或补充可用的专题 ID。");
      return;
    }

    try {
      const createdTopic = await api.createTopic({
        id: topicId,
        title,
        description: topicDraft.description,
      });
      upsertManagedTopic(createdTopic);
    } catch (error) {
      setCustomTopics((current) => {
        const withoutDuplicate = current.filter(([id]) => id !== topicId);
        return [...withoutDuplicate, [topicId, title]];
      });
      pushMessage(
        "info",
        `专题 API 暂不可用，已作为本地专题继续图片流程。${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }

    setPayload((current) => ({ ...current, topicId, topicTitle: title }));
    setTopicFilter(topicId);
    setTopicDraft(emptyTopicDraft);
    pushMessage("success", `已新增专题“${title}”，并设为当前专题。`);
  };

  const withTopicTitle = (
    photo: PhotoRecord,
    topicId?: string,
    topicTitle?: string,
  ): PhotoRecord => {
    const normalizedTopicId =
      topicId?.trim() || photo.topicId || photo.topicIds?.[0] || "";

    if (!normalizedTopicId) return photo;

    const normalizedTopicTitle =
      topicTitle?.trim() ||
      topics.find(([id]) => id === normalizedTopicId)?.[1] ||
      photo.topicTitle ||
      normalizedTopicId;
    const topicIds = photo.topicIds?.includes(normalizedTopicId)
      ? photo.topicIds
      : [normalizedTopicId, ...(photo.topicIds ?? [])];

    return {
      ...photo,
      topicId: normalizedTopicId,
      topicTitle: normalizedTopicTitle,
      topicIds,
    };
  };

  const withSelectedTopic = (photo: PhotoRecord): PhotoRecord =>
    withTopicTitle(photo, payload.topicId, payload.topicTitle);

  const resetEditor = () => {
    setEditingId(null);
    setPayload(emptyPayload);
    replaceEditorPreview(null);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingId(null);
    setPayload(emptyPayload);
    replaceEditorPreview(null);
    setIsEditorOpen(true);
  };

  const editPhoto = (photo: PhotoRecord) => {
    setEditingId(photo.id);
    setPayload({
      title: photo.title || "",
      description: photo.description || "",
      topicId: photo.topicId || photo.topicIds?.[0] || "",
      topicTitle: photo.topicTitle || "",
      exif: photo.exif,
    });
    replaceEditorPreview(null);
    setIsEditorOpen(true);
  };

  const savePhoto = async () => {
    setIsSaving(true);
    try {
      const cleanPayload: PhotoPayload = {
        ...payload,
        title: payload.title?.trim(),
        description: payload.description?.trim(),
        topicId: payload.topicId?.trim(),
        topicTitle: payload.topicTitle?.trim(),
      };

      if (!editingId && !editorPreview) {
        pushMessage("error", "请选择一张本地图片后再创建记录。");
        return;
      }

      if (editingId) {
        const updated = editorPreview
          ? (
              await api.uploadPhoto(
                {
                  ...editorPreview,
                  title: cleanPayload.title || editorPreview.title,
                  description: cleanPayload.description || "",
                  topicId: cleanPayload.topicId || "",
                },
                editingId,
              )
            ).photo
          : await api.updatePhoto(editingId, cleanPayload);
        if (!updated) throw new Error("图片更新后没有返回记录。");
        const updatedWithTopic = withSelectedTopic(updated);
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === editingId ? updatedWithTopic : photo,
          ),
        );
        pushMessage("success", "图片记录已更新");
      } else if (editorPreview) {
        const result = await api.uploadPhoto({
          ...editorPreview,
          title: cleanPayload.title || editorPreview.title,
          description: cleanPayload.description || "",
          topicId: cleanPayload.topicId || "",
        });
        const created = result.photo;
        if (!created) throw new Error("上传后没有返回图片记录。");
        setPhotos((current) => [withSelectedTopic(created), ...current]);
        pushMessage("success", "图片记录已创建");
      }
      resetEditor();
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "保存图片记录失败",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const stageEditorFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const preview: UploadPreview = {
      id: randomId(),
      file,
      previewUrl: URL.createObjectURL(file),
      title:
        payload.title?.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      topicId: payload.topicId?.trim() || "",
      description: payload.description?.trim() || "",
      exif: await extractExif(file),
    };
    replaceEditorPreview(preview);
    pushMessage("info", "已选择本地图片并读取 EXIF 预览");
  };

  const stageFiles = async (
    files: FileList | null,
    mode: "quick" | "topic",
  ) => {
    if (!files?.length) return;
    if (mode === "topic" && !payload.topicId?.trim()) {
      pushMessage("error", "请先选择或新增专题，再按当前专题选择图片。");
      return;
    }
    const staged = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        topicId:
          mode === "topic"
            ? payload.topicId?.trim() || ""
            : payload.topicId?.trim() || "",
        description: payload.description?.trim() || "",
        exif: await extractExif(file),
      })),
    );
    setPreviews((current) => [...current, ...staged]);
    setIsUploadOpen(true);
    pushMessage("info", `已暂存 ${staged.length} 个文件并读取 EXIF 预览`);
  };

  const clearPreviews = () => {
    for (const preview of previewsRef.current) {
      URL.revokeObjectURL(preview.previewUrl);
    }
    previewsRef.current = [];
    setPreviews([]);
  };

  const uploadStaged = async () => {
    if (!previews.length) return;
    setIsSaving(true);
    try {
      const uploaded: PhotoRecord[] = [];
      for (const preview of previews) {
        const result = await api.uploadPhoto(preview);
        const previewTopicTitle =
          topics.find(([id]) => id === preview.topicId)?.[1] || "";
        if (result.photo) {
          uploaded.push(
            withTopicTitle(result.photo, preview.topicId, previewTopicTitle),
          );
        }
      }
      if (uploaded.length) setPhotos((current) => [...uploaded, ...current]);
      pushMessage("success", `已上传 ${previews.length} 个文件`);
      clearPreviews();
      setIsUploadOpen(false);
    } catch (error) {
      pushMessage("error", error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsSaving(false);
    }
  };

  const exportToClient = async () => {
    setIsExporting(true);
    try {
      const result = await api.exportGallery();
      pushMessage(
        "success",
        `已导出到客户端：${result.photoCount} 张图片、${result.topicCount} 个专题。`,
      );
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "导出到客户端失败",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const requestDeletePhoto = (photo: PhotoRecord) => {
    setConfirmAction({
      title: "删除图片记录",
      body: `确认删除“${photoTitle(photo)}”？此操作会移除后台记录，且无法撤销。`,
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
        pushMessage("success", "图片已删除");
      },
    });
  };

  const requestBatchDelete = () => {
    const ids = [...selectedIds];
    setConfirmAction({
      title: "批量删除图片记录",
      body: `确认删除已选择的 ${ids.length} 条记录？此操作无法撤销。`,
      async onConfirm() {
        await api.batchDelete(ids);
        setPhotos((current) =>
          current.filter((photo) => !ids.includes(photo.id)),
        );
        setSelectedIds(new Set());
        pushMessage("success", "已删除所选记录");
      },
    });
  };

  const openCreateTopicEditor = () => {
    setEditingTopicId(null);
    setManagedTopicDraft(emptyTopicDraft);
    setIsTopicEditorOpen(true);
  };

  const editTopic = (topic: TopicRecord) => {
    setEditingTopicId(topic.id);
    setManagedTopicDraft({
      id: topic.id,
      title: topic.title,
      description: topic.description || "",
    });
    setIsTopicEditorOpen(true);
  };

  const resetTopicEditor = () => {
    setEditingTopicId(null);
    setManagedTopicDraft(emptyTopicDraft);
    setIsTopicEditorOpen(false);
  };

  const saveTopic = async () => {
    const title = managedTopicDraft.title.trim();
    const topicId =
      editingTopicId ?? normalizeTopicId(managedTopicDraft.id || title);
    const description = managedTopicDraft.description.trim();

    if (!title || !topicId) {
      pushMessage("error", "请填写专题标题，或补充可用的专题 ID。");
      return;
    }

    setIsTopicSaving(true);
    try {
      const savedTopic = editingTopicId
        ? await api.updateTopic(editingTopicId, { title, description })
        : await api.createTopic({ id: topicId, title, description });
      upsertManagedTopic(savedTopic);
      setCustomTopics((current) =>
        current.filter(([id]) => id !== savedTopic.id),
      );
      setTopicFilter(savedTopic.id);
      resetTopicEditor();
      pushMessage("success", `专题“${savedTopic.title}”已保存。`);
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "保存专题失败",
      );
    } finally {
      setIsTopicSaving(false);
    }
  };

  const requestDeleteTopic = (topic: TopicRecord) => {
    const usageCount = topicUsage.get(topic.id) ?? 0;
    if (usageCount > 0) {
      pushMessage(
        "error",
        `专题“${topic.title}”仍关联 ${usageCount} 张图片，请先调整图片专题后再删除。`,
      );
      return;
    }

    setConfirmAction({
      title: "删除专题",
      body: `确认删除专题“${topic.title}”？此操作只删除专题记录，不会修改图片。`,
      async onConfirm() {
        await api.deleteTopic(topic.id);
        setManagedTopics((current) =>
          current.filter((item) => item.id !== topic.id),
        );
        setCustomTopics((current) => current.filter(([id]) => id !== topic.id));
        if (topicFilter === topic.id) setTopicFilter(allFilterValue);
        setPayload((current) =>
          current.topicId === topic.id
            ? { ...current, topicId: "", topicTitle: "" }
            : current,
        );
        pushMessage("success", "专题已删除");
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setIsSaving(true);
    try {
      await confirmAction.onConfirm();
    } catch (error) {
      pushMessage("error", error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsSaving(false);
      setConfirmAction(null);
    }
  };

  const takenAtValue = (photo: PhotoRecord): string =>
    photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt ?? "";

  const takenAtTime = (photo: PhotoRecord): number => {
    const timestamp = Date.parse(takenAtValue(photo));
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const columns: TableColumnProps<PhotoRecord>[] = [
    {
      title: "图片",
      dataIndex: "title",
      width: 300,
      align: "center",
      render: (_value, photo) => (
        <div className="photo-cell">
          {photo.thumbnailUrl || photo.imageUrl ? (
            <button
              className="photo-cell__thumb"
              type="button"
              onClick={() => setPreviewPhoto(photo)}
              aria-label={`放大预览：${photoTitle(photo)}`}
            >
              <img
                src={withAdminThumbnailDisplayUrl(
                  photo.thumbnailUrl || photo.imageUrl,
                )}
                alt={photoTitle(photo)}
                loading="lazy"
              />
            </button>
          ) : (
            <span className="photo-cell__empty">无图</span>
          )}
          <div>
            <strong>{photoTitle(photo)}</strong>
            <Text type="secondary" className="line-clamp">
              {photo.description || "暂无描述"}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "专题",
      dataIndex: "topicTitle",
      width: 130,
      align: "center",
      render: (_value, photo) =>
        photo.topicTitle || photo.topicId || photo.topicIds?.[0] || "未分组",
    },
    {
      title: "型号",
      dataIndex: "exif",
      key: "cameraModel",
      width: 150,
      align: "center",
      render: (_value, photo) => photo.exif?.cameraModel || "未知型号",
    },
    {
      title: "镜头",
      dataIndex: "exif",
      key: "lens",
      width: 180,
      align: "center",
      render: (_value, photo) => photo.exif?.lens || "暂无镜头信息",
    },
    {
      title: "拍摄日期",
      dataIndex: "takenAt",
      width: 150,
      align: "center",
      sorter: (left, right) => takenAtTime(left) - takenAtTime(right),
      defaultSortOrder: "descend",
      render: (_value, photo) => formatDate(takenAtValue(photo)),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      align: "center",
      render: (_value, photo) => (
        <Space size="mini">
          <Button size="mini" type="outline" onClick={() => editPhoto(photo)}>
            编辑
          </Button>
          <Button
            size="mini"
            status="danger"
            type="outline"
            onClick={() => requestDeletePhoto(photo)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const topicColumns: TableColumnProps<TopicRecord>[] = [
    {
      title: "专题名称",
      dataIndex: "title",
      width: 260,
      render: (_value, topic) => (
        <div className="topic-title-cell">
          <strong>{topic.title}</strong>
          <Text type="secondary">{topic.description || "暂无专题描述"}</Text>
        </div>
      ),
    },
    {
      title: "专题 ID",
      dataIndex: "id",
      width: 180,
      render: (_value, topic) => (
        <Tag>{topic.slug ? `${topic.id} / ${topic.slug}` : topic.id}</Tag>
      ),
    },
    {
      title: "图片数",
      dataIndex: "id",
      width: 110,
      align: "center",
      render: (_value, topic) => topicUsage.get(topic.id) ?? 0,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 150,
      align: "center",
      render: (_value, topic) =>
        formatDate(topic.updatedAt ?? topic.createdAt ?? ""),
    },
    {
      title: "操作",
      key: "actions",
      width: 170,
      align: "center",
      render: (_value, topic) => {
        const usageCount = topicUsage.get(topic.id) ?? 0;
        return (
          <Space size="mini">
            <Button size="mini" type="outline" onClick={() => editTopic(topic)}>
              编辑
            </Button>
            <Button
              size="mini"
              status="danger"
              type="outline"
              disabled={usageCount > 0}
              title={usageCount > 0 ? "仍有关联图片，不能删除" : "删除专题"}
              onClick={() => requestDeleteTopic(topic)}
            >
              删除
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <ConfigProvider locale={zhCN} theme={arcoTheme}>
      <main className="admin-shell">
        {messages.length > 0 && (
          <div className="toast-stack" role="status" aria-live="polite">
            {messages.map((message) => (
              <div
                className={`toast-message toast-message--${message.tone}`}
                key={message.id}
              >
                {message.text}
              </div>
            ))}
          </div>
        )}
        <aside className="admin-sidebar" aria-label="后台菜单">
          <div className="admin-sidebar__brand">
            <span>DK</span>
            <strong>Admin Console</strong>
            <small>Gallery Ops</small>
          </div>
          <nav className="sidebar-menu">
            <button
              type="button"
              className={`sidebar-menu__item ${
                activePage === "photos" ? "sidebar-menu__item--active" : ""
              }`}
              aria-current={activePage === "photos" ? "page" : undefined}
              onClick={() => setActivePage("photos")}
            >
              <span>图片管理</span>
              <small>照片上传、筛选与导出</small>
            </button>
            <button
              type="button"
              className={`sidebar-menu__item ${
                activePage === "topics" ? "sidebar-menu__item--active" : ""
              }`}
              aria-current={activePage === "topics" ? "page" : undefined}
              onClick={() => setActivePage("topics")}
            >
              <span>专题管理</span>
              <small>专题标题、描述与引用</small>
            </button>
          </nav>
        </aside>

        <section className="admin-workbench">
          <header className="admin-header" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">DKPlus 图库后台</p>
              <h1 id="page-title">
                {activePage === "photos" ? "图片管理" : "专题管理"}
              </h1>
            </div>
            {activePage === "photos" ? (
              <Space wrap>
                <Button onClick={() => void refresh()} loading={isLoading}>
                  刷新 API
                </Button>
                <Button type="primary" onClick={openCreateEditor}>
                  新增图片
                </Button>
                <Button onClick={() => setIsUploadOpen(true)}>上传图片</Button>
                <Button
                  type="outline"
                  loading={isExporting}
                  onClick={() => void exportToClient()}
                >
                  导出到客户端
                </Button>
              </Space>
            ) : (
              <Space wrap>
                <Button
                  onClick={() => void refresh()}
                  loading={isLoading || isTopicLoading}
                >
                  刷新 API
                </Button>
                <Button type="primary" onClick={openCreateTopicEditor}>
                  新增专题
                </Button>
              </Space>
            )}
          </header>

          {activePage === "photos" ? (
            <>
              <section className="stats-grid" aria-label="图片统计">
                <Card bordered={false}>
                  <Statistic title="图片记录" value={photos.length} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="筛选结果" value={visibleCount} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="专题数量" value={topicCount} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="已选择" value={selectedCount} />
                </Card>
              </section>

              <Card className="toolbar-card" bordered={false}>
                <div className="toolbar">
                  <Input
                    allowClear
                    aria-label="按标题筛选"
                    value={titleFilter}
                    onChange={setTitleFilter}
                    placeholder="按标题筛选"
                  />
                  <Select
                    aria-label="按品牌筛选"
                    value={brandFilter}
                    onChange={(value) => setBrandFilter(String(value))}
                    options={[
                      { label: "全部品牌", value: "all" },
                      ...cameraBrands.map((brand) => ({
                        label: brand,
                        value: brand,
                      })),
                    ]}
                  />
                  <Select
                    aria-label="按机型筛选"
                    value={modelFilter}
                    onChange={(value) => setModelFilter(String(value))}
                    options={[
                      { label: "全部机型", value: "all" },
                      ...cameraModels.map((model) => ({
                        label: model,
                        value: model,
                      })),
                    ]}
                  />
                  <Select
                    aria-label="按专题筛选"
                    value={topicFilter}
                    onChange={(value) => setTopicFilter(String(value))}
                    options={[
                      { label: "全部专题", value: allFilterValue },
                      ...topics.map(([id, title]) => ({
                        label: title,
                        value: id,
                      })),
                    ]}
                  />
                  <Space wrap className="toolbar-actions">
                    <Button type="primary" onClick={openCreateEditor}>
                      新增图片
                    </Button>
                    <Button
                      status="danger"
                      disabled={selectedCount === 0}
                      onClick={requestBatchDelete}
                    >
                      删除所选
                    </Button>
                    <Button
                      type="outline"
                      loading={isExporting}
                      onClick={() => void exportToClient()}
                    >
                      导出到客户端
                    </Button>
                  </Space>
                </div>
              </Card>

              <Card
                className="table-card"
                bordered={false}
                title="图片列表"
                extra={<Tag>{filteredPhotos.length} 条结果</Tag>}
              >
                <Spin loading={isLoading} style={{ width: "100%" }}>
                  <Table<PhotoRecord>
                    className="photos-table"
                    rowKey="id"
                    size="mini"
                    border={{ wrapper: true, cell: true }}
                    tableLayoutFixed
                    stripe
                    columns={columns}
                    data={filteredPhotos}
                    noDataElement={
                      <div className="table-empty-state">
                        <Empty description="暂无匹配图片，可调整标题、品牌、机型或专题筛选" />
                        <Button
                          size="mini"
                          onClick={() => {
                            setTitleFilter("");
                            setBrandFilter(allFilterValue);
                            setModelFilter(allFilterValue);
                            setTopicFilter(allFilterValue);
                          }}
                        >
                          清除筛选
                        </Button>
                      </div>
                    }
                    scroll={{ x: 1260 }}
                    rowSelection={{
                      type: "checkbox",
                      checkAll: true,
                      preserveSelectedRowKeys: true,
                      selectedRowKeys: [...selectedIds],
                      onChange: (keys) =>
                        setSelectedIds(new Set(keys.map((key) => String(key)))),
                    }}
                    pagination={{
                      pageSize: 12,
                      size: "small",
                      sizeCanChange: true,
                      sizeOptions: [12, 24, 48],
                      showTotal: (total, range) =>
                        `显示 ${range[0]}-${range[1]}，共 ${total} 条`,
                    }}
                  />
                </Spin>
              </Card>
            </>
          ) : (
            <>
              <section className="stats-grid" aria-label="专题统计">
                <Card bordered={false}>
                  <Statistic title="专题数量" value={topicRows.length} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="已使用专题" value={usedTopicCount} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="图片引用" value={topicReferenceCount} />
                </Card>
                <Card bordered={false}>
                  <Statistic title="接口专题" value={managedTopics.length} />
                </Card>
              </section>

              <Card
                className="topic-management-card table-card"
                bordered={false}
                title="专题列表"
                extra={
                  <Button
                    type="primary"
                    size="small"
                    onClick={openCreateTopicEditor}
                  >
                    新增专题
                  </Button>
                }
              >
                <Alert
                  type="info"
                  content="专题管理通过 Admin API /topics 读写标题与描述；仍在使用的专题会阻止删除，避免破坏图片专题关系。"
                />
                <Spin loading={isTopicLoading} style={{ width: "100%" }}>
                  <Table<TopicRecord>
                    className="photos-table topic-table"
                    rowKey="id"
                    size="mini"
                    border={{ wrapper: true, cell: true }}
                    tableLayoutFixed
                    stripe
                    columns={topicColumns}
                    data={topicRows}
                    noDataElement={
                      <div className="table-empty-state">
                        <Empty description="暂无专题，请新建专题或从图片记录同步。" />
                        <Button size="mini" onClick={openCreateTopicEditor}>
                          新增专题
                        </Button>
                      </div>
                    }
                    scroll={{ x: 870 }}
                    pagination={{
                      pageSize: 12,
                      size: "small",
                      sizeCanChange: true,
                      sizeOptions: [12, 24, 48],
                      showTotal: (total, range) =>
                        `显示 ${range[0]}-${range[1]}，共 ${total} 个专题`,
                    }}
                  />
                </Spin>
              </Card>
            </>
          )}

          <Modal
            className="editor-modal"
            title={editingId ? "编辑图片记录" : "新增图片记录"}
            visible={isEditorOpen}
            onCancel={resetEditor}
            onOk={() => void savePhoto()}
            confirmLoading={isSaving}
            okText="保存"
            cancelText="取消"
            maskClosable={false}
            unmountOnExit
          >
            <div className="editor-shell" aria-label="图片编辑器">
              <header className="editor-hero">
                <p className="editor-hero__kicker">Editorial upload desk</p>
                <h2>
                  {editingId ? "校订图片与专题信息" : "创建一条新的图片记录"}
                </h2>
                <p>
                  上方确认图片与 EXIF
                  状态，下方补充标题、专题和描述；保存时继续沿用现有上传与持久化流程。
                </p>
              </header>

              <Alert
                type="info"
                content={
                  editingId
                    ? "如需替换图片，请选择新的本地图片；不选择文件时仅保存文字与专题。"
                    : "新增图片需要先选择本地图片，保存时会上传到 /api/uploads。"
                }
              />

              <div
                className="editor-form"
                role="group"
                aria-label="图片资料表单"
              >
                <section
                  className="editor-upload-card"
                  aria-label="图片上传与预览"
                >
                  <div className="editor-upload-card__header">
                    <div>
                      <span className="editor-section-label">Step 01</span>
                      <strong>上传 / 预览</strong>
                      <span>
                        {editorPreview
                          ? editorPreview.file.name
                          : editingId
                            ? "当前图片；可选择新文件替换"
                            : "请选择一张图片"}
                      </span>
                    </div>
                    <Space wrap>
                      <Button
                        type={
                          editorPreview || editingId ? "outline" : "primary"
                        }
                        onClick={() => editorFileInputRef.current?.click()}
                      >
                        {editorPreview || editingId ? "更换图片" : "选择图片"}
                      </Button>
                      {editorPreview && (
                        <Button onClick={() => replaceEditorPreview(null)}>
                          清除新文件
                        </Button>
                      )}
                    </Space>
                  </div>
                  <p className="editor-helper">
                    {editingId
                      ? "保持原图或选择新文件替换；替换后会重新读取本地 EXIF。"
                      : "新增记录必须选择本地图片，系统会先生成预览并读取 EXIF。"}
                  </p>
                  <input
                    ref={editorFileInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void stageEditorFile(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="editor-image-preview">
                    {editorImageUrl ? (
                      <img
                        src={editorImageUrl}
                        alt={editorPreview ? "本地图片预览" : "当前图片预览"}
                      />
                    ) : (
                      <Empty description="尚未选择本地图片" />
                    )}
                  </div>
                  <div className="editor-exif-status" aria-live="polite">
                    <span className="editor-exif-status__label">EXIF 状态</span>
                    <span>
                      {editorPreview
                        ? exifLine(editorPreview.exif)
                        : editingId
                          ? "沿用当前图片数据；选择新文件后会刷新 EXIF。"
                          : "等待选择本地图片后读取。"}
                    </span>
                  </div>
                </section>

                <section
                  className="editor-metadata-card"
                  aria-label="图片元数据"
                >
                  <div className="editor-metadata-card__heading">
                    <span className="editor-section-label">Step 02</span>
                    <strong>元数据</strong>
                    <p>用清晰标题、专题和说明帮助前台图库检索与分组。</p>
                  </div>

                  <label>
                    <span>标题（可选）</span>
                    <Input
                      value={payload.title || ""}
                      onChange={(value) =>
                        setPayload({ ...payload, title: value })
                      }
                      placeholder="例如：雨后街角"
                    />
                    <small>
                      留空时会使用文件名或记录 ID 作为后台识别文本。
                    </small>
                  </label>

                  <label>
                    <span>专题（可选）</span>
                    <Select
                      allowClear
                      showSearch
                      value={payload.topicId || undefined}
                      placeholder="选择已有专题，或先在下方新增"
                      onChange={(value) =>
                        selectTopic(typeof value === "string" ? value : "")
                      }
                      options={topics.map(([id, title]) => ({
                        label: `${title} (${id})`,
                        value: id,
                      }))}
                    />
                    <small>
                      专题会同步写入主专题字段，并保留既有 topicIds 兼容。
                    </small>
                    <div className="topic-create-row" aria-label="新增专题">
                      <Input
                        value={topicDraft.title}
                        onChange={(value) =>
                          setTopicDraft((current) => ({
                            ...current,
                            title: value,
                          }))
                        }
                        placeholder="专题名称，如：编辑精选"
                      />
                      <Input
                        value={topicDraft.id}
                        onChange={(value) =>
                          setTopicDraft((current) => ({
                            ...current,
                            id: value,
                          }))
                        }
                        placeholder="专题 ID（可选，自动生成）"
                      />
                      <Button type="outline" onClick={createTopicFromDraft}>
                        创建专题
                      </Button>
                    </div>
                  </label>

                  <label>
                    <span>描述（可选）</span>
                    <TextArea
                      value={payload.description || ""}
                      onChange={(value) =>
                        setPayload({ ...payload, description: value })
                      }
                      placeholder="简短说明这张图片的内容"
                      autoSize={{ minRows: 4, maxRows: 6 }}
                    />
                    <small>建议记录场景、项目或发布备注，便于后续编辑。</small>
                  </label>
                </section>
              </div>
            </div>
          </Modal>

          <Modal
            title="上传图片"
            visible={isUploadOpen}
            onCancel={() => setIsUploadOpen(false)}
            onOk={() => void uploadStaged()}
            confirmLoading={isSaving}
            okText="上传暂存文件"
            cancelText="关闭"
            okButtonProps={{ disabled: previews.length === 0 }}
            maskClosable={false}
          >
            <div className="upload-panel">
              <p className="upload-hint">
                先选择文件并在本地读取 EXIF，确认后统一提交到 /api/uploads。
              </p>
              <label className="upload-topic-select">
                <span>当前专题（可选）</span>
                <Select
                  allowClear
                  showSearch
                  value={payload.topicId || undefined}
                  placeholder="选择已有专题，或在新增图片里创建专题"
                  onChange={(value) =>
                    selectTopic(typeof value === "string" ? value : "")
                  }
                  options={topics.map(([id, title]) => ({
                    label: `${title} (${id})`,
                    value: id,
                  }))}
                />
              </label>
              <Space wrap>
                <Button onClick={() => quickFileInputRef.current?.click()}>
                  快速选择
                </Button>
                <Button
                  type="primary"
                  onClick={() => topicFileInputRef.current?.click()}
                >
                  按当前专题选择
                </Button>
                <Button disabled={!previews.length} onClick={clearPreviews}>
                  清空暂存
                </Button>
              </Space>
              <input
                ref={quickFileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  void stageFiles(event.currentTarget.files, "quick");
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={topicFileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  void stageFiles(event.currentTarget.files, "topic");
                  event.currentTarget.value = "";
                }}
              />
              <p className="status-line">{stagedSummary}</p>
              <div className="preview-list" aria-live="polite">
                {previews.length ? (
                  previews.map((preview) => (
                    <article className="preview-card" key={preview.id}>
                      <img src={preview.previewUrl} alt="" loading="lazy" />
                      <div>
                        <strong>{preview.title}</strong>
                        <span>{preview.topicId || "未指定专题"}</span>
                        <small>{exifLine(preview.exif)}</small>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty description="尚未暂存上传文件" />
                )}
              </div>
            </div>
          </Modal>

          <Modal
            title={previewPhoto ? photoTitle(previewPhoto) : "图片预览"}
            visible={Boolean(previewPhoto)}
            onCancel={() => setPreviewPhoto(null)}
            footer={null}
            className="image-preview-modal"
            unmountOnExit
          >
            {previewPhoto && (
              <div className="image-preview-modal__body">
                <img
                  src={withAdminPreviewDisplayUrl(
                    previewPhoto.imageUrl ||
                      previewPhoto.image?.url ||
                      previewPhoto.thumbnailUrl,
                  )}
                  alt={photoTitle(previewPhoto)}
                />
                <div className="rich-lines">
                  <strong>{imageSummary(previewPhoto)}</strong>
                  <span>{previewPhoto.description || "暂无描述"}</span>
                  <span>{exifLine(previewPhoto.exif)}</span>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            title={confirmAction?.title}
            visible={Boolean(confirmAction)}
            onCancel={() => setConfirmAction(null)}
            onOk={() => void runConfirmedAction()}
            confirmLoading={isSaving}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ status: "danger" }}
          >
            <p>{confirmAction?.body}</p>
          </Modal>
        </section>
      </main>
    </ConfigProvider>
  );
}

export default App;
