import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createRoot } from "react-dom/client";
import {
  buildTopicSummaries,
  groupByMonth,
  normalizePayload,
  tabLabels,
  withPreviewQualityDisplayQuery,
  withThumbnailDisplayQuery,
} from "./gallery";
import type { TopicSummary } from "./gallery";
import type {
  GalleryPayload,
  GridStyle,
  ResolvedPhoto,
  TabKey,
  Topic,
} from "./types";
import { useVirtualRows } from "./useVirtualRows";
import {
  renderWatermarkExport,
  type WatermarkLogoInput,
  type WatermarkRenderInput,
  type WatermarkRenderResult,
  type WatermarkTone,
} from "./watermark";
import "./styles.css";

const staticDataUrl = `${import.meta.env.BASE_URL}data/gallery.json`;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);
const galleryDataUrl = import.meta.env.DEV
  ? `${apiBaseUrl}/gallery`
  : staticDataUrl;

type MainPageKey = "works" | "watermark-export";

type AppRoute = {
  page: MainPageKey;
  tab: TabKey;
  topicKey?: string | undefined;
  photoId?: string | undefined;
};

const mainPageLabels = {
  works: "作品",
  "watermark-export": "水印导出",
} as const;

const routeTabs = new Set<TabKey>(["latest", "topics", "timeline"]);

const defaultWorksRoute = (): AppRoute => ({ page: "works", tab: "latest" });

const parseRouteHash = (hash: string): AppRoute => {
  const path = hash.replace(/^#\/?/, "").replace(/^\/+/, "");
  const [firstSegment, secondSegment, thirdSegment, fourthSegment] =
    path.split("/");
  if (
    firstSegment === "watermark-export" ||
    firstSegment === "watermark" ||
    firstSegment === "export"
  ) {
    return { page: "watermark-export", tab: "latest" };
  }
  if (firstSegment === "works" || firstSegment === "work") {
    if (!secondSegment) return defaultWorksRoute();
    if (secondSegment === "photo" && thirdSegment) {
      return {
        page: "works",
        tab: "latest",
        photoId: safeDecodeRouteSegment(thirdSegment),
      };
    }
    if (secondSegment === "topics") {
      if (thirdSegment === "photo" && fourthSegment) {
        return {
          page: "works",
          tab: "topics",
          photoId: safeDecodeRouteSegment(fourthSegment),
        };
      }
      return thirdSegment
        ? {
            page: "works",
            tab: "topics",
            topicKey: safeDecodeRouteSegment(thirdSegment),
            photoId:
              fourthSegment === "photo"
                ? undefined
                : fourthSegment
                  ? safeDecodeRouteSegment(fourthSegment)
                  : undefined,
          }
        : { page: "works", tab: "topics" };
    }
    if (routeTabs.has(secondSegment as TabKey)) {
      return {
        page: "works",
        tab: secondSegment as TabKey,
        photoId:
          thirdSegment === "photo" && fourthSegment
            ? safeDecodeRouteSegment(fourthSegment)
            : undefined,
      };
    }
    return defaultWorksRoute();
  }
  const [tabSegment, detailSegment] = [firstSegment, secondSegment];
  if (tabSegment === "photo" && detailSegment) {
    return {
      page: "works",
      tab: "latest",
      photoId: safeDecodeRouteSegment(detailSegment),
    };
  }
  if (tabSegment === "topics") {
    return detailSegment
      ? {
          page: "works",
          tab: "topics",
          topicKey: safeDecodeRouteSegment(detailSegment),
        }
      : { page: "works", tab: "topics" };
  }
  if (routeTabs.has(tabSegment as TabKey)) {
    return { page: "works", tab: tabSegment as TabKey };
  }
  return defaultWorksRoute();
};

const safeDecodeRouteSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const routeToHash = (route: AppRoute): string => {
  if (route.page === "watermark-export") {
    return "#/watermark-export";
  }
  if (route.photoId) {
    const photoSegment = `photo/${encodeURIComponent(route.photoId)}`;
    if (route.tab === "topics" && route.topicKey) {
      return `#/works/topics/${encodeURIComponent(route.topicKey)}/${photoSegment}`;
    }
    return `#/works/${route.tab}/${photoSegment}`;
  }
  return `#/works/${route.tab}${
    route.tab === "topics" && route.topicKey
      ? `/${encodeURIComponent(route.topicKey)}`
      : ""
  }`;
};

const topicRouteKey = (topic: Topic): string => topic.slug ?? topic.id;

const preventImageSave = (event: React.MouseEvent<HTMLImageElement>) => {
  event.preventDefault();
};

const galleryRouteWithoutPhoto = (route: AppRoute): AppRoute =>
  route.page === "works" && route.tab === "topics" && route.topicKey
    ? { page: "works", tab: "topics", topicKey: route.topicKey }
    : { page: "works", tab: route.page === "works" ? route.tab : "latest" };

const dataSaverStorageKey = "dkplus:data-saver";

const readStoredDataSaverEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(dataSaverStorageKey) === "true";
  } catch {
    return false;
  }
};

