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
  BrandLogoRecord,
  BrandPayload,
  BrandRecord,
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

const demoBrands: BrandRecord[] = [
  {
    id: "sony",
    name: "Sony",
    title: "Sony / 索尼",
    aliases: [],
    photoCount: 1,
    logoUrls: [
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 80'%3E%3Crect width='240' height='80' fill='%23141414'/%3E%3Ctext x='120' y='51' font-size='34' fill='%23fffdf8' text-anchor='middle' font-family='Georgia,serif'%3ESONY%3C/text%3E%3C/svg%3E",
    ],
    logos: [
      {
        id: "sony-wordmark",
        alt: "黑底字标",
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 80'%3E%3Crect width='240' height='80' fill='%23141414'/%3E%3Ctext x='120' y='51' font-size='34' fill='%23fffdf8' text-anchor='middle' font-family='Georgia,serif'%3ESONY%3C/text%3E%3C/svg%3E",
      },
    ],
  },
  {
    id: "fujifilm",
    name: "Fujifilm",
    title: "Fujifilm / 富士",
    aliases: [],
    photoCount: 1,
    logoUrls: [
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 80'%3E%3Crect width='260' height='80' fill='%23fffdf8'/%3E%3Ctext x='130' y='51' font-size='31' fill='%23141414' text-anchor='middle' font-family='Georgia,serif'%3EFUJIFILM%3C/text%3E%3C/svg%3E",
    ],
    logos: [
      {
        id: "fujifilm-wordmark",
        alt: "白底字标",
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 80'%3E%3Crect width='260' height='80' fill='%23fffdf8'/%3E%3Ctext x='130' y='51' font-size='31' fill='%23141414' text-anchor='middle' font-family='Georgia,serif'%3EFUJIFILM%3C/text%3E%3C/svg%3E",
      },
    ],
  },
];

const emptyPayload: PhotoPayload = {
  title: "",
  description: "",
  topicId: "",
  topicTitle: "",
  topicIds: [],
};

const emptyTopicPayload: TopicPayload = { title: "", description: "" };
const emptyBrandPayload: BrandPayload = {
  name: "",
  title: "",
  aliases: [],
  logos: [],
  logoUrls: [],
};
type AdminSection = "photos" | "topics" | "brands";

const sectionRoutes: Record<AdminSection, string> = {
  photos: "#/photos",
  topics: "#/topics",
  brands: "#/brands",
};

const sectionTitles: Record<AdminSection, string> = {
  photos: "图片管理",
  topics: "专题管理",
  brands: "品牌管理",
};

const parseAdminSection = (hash: string): AdminSection => {
  const normalized = hash.replace(/^#\/?/, "").split(/[?#]/)[0];
  if (normalized === "topics" || normalized === "brands") return normalized;
  return "photos";
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

const normalizeTopicIds = (values: Array<string | undefined>): string[] => [
  ...new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ),
];

const selectValuesToTopicIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return normalizeTopicIds(value.map((entry) => String(entry)));
  }
  return value === undefined || value === null ? [] : [String(value)];
};

const brandKey = (value: string | undefined): string =>
  value?.trim().toLowerCase() || "";

const brandIdForName = (name: string): string => {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `brand-${Array.from(name)
    .map((char) => char.charCodeAt(0).toString(36))
    .join("-")}`;
};

const photoBrandName = (photo: PhotoRecord): string =>
  photo.exif?.cameraMake?.trim() || "";

const deriveBrandsFromPhotos = (records: PhotoRecord[]): BrandRecord[] => {
  const metrics = new Map<string, { name: string; count: number }>();
  for (const photo of records) {
    const name = photoBrandName(photo);
    if (!name) continue;
    const key = brandKey(name);
    const current = metrics.get(key) ?? { name, count: 0 };
    metrics.set(key, { ...current, count: current.count + 1 });
  }
  return [...metrics.values()].map((metric) => ({
    id: `auto-${brandIdForName(metric.name)}`,
    name: metric.name,
    title: metric.name,
    aliases: [],
    logos: [],
    logoUrls: [],
    photoCount: metric.count,
  }));
};

