import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Menu,
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
  TopicPayload,
  TopicRecord,
  ToastMessage,
  UploadPreview,
} from "./types";

const api = createApiClient();
const TextArea = Input.TextArea;
const { Text } = Typography;
const MenuItem = Menu.Item;

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

const demoTopics: TopicRecord[] = [
  {
    id: "street",
    title: "街头",
    description: "API 未连接时用于预览图片管理的街景专题。",
  },
  {
    id: "studio",
    title: "影棚",
    description: "API 未连接时用于预览专题管理的影棚专题。",
  },
];

const emptyPayload: PhotoPayload = {
  title: "",
  description: "",
  topicId: "",
  topicTitle: "",
};

const emptyTopicPayload: TopicPayload = { title: "", description: "" };
type AdminSection = "photos" | "topics";

const sectionRoutes: Record<AdminSection, string> = {
  photos: "#/photos",
  topics: "#/topics",
};

const parseAdminSection = (hash: string): AdminSection => {
  const normalized = hash.replace(/^#\/?/, "").split(/[?#]/)[0];
  return normalized === "topics" ? "topics" : "photos";
};

const currentAdminSection = (): AdminSection =>
  typeof window === "undefined"
    ? "photos"
    : parseAdminSection(window.location.hash);

const randomId = () => `${Date.now().toString(36)}-${crypto.randomUUID()}`;

const allFilterValue = "all";
const adminPageSizeOptions = [10, 20, 50];

const uniqueSorted = (values: Array<string | undefined>): string[] =>
  [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh-CN"));

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [topics, setTopics] = useState<TopicRecord[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>(() =>
    currentAdminSection(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [payload, setPayload] = useState<PhotoPayload>(emptyPayload);
  const [topicPayload, setTopicPayload] =
    useState<TopicPayload>(emptyTopicPayload);
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
  const [isExporting, setIsExporting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTopicEditorOpen, setIsTopicEditorOpen] = useState(false);
  const [photoPageSize, setPhotoPageSize] = useState(10);
  const [topicPageSize, setTopicPageSize] = useState(10);
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
    try {
      const [records, topicRecords] = await Promise.all([
        api.listPhotos(),
        api.listTopics(),
      ]);
      setPhotos(records);
      setTopics(topicRecords);
    } catch (error) {
      setPhotos(demoPhotos);
      setTopics(demoTopics);
      pushMessage(
        "info",
        `API 暂不可用，正在显示演示数据。${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const syncSectionFromRoute = () => {
      setActiveSection(currentAdminSection());
    };

    if (!window.location.hash) {
      window.history.replaceState(null, "", sectionRoutes.photos);
    }

    window.addEventListener("hashchange", syncSectionFromRoute);
    return () => {
      window.removeEventListener("hashchange", syncSectionFromRoute);
    };
  }, []);

  useEffect(() => {
    document.title = `${activeSection === "photos" ? "图片管理" : "专题管理"} · DKPlus Admin`;
  }, [activeSection]);

  const navigateToSection = (section: AdminSection) => {
    if (
      section === activeSection &&
      window.location.hash === sectionRoutes[section]
    ) {
      return;
    }

    window.location.hash = sectionRoutes[section];
  };

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

  const topicOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const topic of topics) {
      map.set(topic.id, topic.title || topic.id);
    }
    for (const photo of photos) {
      if (photo.topicId) {
        map.set(photo.topicId, photo.topicTitle || photo.topicId);
      }
      for (const topicId of photo.topicIds ?? []) {
        if (!map.has(topicId)) {
          map.set(topicId, topicId);
        }
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  }, [photos, topics]);

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
  const topicUsageById = useMemo(() => {
    const usage = new Map<string, number>();
    for (const photo of photos) {
      const ids = new Set(
        [photo.topicId, ...(photo.topicIds ?? [])].filter((id): id is string =>
          Boolean(id),
        ),
      );
      for (const id of ids) {
        usage.set(id, (usage.get(id) ?? 0) + 1);
      }
    }
    return usage;
  }, [photos]);
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
    const topicTitle = topicOptions.find(([id]) => id === topicId)?.[1] || "";
    setPayload((current) => ({ ...current, topicId, topicTitle }));
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
      topicOptions.find(([id]) => id === normalizedTopicId)?.[1] ||
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

  const topicTitleForPhoto = (photo: PhotoRecord): string =>
    topicOptions.find(
      ([id]) => id === (photo.topicId || photo.topicIds?.[0] || ""),
    )?.[1] ||
    photo.topicTitle ||
    photo.topicId ||
    photo.topicIds?.[0] ||
    "未分组";

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
      pushMessage("error", "请先选择已有专题，再按当前专题选择图片。");
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
      const result = await api.uploadPhotos(previews);
      const failedIndices = new Set(
        result.failed.map((failure) => failure.index),
      );
      let sourceIndex = 0;
      const uploaded = result.photos.map((photo) => {
        while (failedIndices.has(sourceIndex)) sourceIndex += 1;
        const preview = previews[sourceIndex];
        sourceIndex += 1;
        const previewTopicTitle =
          topicOptions.find(([id]) => id === preview?.topicId)?.[1] || "";
        return withTopicTitle(photo, preview?.topicId, previewTopicTitle);
      });

      if (uploaded.length) setPhotos((current) => [...uploaded, ...current]);
      if (result.failed.length) {
        const remainingPreviews = previews.filter((preview, index) => {
          const shouldKeep = failedIndices.has(index);
          if (!shouldKeep) URL.revokeObjectURL(preview.previewUrl);
          return shouldKeep;
        });
        previewsRef.current = remainingPreviews;
        setPreviews(remainingPreviews);
        pushMessage(
          uploaded.length ? "info" : "error",
          uploaded.length
            ? `已上传 ${uploaded.length} 个文件，${result.failed.length} 个失败，可调整后重试。`
            : `上传失败：${result.failed[0]?.message || "请检查文件后重试"}`,
        );
        if (!remainingPreviews.length) setIsUploadOpen(false);
        return;
      }

      pushMessage("success", `已上传 ${uploaded.length} 个文件`);
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

  const openCreateTopicEditor = () => {
    setEditingTopicId(null);
    setTopicPayload(emptyTopicPayload);
    setIsTopicEditorOpen(true);
    setActiveSection("topics");
  };

  const editTopic = (topic: TopicRecord) => {
    setEditingTopicId(topic.id);
    setTopicPayload({
      title: topic.title,
      description: topic.description ?? "",
    });
    setIsTopicEditorOpen(true);
  };

  const resetTopicEditor = () => {
    setEditingTopicId(null);
    setTopicPayload(emptyTopicPayload);
    setIsTopicEditorOpen(false);
  };

  const saveTopic = async () => {
    const title = topicPayload.title.trim();
    if (!title) {
      pushMessage("error", "请填写专题标题。");
      return;
    }

    setIsSaving(true);
    try {
      const saved = editingTopicId
        ? await api.updateTopic(editingTopicId, {
            title,
            description: topicPayload.description ?? "",
          })
        : await api.createTopic({
            title,
            description: topicPayload.description ?? "",
          });
      setTopics((current) => {
        const withoutCurrent = current.filter((topic) => topic.id !== saved.id);
        return [...withoutCurrent, saved].sort((a, b) =>
          a.title.localeCompare(b.title, "zh-CN"),
        );
      });
      pushMessage(
        "success",
        editingTopicId ? "专题已更新" : `专题“${saved.title}”已创建`,
      );
      resetTopicEditor();
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "保存专题失败",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeleteTopic = (topic: TopicRecord) => {
    const usageCount = topicUsageById.get(topic.id) ?? 0;
    if (usageCount > 0) {
      pushMessage("error", "该专题仍有关联图片，请先移除图片专题后再删除。");
      return;
    }
    setConfirmAction({
      title: "删除专题",
      body: `确认删除“${topic.title}”？此操作只移除专题记录，不会修改图片或导出文件。`,
      async onConfirm() {
        await api.deleteTopic(topic.id);
        setTopics((current) =>
          current.filter((record) => record.id !== topic.id),
        );
        if (topicFilter === topic.id) {
          setTopicFilter(allFilterValue);
        }
        if (payload.topicId === topic.id) {
          setPayload((current) => ({
            ...current,
            topicId: "",
            topicTitle: "",
          }));
        }
        pushMessage("success", "专题已删除");
      },
    });
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
      render: (_value, photo) => topicTitleForPhoto(photo),
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
      title: "专题",
      dataIndex: "title",
      width: 220,
      render: (_value, topic) => (
        <div className="topic-title-cell">
          <strong>{topic.title}</strong>
          <Text type="secondary">{topic.id}</Text>
        </div>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      render: (_value, topic) => (
        <Text className="topic-description-cell">
          {topic.description || "暂无描述"}
        </Text>
      ),
    },
    {
      title: "关联图片",
      key: "usage",
      width: 120,
      align: "center",
      render: (_value, topic) => topicUsageById.get(topic.id) ?? 0,
    },
    {
      title: "操作",
      key: "actions",
      width: 170,
      align: "center",
      render: (_value, topic) => {
        const usageCount = topicUsageById.get(topic.id) ?? 0;
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
              title={
                usageCount > 0 ? "先移除该专题下的图片关联后再删除" : undefined
              }
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
        <div className="admin-layout">
          <aside className="admin-sidebar" aria-label="后台导航">
            <div className="admin-sidebar__brand">
              <span>DKPlus Admin</span>
              <strong>图库后台</strong>
            </div>
            <Menu
              className="admin-menu"
              selectedKeys={[activeSection]}
              onClickMenuItem={(key) => navigateToSection(key as AdminSection)}
            >
              <MenuItem key="photos">图片管理</MenuItem>
              <MenuItem key="topics">专题管理</MenuItem>
            </Menu>
          </aside>

          <section className="admin-content">
            {activeSection === "photos" ? (
              <>
                <header className="admin-header" aria-labelledby="page-title">
                  <div>
                    <p className="eyebrow">DKPlus 图库后台</p>
                    <h1 id="page-title">图片管理</h1>
                  </div>
                  <Space wrap>
                    <Button onClick={() => void refresh()} loading={isLoading}>
                      刷新 API
                    </Button>
                    <Button type="primary" onClick={openCreateEditor}>
                      新增图片
                    </Button>
                    <Button onClick={() => setIsUploadOpen(true)}>
                      上传图片
                    </Button>
                    <Button
                      type="outline"
                      loading={isExporting}
                      onClick={() => void exportToClient()}
                    >
                      导出到客户端
                    </Button>
                  </Space>
                </header>

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
                        ...topicOptions.map(([id, title]) => ({
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
                          setSelectedIds(
                            new Set(keys.map((key) => String(key))),
                          ),
                      }}
                      pagination={{
                        pageSize: photoPageSize,
                        size: "small",
                        sizeCanChange: true,
                        sizeOptions: adminPageSizeOptions,
                        onPageSizeChange: (size) => setPhotoPageSize(size),
                        showTotal: (total, range) =>
                          `显示 ${range[0]}-${range[1]}，共 ${total} 条`,
                      }}
                    />
                  </Spin>
                </Card>
              </>
            ) : (
              <>
                <header className="admin-header" aria-labelledby="page-title">
                  <div>
                    <p className="eyebrow">DKPlus 图库后台</p>
                    <h1 id="page-title">专题管理</h1>
                  </div>
                  <Space wrap>
                    <Button onClick={() => void refresh()} loading={isLoading}>
                      刷新 API
                    </Button>
                    <Button type="primary" onClick={openCreateTopicEditor}>
                      新增专题
                    </Button>
                    <Button
                      type="outline"
                      loading={isExporting}
                      onClick={() => void exportToClient()}
                    >
                      导出到客户端
                    </Button>
                  </Space>
                </header>

                <section
                  className="stats-grid topic-stats"
                  aria-label="专题统计"
                >
                  <Card bordered={false}>
                    <Statistic title="专题记录" value={topics.length} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic title="已关联图片" value={topicUsageById.size} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic title="图片记录" value={photos.length} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic
                      title="未关联专题"
                      value={photos.filter((photo) => !photo.topicId).length}
                    />
                  </Card>
                </section>

                <Card
                  className="table-card topic-table-card"
                  bordered={false}
                  title="专题列表"
                  extra={<Tag>{topics.length} 条专题</Tag>}
                >
                  <Spin loading={isLoading} style={{ width: "100%" }}>
                    <Table<TopicRecord>
                      className="photos-table topics-table"
                      rowKey="id"
                      size="mini"
                      border={{ wrapper: true, cell: true }}
                      tableLayoutFixed
                      stripe
                      columns={topicColumns}
                      data={topics}
                      noDataElement={
                        <div className="table-empty-state">
                          <Empty description="暂无专题，可创建标题与描述后用于图片分组" />
                          <Button size="mini" onClick={openCreateTopicEditor}>
                            新增专题
                          </Button>
                        </div>
                      }
                      scroll={{ x: 760 }}
                      pagination={{
                        pageSize: topicPageSize,
                        size: "small",
                        sizeCanChange: true,
                        sizeOptions: adminPageSizeOptions,
                        onPageSizeChange: (size) => setTopicPageSize(size),
                        showTotal: (total, range) =>
                          `显示 ${range[0]}-${range[1]}，共 ${total} 条`,
                      }}
                    />
                  </Spin>
                  <Alert
                    className="topic-delete-policy"
                    type="info"
                    content="删除专题前需先移除相关图片的专题关联；专题 CRUD 仅持久化到 SQLite，客户端 JSON 仍通过导出流程生成。"
                  />
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
              maskClosable
              escToExit
              unmountOnExit
            >
              <div className="editor-shell" aria-label="图片编辑器">
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
                      <span className="editor-exif-status__label">
                        EXIF 状态
                      </span>
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
                        placeholder="选择已有专题（可选）"
                        onChange={(value) =>
                          selectTopic(typeof value === "string" ? value : "")
                        }
                        options={topicOptions.map(([id, title]) => ({
                          label: `${title} (${id})`,
                          value: id,
                        }))}
                      />
                      <small>
                        专题会同步写入主专题字段，并保留既有 topicIds 兼容。
                      </small>
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
                      <small>
                        建议记录场景、项目或发布备注，便于后续编辑。
                      </small>
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
              maskClosable
              escToExit
            >
              <div className="upload-panel">
                <label className="upload-topic-select">
                  <span>当前专题（可选）</span>
                  <Select
                    allowClear
                    showSearch
                    value={payload.topicId || undefined}
                    placeholder="选择已有专题（可选）"
                    onChange={(value) =>
                      selectTopic(typeof value === "string" ? value : "")
                    }
                    options={topicOptions.map(([id, title]) => ({
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
              maskClosable
              escToExit
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
              title={editingTopicId ? "编辑专题" : "新增专题"}
              visible={isTopicEditorOpen}
              onCancel={resetTopicEditor}
              onOk={() => void saveTopic()}
              confirmLoading={isSaving}
              okText="保存"
              cancelText="取消"
              maskClosable
              escToExit
              unmountOnExit
            >
              <div className="topic-form" aria-label="专题资料表单">
                <label>
                  <span>专题标题</span>
                  <Input
                    value={topicPayload.title}
                    onChange={(value) =>
                      setTopicPayload((current) => ({
                        ...current,
                        title: value,
                      }))
                    }
                    placeholder="例如：编辑精选"
                  />
                </label>
                <label>
                  <span>专题描述</span>
                  <TextArea
                    value={topicPayload.description || ""}
                    onChange={(value) =>
                      setTopicPayload((current) => ({
                        ...current,
                        description: value,
                      }))
                    }
                    placeholder="用一两句话描述专题内容"
                    autoSize={{ minRows: 4, maxRows: 7 }}
                  />
                </label>
              </div>
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
              maskClosable
              escToExit
            >
              <p>{confirmAction?.body}</p>
            </Modal>
          </section>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default App;