const writeStoredDataSaverEnabled = (enabled: boolean) => {
  try {
    window.localStorage.setItem(dataSaverStorageKey, String(enabled));
  } catch {
    // Ignore storage access errors so the switch still works in private modes.
  }
};

const useGallery = () => {
  const [data, setData] = useState<GalleryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(galleryDataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => active && setData(normalizePayload(payload)))
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : "数据加载失败"),
      );
    return () => {
      active = false;
    };
  }, []);

  return { data, error };
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));

const formatAperture = (value?: number | string) => {
  if (!value) return undefined;
  return typeof value === "string" && value.startsWith("f/")
    ? value
    : `f/${value}`;
};

const PhotoCard = ({
  photo,
  style,
  onOpen,
}: {
  photo: ResolvedPhoto;
  style: GridStyle;
  onOpen: (photo: ResolvedPhoto) => void;
}) => (
  <button
    className={`photo-card ${style}`}
    onClick={() => onOpen(photo)}
    aria-label={`查看图片：${photo.title}`}
  >
    <img
      src={withThumbnailDisplayQuery(photo.urls.thumbnail)}
      alt={photo.asset.alt ?? photo.title}
      loading="lazy"
      width={photo.asset.width}
      height={photo.asset.height}
      draggable={false}
      onContextMenu={preventImageSave}
    />
    <span className="photo-card__meta">
      <strong>{photo.title}</strong>
    </span>
  </button>
);