const mergeBrandsWithPhotoBrands = (
  records: BrandRecord[],
  photoRecords: PhotoRecord[],
): BrandRecord[] => {
  const photoBrands = deriveBrandsFromPhotos(photoRecords);
  const photoCountByKey = new Map(
    photoBrands.map((brand) => [brandKey(brand.name), brand.photoCount ?? 0]),
  );
  const byName = new Map<string, BrandRecord>();

  for (const brand of records) {
    const name = brand.name || brand.title || brand.id;
    const key = brandKey(name);
    if (!key) continue;
    byName.set(key, {
      ...brand,
      name,
      title: brand.title || name,
      aliases: brand.aliases ?? [],
      logos: brand.logos ?? [],
      logoUrls: brand.logoUrls ?? (brand.logos ?? []).map((logo) => logo.url),
      photoCount: photoCountByKey.get(key) ?? brand.photoCount ?? 0,
    });
  }

  for (const brand of photoBrands) {
    const key = brandKey(brand.name);
    if (!byName.has(key)) byName.set(key, brand);
  }

  return [...byName.values()].sort((left, right) =>
    (left.title || left.name).localeCompare(right.title || right.name, "zh-CN"),
  );
};

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [topics, setTopics] = useState<TopicRecord[]>([]);
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>(() =>
    currentAdminSection(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [payload, setPayload] = useState<PhotoPayload>(emptyPayload);
  const [topicPayload, setTopicPayload] =
    useState<TopicPayload>(emptyTopicPayload);
  const [brandPayload, setBrandPayload] =
    useState<BrandPayload>(emptyBrandPayload);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
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
  const brandLogoFileInputRef = useRef<HTMLInputElement>(null);
  const [titleFilter, setTitleFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBrandLogoUploading, setIsBrandLogoUploading] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTopicEditorOpen, setIsTopicEditorOpen] = useState(false);
  const [isBrandEditorOpen, setIsBrandEditorOpen] = useState(false);
  const [photoPageSize, setPhotoPageSize] = useState(10);
  const [topicPageSize, setTopicPageSize] = useState(10);
  const [brandPageSize, setBrandPageSize] = useState(10);
  const [brandSearch, setBrandSearch] = useState("");
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
      let brandRecords: BrandRecord[];
      try {
        brandRecords = await api.listBrands();
      } catch {
        brandRecords = deriveBrandsFromPhotos(records);
      }
      setPhotos(records);
      setTopics(topicRecords);
      setBrands(mergeBrandsWithPhotoBrands(brandRecords, records));
    } catch (error) {
      setPhotos(demoPhotos);
      setTopics(demoTopics);
      setBrands(mergeBrandsWithPhotoBrands(demoBrands, demoPhotos));
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
    document.title = `${sectionTitles[activeSection]} · DKPlus Admin`;
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
      for (const topicId of normalizeTopicIds([
        photo.topicId,
        ...(photo.topicIds ?? []),
      ])) {
        if (!map.has(topicId)) {
          map.set(
            topicId,
            topicId === photo.topicId
              ? photo.topicTitle || photo.topicId
              : topicId,
          );
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
      const topicIds = normalizeTopicIds([
        photo.topicId,
        ...(photo.topicIds ?? []),
      ]);
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
        normalizeTopicIds([photo.topicId, ...(photo.topicIds ?? [])]),
      );
      for (const id of ids) {
        usage.set(id, (usage.get(id) ?? 0) + 1);
      }
    }
    return usage;
  }, [photos]);
  const brandUsageByName = useMemo(() => {
    const usage = new Map<string, number>();
    for (const photo of photos) {
      const key = brandKey(photoBrandName(photo));
      if (key) usage.set(key, (usage.get(key) ?? 0) + 1);
    }
    return usage;
  }, [photos]);
  const brandPhotoCount = (brand: BrandRecord): number =>
    brandUsageByName.get(brandKey(brand.name)) ?? brand.photoCount ?? 0;
  const filteredBrands = useMemo(() => {
    const keyword = brandSearch.trim().toLowerCase();
    if (!keyword) return brands;
    return brands.filter((brand) =>
      [
        brand.name,
        brand.title,
        ...(brand.aliases ?? []),
        ...brand.logos.flatMap((logo) => [logo.label, logo.alt, logo.url]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [brandSearch, brands]);
  const brandLogoCount = brands.reduce(
    (count, brand) => count + brand.logos.filter((logo) => logo.url).length,
    0,
  );
  const syncedBrandCount = brands.filter(
    (brand) => brandPhotoCount(brand) > 0,
  ).length;
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

  const titleForTopicId = (topicId: string): string =>
    topicOptions.find(([id]) => id === topicId)?.[1] || topicId;

  const topicIdsForPhoto = (photo: PhotoRecord): string[] =>
    normalizeTopicIds([...(photo.topicIds ?? []), photo.topicId]);

  const selectTopics = (topicIds: string[]) => {
    const normalizedTopicIds = normalizeTopicIds(topicIds);
    const primaryTopicId = normalizedTopicIds[0] || "";
    setPayload((current) => ({
      ...current,
      topicId: primaryTopicId,
      topicTitle: primaryTopicId ? titleForTopicId(primaryTopicId) : "",
      topicIds: normalizedTopicIds,
    }));
  };

  const withTopicTitles = (
    photo: PhotoRecord,
    topicIds = topicIdsForPhoto(photo),
  ): PhotoRecord => {
    const normalizedTopicIds = normalizeTopicIds(topicIds);
    const primaryTopicId = normalizedTopicIds[0] || "";

    if (!primaryTopicId) {
      return {
        ...photo,
        topicId: undefined,
        topicTitle: undefined,
        topicIds: [],
      };
    }

    return {
      ...photo,
      topicId: primaryTopicId,
      topicTitle: titleForTopicId(primaryTopicId),
      topicIds: normalizedTopicIds,
    };
  };

  const withSelectedTopics = (photo: PhotoRecord): PhotoRecord =>
    withTopicTitles(
      photo,
      normalizeTopicIds([...(payload.topicIds ?? []), payload.topicId]),
    );

  const topicLabelForIds = (topicIds: string[]): string =>
    normalizeTopicIds(topicIds).map(titleForTopicId).join("、") || "未指定专题";

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
    const topicIds = topicIdsForPhoto(photo);
    const primaryTopicId = topicIds[0] || "";
    setEditingId(photo.id);
    setPayload({
      title: photo.title || "",
      description: photo.description || "",
      topicId: primaryTopicId,
      topicTitle: primaryTopicId ? titleForTopicId(primaryTopicId) : "",
      topicIds,
      exif: photo.exif,
    });
    replaceEditorPreview(null);
    setIsEditorOpen(true);
  };

  const savePhoto = async () => {
    setIsSaving(true);
    try {
      const cleanTopicIds = normalizeTopicIds([
        ...(payload.topicIds ?? []),
        payload.topicId,
      ]);
      const cleanPrimaryTopicId = cleanTopicIds[0] || "";
      const cleanPayload: PhotoPayload = {
        ...payload,
        title: payload.title?.trim(),
        description: payload.description?.trim(),
        topicIds: cleanTopicIds,
        topicId: cleanPrimaryTopicId,
        topicTitle: cleanPrimaryTopicId
          ? titleForTopicId(cleanPrimaryTopicId)
          : "",
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
                  topicIds: cleanPayload.topicIds ?? [],
                },
                editingId,
              )
            ).photo
          : await api.updatePhoto(editingId, cleanPayload);
        if (!updated) throw new Error("图片更新后没有返回记录。");
        const updatedWithTopic = withSelectedTopics(updated);
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
          topicIds: cleanPayload.topicIds ?? [],
        });
        const created = result.photo;
        if (!created) throw new Error("上传后没有返回图片记录。");
        setPhotos((current) => [withSelectedTopics(created), ...current]);
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
    const selectedTopicIds = normalizeTopicIds([
      ...(payload.topicIds ?? []),
      payload.topicId,
    ]);
    const preview: UploadPreview = {
      id: randomId(),
      file,
      previewUrl: URL.createObjectURL(file),
      title:
        payload.title?.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      topicId: selectedTopicIds[0] || "",
      topicIds: selectedTopicIds,
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
    const selectedTopicIds = normalizeTopicIds([
      ...(payload.topicIds ?? []),
      payload.topicId,
    ]);
    if (mode === "topic" && selectedTopicIds.length === 0) {
      pushMessage("error", "请先选择至少一个专题，再按当前专题选择图片。");
      return;
    }
    const staged = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        topicId: selectedTopicIds[0] || "",
        topicIds: selectedTopicIds,
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
        return withTopicTitles(photo, preview?.topicIds ?? []);
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

  const brandLogoLabel = (logo: BrandLogoRecord): string =>
    logo.label ?? logo.alt ?? "";

  const emptyBrandLogo = (): BrandLogoRecord => ({
    id: randomId(),
    url: "",
    label: "",
  });

  const openCreateBrandEditor = () => {
    setEditingBrandId(null);
    setBrandPayload({ ...emptyBrandPayload, logos: [emptyBrandLogo()] });
    setIsBrandEditorOpen(true);
    setActiveSection("brands");
  };

  const editBrand = (brand: BrandRecord) => {
    setEditingBrandId(brand.id);
    setBrandPayload({
      name: brand.name,
      title: brand.title ?? brand.name,
      aliases: brand.aliases ?? [],
      logoUrls: brand.logoUrls ?? brand.logos.map((logo) => logo.url),
      logos: brand.logos.length
        ? brand.logos.map((logo) => ({
            ...logo,
            id: logo.id ?? logo.key ?? randomId(),
            label: brandLogoLabel(logo),
          }))
        : [emptyBrandLogo()],
    });
    setIsBrandEditorOpen(true);
  };

  const resetBrandEditor = () => {
    setEditingBrandId(null);
    setBrandPayload(emptyBrandPayload);
    if (brandLogoFileInputRef.current) {
      brandLogoFileInputRef.current.value = "";
    }
    setIsBrandEditorOpen(false);
  };

  const updateBrandLogo = (
    index: number,
    field: "url" | "alt",
    value: string,
  ) => {
    setBrandPayload((current) => ({
      ...current,
      logos: (current.logos ?? []).map((logo, logoIndex) =>
        logoIndex === index ? { ...logo, [field]: value } : logo,
      ),
    }));
  };

  const removeBrandLogo = (index: number) => {
    setBrandPayload((current) => ({
      ...current,
      logos: (current.logos ?? []).filter(
        (_logo, logoIndex) => logoIndex !== index,
      ),
    }));
  };

  const addBrandLogo = () => {
    setBrandPayload((current) => ({
      ...current,
      logos: [...(current.logos ?? []), emptyBrandLogo()],
    }));
  };

  const applySavedBrand = (saved: BrandRecord) => {
    setBrands((current) => {
      const withoutCurrent = current.filter(
        (brand) =>
          brand.id !== saved.id &&
          (!editingBrandId || brand.id !== editingBrandId),
      );
      return mergeBrandsWithPhotoBrands([...withoutCurrent, saved], photos);
    });
  };

  const uploadBrandLogoFiles = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    if (!editingBrandId) {
      pushMessage("error", "请先保存品牌，再上传 Logo 文件。");
      return;
    }

    setIsBrandLogoUploading(true);
    try {
      const saved = await api.uploadBrandLogos(editingBrandId, selectedFiles);
      applySavedBrand(saved);
      setBrandPayload((current) => ({
        ...current,
        name: saved.name,
        title: saved.title ?? saved.name,
        aliases: saved.aliases ?? [],
        logoUrls: saved.logoUrls ?? [],
        logos: saved.logos.length
          ? saved.logos.map((logo) => ({
              ...logo,
              id: logo.id ?? logo.key ?? randomId(),
              label: brandLogoLabel(logo),
            }))
          : current.logos,
      }));
      pushMessage("success", `已上传 ${selectedFiles.length} 个 Logo 文件`);
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "上传品牌 Logo 失败",
      );
    } finally {
      setIsBrandLogoUploading(false);
      if (brandLogoFileInputRef.current) {
        brandLogoFileInputRef.current.value = "";
      }
    }
  };

  const saveBrand = async () => {
    const name = brandPayload.name.trim();
    if (!name) {
      pushMessage("error", "请填写品牌名称。");
      return;
    }

    const cleanLogos = brandPayload.logos
      .map((logo) => ({
        ...logo,
        id: logo.id?.trim() || undefined,
        url: logo.url.trim(),
        label: brandLogoLabel(logo).trim() || undefined,
        alt: brandLogoLabel(logo).trim() || undefined,
      }))
      .filter((logo) => Boolean(logo.url));
    const cleanPayload: BrandPayload = {
      ...brandPayload,
      name,
      title: brandPayload.title?.trim() || name,
      logos: cleanLogos,
      logoUrls: cleanLogos.map((logo) => logo.url),
    };

    setIsSaving(true);
    try {
      const saved = editingBrandId
        ? await api.updateBrand(editingBrandId, cleanPayload)
        : await api.createBrand(cleanPayload);
      applySavedBrand(saved);
      pushMessage(
        "success",
        editingBrandId ? "品牌已更新" : `品牌“${saved.title || saved.name}”已创建`,
      );
      resetBrandEditor();
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "保存品牌失败",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeleteBrand = (brand: BrandRecord) => {
    const usageCount = brandPhotoCount(brand);
    setConfirmAction({
      title: "删除品牌",
      body: `确认删除“${brand.title || brand.name}”？${
        usageCount > 0
          ? "照片 EXIF 中仍存在该品牌，刷新后会通过自动同步再次出现。"
          : "此操作会移除品牌与 Logo 配置。"
      }`,
      async onConfirm() {
        await api.deleteBrand(brand.id);
        setBrands((current) =>
          current.filter((record) => record.id !== brand.id),
        );
        pushMessage("success", "品牌已删除");
      },
    });
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
        if (
          normalizeTopicIds([
            ...(payload.topicIds ?? []),
            payload.topicId,
          ]).includes(topic.id)
        ) {
          setPayload((current) => {
            const nextTopicIds = normalizeTopicIds([
              ...(current.topicIds ?? []),
              current.topicId,
            ]).filter((topicId) => topicId !== topic.id);
            const primaryTopicId = nextTopicIds[0] || "";
            return {
              ...current,
              topicIds: nextTopicIds,
              topicId: primaryTopicId,
              topicTitle: primaryTopicId ? titleForTopicId(primaryTopicId) : "",
            };
          });
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
      width: 190,
      align: "center",
      render: (_value, photo) => {
        const topicIds = topicIdsForPhoto(photo);
        return topicIds.length ? (
          <Space size="mini" wrap className="topic-tags">
            {topicIds.map((topicId) => (
              <Tag key={topicId}>{titleForTopicId(topicId)}</Tag>
            ))}
          </Space>
        ) : (
          "未分组"
        );
      },
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


  const brandColumns: TableColumnProps<BrandRecord>[] = [
    {
      title: "品牌",
      dataIndex: "title",
      width: 220,
      render: (_value, brand) => (
        <div className="brand-title-cell">
          <strong>{brand.title || brand.name}</strong>
          <Text type="secondary">{brand.name}</Text>
        </div>
      ),
    },
    {
      title: "Logo",
      key: "logos",
      width: 260,
      align: "center",
      render: (_value, brand) => {
        const logos = brand.logos.filter((logo) => logo.url);
        return logos.length ? (
          <div className="brand-logo-strip" aria-label={`${brand.name} Logo`}>
            {logos.slice(0, 4).map((logo, index) => (
              <figure key={logo.id || `${logo.url}-${index}`}>
                <img
                  src={withAdminThumbnailDisplayUrl(logo.url) || logo.url}
                  alt={brandLogoLabel(logo) || `${brand.name} logo ${index + 1}`}
                  loading="lazy"
                />
                <figcaption>{brandLogoLabel(logo) || `Logo ${index + 1}`}</figcaption>
              </figure>
            ))}
            {logos.length > 4 && <Tag>+{logos.length - 4}</Tag>}
          </div>
        ) : (
          <Text type="secondary">未配置 Logo</Text>
        );
      },
    },
    {
      title: "图片数",
      key: "photoCount",
      width: 110,
      align: "center",
      render: (_value, brand) => brandPhotoCount(brand),
    },
    {
      title: "同步状态",
      key: "sync",
      width: 150,
      align: "center",
      render: (_value, brand) =>
        brandPhotoCount(brand) > 0 ? (
          <Tag color="green">EXIF 自动同步</Tag>
        ) : (
          <Tag>手动维护</Tag>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 170,
      align: "center",
      render: (_value, brand) => (
        <Space size="mini">
          <Button size="mini" type="outline" onClick={() => editBrand(brand)}>
            编辑
          </Button>
          <Button
            size="mini"
            status="danger"
            type="outline"
            onClick={() => requestDeleteBrand(brand)}
          >
            删除
          </Button>
        </Space>
      ),
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
              <MenuItem key="brands">品牌管理</MenuItem>
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
            ) : activeSection === "topics" ? (
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
                      value={
                        photos.filter(
                          (photo) => topicIdsForPhoto(photo).length === 0,
                        ).length
                      }
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
            ) : (
              <>
                <header className="admin-header" aria-labelledby="page-title">
                  <div>
                    <p className="eyebrow">DKPlus 图库后台</p>
                    <h1 id="page-title">品牌管理</h1>
                  </div>
                  <Space wrap>
                    <Button onClick={() => void refresh()} loading={isLoading}>
                      刷新 API
                    </Button>
                    <Button type="primary" onClick={openCreateBrandEditor}>
                      新增品牌
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
                  className="stats-grid brand-stats"
                  aria-label="品牌统计"
                >
                  <Card bordered={false}>
                    <Statistic title="品牌记录" value={brands.length} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic title="照片同步品牌" value={syncedBrandCount} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic title="Logo 数量" value={brandLogoCount} />
                  </Card>
                  <Card bordered={false}>
                    <Statistic
                      title="未配置 Logo"
                      value={
                        brands.filter(
                          (brand) =>
                            brand.logos.filter((logo) => logo.url).length === 0,
                        ).length
                      }
                    />
                  </Card>
                </section>

                <Card className="toolbar-card brand-toolbar-card" bordered={false}>
                  <div className="brand-toolbar">
                    <Input
                      allowClear
                      aria-label="按品牌筛选"
                      value={brandSearch}
                      onChange={setBrandSearch}
                      placeholder="按品牌、别名或 Logo 地址筛选"
                    />
                    <Space wrap className="toolbar-actions">
                      <Button type="primary" onClick={openCreateBrandEditor}>
                        新增品牌
                      </Button>
                      <Button onClick={() => void refresh()} loading={isLoading}>
                        刷新并同步照片品牌
                      </Button>
                    </Space>
                  </div>
                </Card>

                <Card
                  className="table-card brand-table-card"
                  bordered={false}
                  title="品牌列表"
                  extra={<Tag>{filteredBrands.length} 条品牌</Tag>}
                >
                  <Spin loading={isLoading} style={{ width: "100%" }}>
                    <Table<BrandRecord>
                      className="photos-table brands-table"
                      rowKey="id"
                      size="mini"
                      border={{ wrapper: true, cell: true }}
                      tableLayoutFixed
                      stripe
                      columns={brandColumns}
                      data={filteredBrands}
                      noDataElement={
                        <div className="table-empty-state">
                          <Empty description="暂无品牌，可从照片 EXIF 自动同步或手动新增品牌 Logo" />
                          <Button size="mini" onClick={openCreateBrandEditor}>
                            新增品牌
                          </Button>
                        </div>
                      }
                      scroll={{ x: 910 }}
                      pagination={{
                        pageSize: brandPageSize,
                        size: "small",
                        sizeCanChange: true,
                        sizeOptions: adminPageSizeOptions,
                        onPageSizeChange: (size) => setBrandPageSize(size),
                        showTotal: (total, range) =>
                          `显示 ${range[0]}-${range[1]}，共 ${total} 条`,
                      }}
                    />
                  </Spin>
                  <Alert
                    className="brand-sync-policy"
                    type="info"
                    content="刷新时会读取服务端品牌记录，并把照片 EXIF 中出现但尚未配置的相机品牌补入列表，便于继续补充多个 Logo。"
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
                      <span>专题（可多选）</span>
                      <Select
                        allowClear
                        mode="multiple"
                        showSearch
                        value={payload.topicIds ?? []}
                        placeholder="选择一个或多个专题（可选）"
                        onChange={(value) =>
                          selectTopics(selectValuesToTopicIds(value))
                        }
                        options={topicOptions.map(([id, title]) => ({
                          label: `${title} (${id})`,
                          value: id,
                        }))}
                      />
                      <small>
                        可同时关联多个专题；第一个专题会同步到兼容字段。
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
                  <span>当前专题（可多选）</span>
                  <Select
                    allowClear
                    mode="multiple"
                    showSearch
                    value={payload.topicIds ?? []}
                    placeholder="选择一个或多个专题（可选）"
                    onChange={(value) =>
                      selectTopics(selectValuesToTopicIds(value))
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
                          <span>{topicLabelForIds(preview.topicIds)}</span>
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
              title={editingBrandId ? "编辑品牌" : "新增品牌"}
              visible={isBrandEditorOpen}
              onCancel={resetBrandEditor}
              onOk={() => void saveBrand()}
              confirmLoading={isSaving}
              okText="保存"
              cancelText="取消"
              className="brand-editor-modal"
              maskClosable
              escToExit
              unmountOnExit
            >
              <div className="brand-form" aria-label="品牌资料表单">
                <section className="brand-form__hero">
                  <span className="editor-section-label">Brand Kit</span>
                  <h2>品牌与 Logo 配置</h2>
                  <p>
                    名称用于匹配照片 EXIF 相机品牌；Logo 可添加多个黑白或透明底版本，供前台水印导出选择。
                  </p>
                </section>
                <label>
                  <span>品牌名称</span>
                  <Input
                    value={brandPayload.name}
                    onChange={(value) =>
                      setBrandPayload((current) => ({
                        ...current,
                        name: value,
                        title: current.title || value,
                      }))
                    }
                    placeholder="例如：Sony"
                  />
                  <small>需与上传照片 EXIF 中的相机品牌保持一致，刷新后可自动同步。</small>
                </label>
                <label>
                  <span>显示标题</span>
                  <Input
                    value={brandPayload.title || ""}
                    onChange={(value) =>
                      setBrandPayload((current) => ({ ...current, title: value }))
                    }
                    placeholder="例如：Sony / 索尼"
                  />
                  <small>用于后台表格和前台水印选择器展示。</small>
                </label>
                <section className="brand-logo-editor span-2">
                  <div className="brand-logo-editor__header">
                    <div>
                      <span className="editor-section-label">Logos</span>
                      <strong>多个 Logo</strong>
                    </div>
                    <Space wrap>
                      <Button type="outline" onClick={addBrandLogo}>
                        添加 Logo
                      </Button>
                      <Button
                        type="secondary"
                        disabled={!editingBrandId}
                        loading={isBrandLogoUploading}
                        onClick={() => brandLogoFileInputRef.current?.click()}
                      >
                        上传 Logo 图片
                      </Button>
                    </Space>
                  </div>
                  <input
                    ref={brandLogoFileInputRef}
                    className="brand-logo-file-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) =>
                      void uploadBrandLogoFiles(event.currentTarget.files)
                    }
                  />
                  {!editingBrandId && (
                    <Text type="secondary">
                      保存品牌后可上传图片 Logo；当前可先手动添加 Logo URL。
                    </Text>
                  )}
                  {brandPayload.logos.length ? (
                    brandPayload.logos.map((logo, index) => (
                      <div className="brand-logo-row" key={logo.id || index}>
                        <div className="brand-logo-row__preview">
                          {logo.url?.trim() ? (
                            <img
                              src={withAdminThumbnailDisplayUrl(logo.url) || logo.url}
                              alt={brandLogoLabel(logo) || `Logo ${index + 1}`}
                            />
                          ) : (
                            <span>Logo</span>
                          )}
                        </div>
                        <Input
                          value={brandLogoLabel(logo)}
                          onChange={(value) =>
                            updateBrandLogo(index, "alt", value)
                          }
                          placeholder="标签，如：黑色横版"
                        />
                        <Input
                          value={logo.url || ""}
                          onChange={(value) => updateBrandLogo(index, "url", value)}
                          placeholder="Logo URL，可为 /uploads/... 或 https://..."
                        />
                        <Button
                          status="danger"
                          type="outline"
                          onClick={() => removeBrandLogo(index)}
                        >
                          移除
                        </Button>
                      </div>
                    ))
                  ) : (
                    <Empty description="尚未添加 Logo，可先保存品牌后再补充" />
                  )}
                </section>
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