const VirtualPhotoGrid = ({
  photos,
  style,
  onOpen,
}: {
  photos: ResolvedPhoto[];
  style: GridStyle;
  onOpen: (photo: ResolvedPhoto) => void;
}) => {
  const { columns, containerRef, rows, totalHeight } = useVirtualRows(photos);
  return (
    <div
      ref={containerRef}
      className={`virtual-grid ${style}`}
      style={{ minHeight: totalHeight }}
      aria-label="虚拟化图片列表"
    >
      {rows.map((row) => (
        <div
          className="virtual-grid__row"
          key={row.index}
          style={{
            transform: `translateY(${row.top}px)`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {row.items.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              style={style}
              onOpen={onOpen}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

const TopicGrid = ({
  summaries,
  onSelectTopic,
}: {
  summaries: TopicSummary[];
  onSelectTopic: (topic: Topic) => void;
}) => (
  <div className="topic-grid" aria-label="专题列表">
    {summaries.map(({ topic, cover, count }) => {
      return (
        <button
          className="topic-card"
          key={topic.id}
          onClick={() => onSelectTopic(topic)}
          disabled={!cover}
          aria-label={`查看专题：${topic.title}`}
        >
          {cover ? (
            <img
              src={withThumbnailDisplayQuery(cover.urls.thumbnail)}
              alt={cover.asset.alt ?? topic.title}
              loading="lazy"
              draggable={false}
              onContextMenu={preventImageSave}
            />
          ) : (
            <span className="topic-card__empty" />
          )}
          <span className="topic-card__copy">
            <strong>{topic.title}</strong>
            <small>{count} 张作品</small>
            <em>{topic.description}</em>
          </span>
        </button>
      );
    })}
  </div>
);

const TopicDetail = ({
  topic,
  photos,
  onBack,
  onOpen,
}: {
  topic: GalleryPayload["topics"][number];
  photos: ResolvedPhoto[];
  onBack: () => void;
  onOpen: (photo: ResolvedPhoto) => void;
}) => (
  <section className="topic-detail" aria-labelledby="topic-detail-title">
    <header className="topic-detail__header">
      <div>
        <p className="topic-detail__breadcrumb">专题 / {topic.title}</p>
        <h1 id="topic-detail-title">{topic.title}</h1>
        {topic.description && <p>{topic.description}</p>}
      </div>
      <div className="topic-detail__actions">
        <span>{photos.length} 张作品</span>
        <button type="button" onClick={onBack}>
          返回专题列表
        </button>
      </div>
    </header>
    <VirtualPhotoGrid photos={photos} style="square" onOpen={onOpen} />
  </section>
);

const Timeline = ({
  photos,
  onOpen,
}: {
  photos: ResolvedPhoto[];
  onOpen: (photo: ResolvedPhoto) => void;
}) => {
  const groups = useMemo(() => groupByMonth(photos), [photos]);
  return (
    <div className="timeline" aria-label="按月份分组的时间轴">
      {groups.map((group) => (
        <section key={group.month} className="timeline__month">
          <div className="timeline__heading">
            <span>{group.label}</span>
            <small>{group.photos.length} 张</small>
          </div>
          <VirtualPhotoGrid
            photos={group.photos}
            style="square"
            onOpen={onOpen}
          />
        </section>
      ))}
    </div>
  );
};

const PhotoModal = ({
  photos,
  active,
  dataSaverEnabled,
  onClose,
  onSelect,
}: {
  photos: ResolvedPhoto[];
  active: ResolvedPhoto | null;
  dataSaverEnabled: boolean;
  onClose: () => void;
  onSelect: (photo: ResolvedPhoto) => void;
}) => {
  const [loadedPreview, setLoadedPreview] = useState<{
    photoId: string;
    url: string;
  } | null>(null);
  const index = active
    ? photos.findIndex((photo) => photo.id === active.id)
    : -1;
  const selectOffset = (offset: number) => {
    if (index < 0) return;
    const next = photos[(index + offset + photos.length) % photos.length];
    if (next) onSelect(next);
  };

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") selectOffset(-1);
      if (event.key === "ArrowRight") selectOffset(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, index]);

  const previewUrl = active
    ? dataSaverEnabled
      ? withPreviewQualityDisplayQuery(active.urls.preview)
      : active.urls.preview
    : "";
  const placeholderUrl = active
    ? withThumbnailDisplayQuery(active.urls.thumbnail)
    : "";
  const previewIsLoaded =
    loadedPreview?.photoId === active?.id && loadedPreview?.url === previewUrl;
  const placeholderBackgroundImage = placeholderUrl
    ? `url(${JSON.stringify(placeholderUrl)})`
    : undefined;

  useEffect(() => {
    setLoadedPreview(null);
  }, [active?.id, previewUrl]);

  if (!active) return null;
  const exifRows = [
    [
      "相机",
      [active.exif?.cameraBrand, active.exif?.cameraModel]
        .filter(Boolean)
        .join(" "),
    ],
    ["镜头", active.exif?.lensModel ?? active.exif?.lens],
    ["ISO", active.exif?.iso],
    ["光圈", formatAperture(active.exif?.aperture)],
    ["快门", active.exif?.shutterSpeed ?? active.exif?.shutter],
    [
      "焦距",
      active.exif?.focalLengthMm
        ? `${active.exif.focalLengthMm}mm`
        : active.exif?.focalLength,
    ],
    ["地点", active.location],
    ["日期", formatDate(active.takenAt)],
  ].filter(([, value]) => value);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={active.title}
    >
      <button
        className="modal__scrim"
        onClick={onClose}
        aria-label="关闭图片详情"
      />
      <article className="modal__panel">
        <div
          className="modal__image-wrap"
          data-preview-loaded={previewIsLoaded}
          style={{ backgroundImage: placeholderBackgroundImage }}
        >
          <img
            src={previewUrl}
            alt={active.asset.alt ?? active.title}
            draggable={false}
            onContextMenu={preventImageSave}
            onLoad={() =>
              setLoadedPreview({ photoId: active.id, url: previewUrl })
            }
          />
          <button
            className="modal__nav modal__nav--prev"
            onClick={() => selectOffset(-1)}
            aria-label="上一张"
          >
            ‹
          </button>
          <button
            className="modal__nav modal__nav--next"
            onClick={() => selectOffset(1)}
            aria-label="下一张"
          >
            ›
          </button>
        </div>
        <aside className="modal__info">
          <button className="modal__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
          <p className="eyebrow">
            {index + 1} / {photos.length}
          </p>
          <h2>{active.title}</h2>
          <p>{active.description}</p>
          <dl>
            {exifRows.map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </article>
    </div>
  );
};

type WatermarkFieldState = {
  date: string;
  model: string;
  exposure: string;
  includeDate: boolean;
  includeModel: boolean;
  includeExposure: boolean;
};

type WatermarkLogoOption = WatermarkLogoInput & {
  id: string;
  source: "none" | "built-in" | "admin" | "camera" | "custom";
};

type RawBrandLogo = {
  id?: string;
  name?: string;
  title?: string;
  mark?: string;
  url?: string;
  logoUrl?: string;
  imageUrl?: string;
  dataUrl?: string;
};

type RawBrand = {
  id?: string;
  name?: string;
  title?: string;
  cameraBrand?: string;
  mark?: string;
  url?: string;
  logoUrl?: string;
  logoUrls?: string[];
  imageUrl?: string;
  dataUrl?: string;
  logos?: RawBrandLogo[];
};

const noLogoWatermarkOption: WatermarkLogoOption = {
  id: "none",
  name: "不使用 Logo",
  mark: "",
  source: "none",
};

const builtInWatermarkLogos: WatermarkLogoOption[] = [
  {
    id: "dkplus",
    name: "dk+ photography",
    mark: "dk+",
    source: "built-in",
  },
];

const dateInputValue = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatExposure = (photo?: ResolvedPhoto): string => {
  if (!photo) return "";
  return [
    formatAperture(photo.exif?.aperture),
    photo.exif?.shutterSpeed ?? photo.exif?.shutter,
    photo.exif?.iso ? `ISO ${photo.exif.iso}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
};

const formatCameraModel = (photo?: ResolvedPhoto): string =>
  photo?.exif?.cameraModel?.trim() ?? "";

const watermarkFieldsFromPhoto = (
  photo?: ResolvedPhoto,
): WatermarkFieldState => ({
  date: photo ? dateInputValue(photo.takenAt) : "",
  model: formatCameraModel(photo),
  exposure: formatExposure(photo),
  includeDate: true,
  includeModel: true,
  includeExposure: true,
});

const normalizeLogoMark = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return "dk+";
  const ascii = normalized.match(/[A-Za-z0-9+]/g)?.join("") ?? "";
  if (ascii) return ascii.slice(0, 4);
  return normalized.slice(0, 2);
};

const compactLogoOption = (
  id: string,
  name: string,
  source: WatermarkLogoOption["source"],
  logo?: RawBrandLogo | RawBrand,
): WatermarkLogoOption => {
  const url = logo?.url ?? logo?.logoUrl ?? logo?.imageUrl ?? logo?.dataUrl;
  return {
    id,
    name,
    mark: logo?.mark ?? normalizeLogoMark(name),
    ...(url ? { url } : {}),
    source,
  };
};

const normalizeAdminBrandLogos = (payload: unknown): WatermarkLogoOption[] => {
  const rawBrands = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { brands?: unknown }).brands)
      ? (payload as { brands: unknown[] }).brands
      : [];
  const options: WatermarkLogoOption[] = [];
  rawBrands.forEach((entry, brandIndex) => {
    if (!entry || typeof entry !== "object") return;
    const brand = entry as RawBrand;
    const brandName =
      brand.name ??
      brand.title ??
      brand.cameraBrand ??
      `品牌 ${brandIndex + 1}`;
    const brandId = brand.id ?? `admin-${brandIndex}`;
    if (Array.isArray(brand.logos) && brand.logos.length) {
      brand.logos.forEach((logo, logoIndex) => {
        options.push(
          compactLogoOption(
            `${brandId}:${logo.id ?? logoIndex}`,
            logo.name ?? logo.title ?? brandName,
            "admin",
            { ...brand, ...logo },
          ),
        );
      });
      return;
    }
    if (Array.isArray(brand.logoUrls) && brand.logoUrls.length) {
      brand.logoUrls.forEach((url, logoIndex) => {
        options.push(
          compactLogoOption(`${brandId}:url:${logoIndex}`, brandName, "admin", {
            ...brand,
            url,
          }),
        );
      });
      return;
    }
    if (brand.logoUrl || brand.imageUrl || brand.dataUrl || brand.mark) {
      options.push(compactLogoOption(brandId, brandName, "admin", brand));
    }
  });
  return options;
};

const useAdminBrandLogos = () => {
  const [logos, setLogos] = useState<WatermarkLogoOption[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/brands`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (active && payload) {
          setLogos(normalizeAdminBrandLogos(payload));
        }
      })
      .catch(() => {
        // The admin brand endpoint is supplied by the coordinated brand task.
        // Main keeps the export page usable with built-in and camera-derived logos.
      });
    return () => {
      active = false;
    };
  }, []);

  return logos;
};

const deriveCameraBrandLogos = (
  photos: ResolvedPhoto[],
): WatermarkLogoOption[] => {
  const seen = new Set<string>();
  const options: WatermarkLogoOption[] = [];
  for (const photo of photos) {
    const name = photo.exif?.cameraBrand ?? photo.exif?.cameraMake;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({
      id: `camera:${name}`,
      name,
      mark: normalizeLogoMark(name),
      source: "camera",
    });
  }
  return options;
};

const WatermarkExportPage = ({ photos }: { photos: ResolvedPhoto[] }) => {
  const adminBrandLogos = useAdminBrandLogos();
  const photoById = useMemo(
    () => new Map(photos.map((photo) => [photo.id, photo])),
    [photos],
  );
  const [selectedPhotoId, setSelectedPhotoId] = useState(
    () => photos[0]?.id ?? "",
  );
  const selectedPhoto = photoById.get(selectedPhotoId) ?? photos[0];
  const [fields, setFields] = useState(() =>
    watermarkFieldsFromPhoto(selectedPhoto),
  );
  const [tone, setTone] = useState<WatermarkTone>("black");
  const [customLogo, setCustomLogo] = useState<WatermarkLogoOption | null>(
    null,
  );
  const [selectedLogoId, setSelectedLogoId] = useState("none");
  const [rendered, setRendered] = useState<WatermarkRenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const renderedUrlRef = useRef<string | null>(null);

  const logoOptions = useMemo(() => {
    const merged = [
      noLogoWatermarkOption,
      ...builtInWatermarkLogos,
      ...adminBrandLogos,
      ...deriveCameraBrandLogos(photos),
      ...(customLogo ? [customLogo] : []),
    ];
    const seen = new Set<string>();
    return merged.filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    });
  }, [adminBrandLogos, customLogo, photos]);

  const selectedLogo =
    logoOptions.find((option) => option.id === selectedLogoId) ??
    noLogoWatermarkOption;
  const selectedWatermarkLogo =
    selectedLogo.source === "none" ? undefined : selectedLogo;

  useEffect(() => {
    if (!selectedPhotoId && photos[0]) {
      setSelectedPhotoId(photos[0].id);
      setFields(watermarkFieldsFromPhoto(photos[0]));
    }
  }, [photos, selectedPhotoId]);

  useEffect(() => {
    if (!logoOptions.some((option) => option.id === selectedLogoId)) {
      setSelectedLogoId(noLogoWatermarkOption.id);
    }
  }, [logoOptions, selectedLogoId]);

  const renderInput = useMemo<WatermarkRenderInput | null>(() => {
    if (!selectedPhoto) return null;
    const input: WatermarkRenderInput = {
      imageUrl: selectedPhoto.urls.preview,
      tone,
    };
    if (selectedWatermarkLogo) input.logo = selectedWatermarkLogo;
    if (selectedPhoto.asset.width) input.imageWidth = selectedPhoto.asset.width;
    if (selectedPhoto.asset.height)
      input.imageHeight = selectedPhoto.asset.height;
    if (fields.includeDate && fields.date) input.date = fields.date;
    if (fields.includeModel && fields.model) input.model = fields.model;
    if (fields.includeExposure && fields.exposure) {
      input.exposure = fields.exposure;
    }
    return input;
  }, [fields, selectedPhoto, selectedWatermarkLogo, tone]);

  useEffect(() => {
    if (!renderInput) return;
    let active = true;
    setIsRendering(true);
    setRenderError(null);
    renderWatermarkExport(renderInput)
      .then((result) => {
        if (!active) {
          URL.revokeObjectURL(result.url);
          return;
        }
        if (renderedUrlRef.current) {
          URL.revokeObjectURL(renderedUrlRef.current);
        }
        renderedUrlRef.current = result.url;
        setRendered(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setRenderError(
          reason instanceof Error ? reason.message : "水印渲染失败",
        );
      })
      .finally(() => {
        if (active) setIsRendering(false);
      });
    return () => {
      active = false;
    };
  }, [renderInput]);

  useEffect(
    () => () => {
      if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current);
    },
    [],
  );

  const updateField =
    (key: keyof WatermarkFieldState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.currentTarget.type === "checkbox"
          ? event.currentTarget.checked
          : event.currentTarget.value;
      setFields((current) => ({ ...current, [key]: value }));
    };

  const selectPhoto = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextPhoto = photoById.get(event.currentTarget.value);
    setSelectedPhotoId(event.currentTarget.value);
    setFields(watermarkFieldsFromPhoto(nextPhoto));
  };

  const uploadCustomLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      const option: WatermarkLogoOption = {
        id: "custom",
        name: file.name.replace(/\.[^.]+$/, "") || "自定义 Logo",
        mark: normalizeLogoMark(file.name),
        url,
        source: "custom",
      };
      setCustomLogo(option);
      setSelectedLogoId(option.id);
    };
    reader.readAsDataURL(file);
  };

  if (!selectedPhoto) {
    return (
      <section className="watermark-page" aria-labelledby="watermark-title">
        <h1 id="watermark-title">水印导出</h1>
        <p>暂无可用于示例的作品，请先在后台导出客户端图库。</p>
      </section>
    );
  }

  const statusText = renderError
    ? `渲染失败：${renderError}`
    : isRendering
      ? "正在渲染 Canvas 水印…"
      : rendered
        ? `渲染完成 · ${rendered.width}×${rendered.height} · ${rendered.renderer === "worker" ? "Worker 离线渲染" : "主线程回退"}`
        : "等待渲染";

  return (
    <section className="watermark-page" aria-labelledby="watermark-title">
      <div className="watermark-page__intro">
        <p className="eyebrow">Canvas watermark export</p>
        <h1 id="watermark-title">水印导出</h1>
        <p>
          载入一张示例作品，按测试参考图的底部渐变水印输出；可切换黑白字色，
          也可不选择 Logo，仅保留日期、机型和曝光参数。
        </p>
      </div>

      <div className="watermark-workbench">
        <figure className="watermark-preview" data-tone={tone}>
          {rendered ? (
            <img src={rendered.url} alt={`${selectedPhoto.title} 水印预览`} />
          ) : (
            <div className="watermark-preview__empty">正在生成预览</div>
          )}
          <figcaption className="watermark-status" aria-live="polite">
            {statusText}
          </figcaption>
        </figure>

        <form className="watermark-controls" aria-label="水印导出设置">
          <label>
            <span>示例作品</span>
            <select
              aria-label="选择示例照片"
              value={selectedPhoto.id}
              onChange={selectPhoto}
            >
              {photos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.title}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="watermark-tone">
            <legend>黑白样式</legend>
            <label>
              <input
                type="radio"
                name="watermark-tone"
                value="black"
                checked={tone === "black"}
                onChange={() => setTone("black")}
              />
              白字黑底
            </label>
            <label>
              <input
                type="radio"
                name="watermark-tone"
                value="white"
                checked={tone === "white"}
                onChange={() => setTone("white")}
              />
              黑字白底
            </label>
          </fieldset>

          <label>
            <span>Logo（可选）</span>
            <select
              aria-label="选择 Logo（可选）"
              value={selectedLogo.id}
              onChange={(event) => setSelectedLogoId(event.currentTarget.value)}
            >
              <option value="">不显示 Logo</option>
              {logoOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.source === "admin" ? " · 品牌管理" : ""}
                  {option.source === "camera" ? " · 相机品牌" : ""}
                  {option.source === "custom" ? " · 自定义" : ""}
                  {option.source === "none" ? " · 隐藏" : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>上传自定义 Logo</span>
            <input
              aria-label="上传自定义 Logo"
              type="file"
              accept="image/svg+xml,image/png,image/jpeg,image/webp"
              onChange={uploadCustomLogo}
            />
          </label>

          <div className="watermark-field-grid">
            <label>
              <span>日期</span>
              <input
                aria-label="水印日期"
                type="date"
                value={fields.date}
                onChange={updateField("date")}
              />
            </label>
            <label className="watermark-check">
              <input
                type="checkbox"
                checked={fields.includeDate}
                onChange={updateField("includeDate")}
              />
              显示日期
            </label>
            <label>
              <span>机型</span>
              <input
                aria-label="水印机型"
                value={fields.model}
                onChange={updateField("model")}
              />
            </label>
            <label className="watermark-check">
              <input
                type="checkbox"
                checked={fields.includeModel}
                onChange={updateField("includeModel")}
              />
              显示机型
            </label>
            <label>
              <span>曝光</span>
              <input
                aria-label="水印曝光"
                value={fields.exposure}
                onChange={updateField("exposure")}
              />
            </label>
            <label className="watermark-check">
              <input
                type="checkbox"
                checked={fields.includeExposure}
                onChange={updateField("includeExposure")}
              />
              显示曝光
            </label>
          </div>

          <a
            className="watermark-download"
            href={rendered?.url ?? "#"}
            download={`${selectedPhoto.id}-dkplus-watermark.png`}
            aria-disabled={!rendered || Boolean(renderError)}
            onClick={(event) => {
              if (!rendered || renderError) event.preventDefault();
            }}
          >
            下载带水印图片
          </a>
        </form>
      </div>
    </section>
  );
};

const App = () => {
  const { data, error } = useGallery();
  const [route, setRoute] = useState<AppRoute>(() =>
    parseRouteHash(window.location.hash),
  );
  const [isRoutePending, startRouteTransition] = useTransition();
  const deferredRoute = useDeferredValue(route);
  const [dataSaverEnabled, setDataSaverEnabled] = useState(() =>
    readStoredDataSaverEnabled(),
  );
  const topicSummaries = useMemo(
    () => (data ? buildTopicSummaries(data.topics, data.photos) : []),
    [data],
  );
  const topicSummaryById = useMemo(
    () => new Map(topicSummaries.map((summary) => [summary.topic.id, summary])),
    [topicSummaries],
  );
  const topicSummaryByRouteKey = useMemo(
    () =>
      new Map(
        topicSummaries.map((summary) => [
          topicRouteKey(summary.topic),
          summary,
        ]),
      ),
    [topicSummaries],
  );
  const selectedTopicSummary = deferredRoute.topicKey
    ? (topicSummaryByRouteKey.get(deferredRoute.topicKey) ??
      topicSummaryById.get(deferredRoute.topicKey))
    : undefined;
  const selectedTopic = selectedTopicSummary?.topic;
  const topicPhotos = selectedTopicSummary?.photos ?? [];
  const photoById = useMemo(
    () => new Map((data?.photos ?? []).map((photo) => [photo.id, photo])),
    [data],
  );
  const modalPhotos =
    data && route.page === "works" && route.tab === "topics" && selectedTopic
      ? topicPhotos
      : (data?.photos ?? []);
  const activePhoto =
    route.page === "works" && route.photoId
      ? (photoById.get(route.photoId) ?? null)
      : null;

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = parseRouteHash(window.location.hash);
      startRouteTransition(() => setRoute(nextRoute));
    };
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  useEffect(() => {
    writeStoredDataSaverEnabled(dataSaverEnabled);
  }, [dataSaverEnabled]);

  const navigateToRoute = (nextRoute: AppRoute) => {
    const hash = routeToHash(nextRoute);
    startRouteTransition(() => setRoute(nextRoute));
    if (window.location.hash === hash) return;
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${hash}`,
    );
  };
  const selectMainPage = (page: MainPageKey) =>
    navigateToRoute({ page, tab: "latest" });
  const selectTab = (key: TabKey) =>
    navigateToRoute({ page: "works", tab: key });
  const selectTopic = (topic: Topic) =>
    navigateToRoute({
      page: "works",
      tab: "topics",
      topicKey: topicRouteKey(topic),
    });
  const openPhotoRoute = (photo: ResolvedPhoto) =>
    navigateToRoute({ ...galleryRouteWithoutPhoto(route), photoId: photo.id });
  const closePhotoRoute = () =>
    navigateToRoute(galleryRouteWithoutPhoto(route));

  if (error) {
    return (
      <main className="state" role="alert">
        <h1>图库加载失败</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>重试</button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="state">
        <div className="loader" />
        <h1>正在准备图库</h1>
        <p>加载静态 JSON 与 CDN 图片地址…</p>
      </main>
    );
  }

  return (
    <>
      <header className="hero">
        <nav className="topbar" aria-label="站点导航">
          <a href="#/works/latest" className="brand">
            dk+ photography
          </a>
          <div className="main-menu" role="list" aria-label="主菜单">
            {(Object.keys(mainPageLabels) as MainPageKey[]).map((page) => (
              <a
                key={page}
                className={`main-menu__link ${
                  route.page === page ? "active" : ""
                }`}
                href={routeToHash({ page, tab: "latest" })}
                aria-current={route.page === page ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  selectMainPage(page);
                }}
              >
                {mainPageLabels[page]}
              </a>
            ))}
          </div>
          <div className="topbar__actions">
            <span className="topbar__count">
              {data.photos.length} Photos · {data.topics.length} Topics
            </span>
            <label className="data-saver">
              <input
                type="checkbox"
                role="switch"
                aria-label="省流模式"
                aria-checked={dataSaverEnabled}
                checked={dataSaverEnabled}
                onChange={(event) =>
                  setDataSaverEnabled(event.currentTarget.checked)
                }
              />
              <span className="data-saver__copy">
                <span>省流模式</span>
                <small>{dataSaverEnabled ? "大图低流量" : "原图预览"}</small>
              </span>
            </label>
          </div>
        </nav>
      </header>

      <main
        id={deferredRoute.page === "works" ? "gallery" : "watermark-export"}
        className="shell"
        aria-busy={isRoutePending}
      >
        {deferredRoute.page === "works" ? (
          <>
            <section className="controls" aria-label="图库筛选">
              <div className="tabs" role="tablist" aria-label="图库标签">
                {(Object.keys(tabLabels) as TabKey[]).map((key) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={route.page === "works" && route.tab === key}
                    className={
                      route.page === "works" && route.tab === key
                        ? "active"
                        : ""
                    }
                    onClick={() => selectTab(key)}
                  >
                    {tabLabels[key]}
                  </button>
                ))}
              </div>
            </section>

            {deferredRoute.tab === "latest" && (
              <VirtualPhotoGrid
                photos={data.photos}
                style="square"
                onOpen={openPhotoRoute}
              />
            )}
            {deferredRoute.tab === "topics" &&
              (selectedTopic ? (
                <TopicDetail
                  topic={selectedTopic}
                  photos={topicPhotos}
                  onBack={() =>
                    navigateToRoute({ page: "works", tab: "topics" })
                  }
                  onOpen={openPhotoRoute}
                />
              ) : (
                <TopicGrid
                  summaries={topicSummaries}
                  onSelectTopic={selectTopic}
                />
              ))}
            {deferredRoute.tab === "timeline" && (
              <Timeline photos={data.photos} onOpen={openPhotoRoute} />
            )}
          </>
        ) : (
          <WatermarkExportPage photos={data.photos} />
        )}
      </main>

      <PhotoModal
        photos={modalPhotos}
        active={activePhoto}
        dataSaverEnabled={dataSaverEnabled}
        onClose={closePhotoRoute}
        onSelect={openPhotoRoute}
      />
    </>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
