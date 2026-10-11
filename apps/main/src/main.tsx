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
import "./styles.css";

const staticDataUrl = `${import.meta.env.BASE_URL}data/gallery.json`;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);
const galleryDataUrl = import.meta.env.DEV
  ? `${apiBaseUrl}/gallery`
  : staticDataUrl;
const brandLogoUrl = `${import.meta.env.BASE_URL}img/logo-black.png`;
const brandLogoWhiteUrl = `${import.meta.env.BASE_URL}img/logo-white.png`;
const contactQrUrl = `${import.meta.env.BASE_URL}img/contact-me.JPG`;
const modalMaxBoxHeight = "min(820px, calc(100dvh - clamp(24px, 6vw, 72px)))";

type AppRoute = {
  tab: TabKey;
  topicKey?: string | undefined;
  photoId?: string | undefined;
};

const routeTabs = new Set<TabKey>(["latest", "topics", "timeline"]);

const defaultWorksRoute = (): AppRoute => ({ tab: "latest" });

const parseRouteHash = (hash: string): AppRoute => {
  const rawPath = hash.replace(/^#\/?/, "").replace(/^\/+/, "");
  const queryStart = rawPath.indexOf("?");
  const path = queryStart >= 0 ? rawPath.slice(0, queryStart) : rawPath;
  const [firstSegment, secondSegment, thirdSegment, fourthSegment] =
    path.split("/");
  if (firstSegment === "works" || firstSegment === "work") {
    if (!secondSegment) return defaultWorksRoute();
    if (secondSegment === "photo" && thirdSegment) {
      return {
        tab: "latest",
        photoId: safeDecodeRouteSegment(thirdSegment),
      };
    }
    if (secondSegment === "topics") {
      if (thirdSegment === "photo" && fourthSegment) {
        return {
          tab: "topics",
          photoId: safeDecodeRouteSegment(fourthSegment),
        };
      }
      return thirdSegment
        ? {
            tab: "topics",
            topicKey: safeDecodeRouteSegment(thirdSegment),
            photoId:
              fourthSegment === "photo"
                ? undefined
                : fourthSegment
                  ? safeDecodeRouteSegment(fourthSegment)
                  : undefined,
          }
        : { tab: "topics" };
    }
    if (routeTabs.has(secondSegment as TabKey)) {
      return {
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
      tab: "latest",
      photoId: safeDecodeRouteSegment(detailSegment),
    };
  }
  if (tabSegment === "topics") {
    return detailSegment
      ? {
          tab: "topics",
          topicKey: safeDecodeRouteSegment(detailSegment),
        }
      : { tab: "topics" };
  }
  if (routeTabs.has(tabSegment as TabKey)) {
    return { tab: tabSegment as TabKey };
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
  route.tab === "topics" && route.topicKey
    ? { tab: "topics", topicKey: route.topicKey }
    : { tab: route.tab };

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

const formatAperture = (value?: number | string) => {
  if (!value) return undefined;
  return typeof value === "string" && value.startsWith("f/")
    ? value
    : `f/${value}`;
};

const watermarkMetadataSpacer = "  ";
const watermarkSecondarySpacer = "     ";

const formatExposure = (photo?: ResolvedPhoto): string => {
  if (!photo) return "";
  return [
    formatAperture(photo.exif?.aperture),
    photo.exif?.shutterSpeed ?? photo.exif?.shutter,
    photo.exif?.iso ? `ISO ${photo.exif.iso}` : undefined,
  ]
    .filter(Boolean)
    .join(watermarkMetadataSpacer);
};

const formatCameraModel = (photo?: ResolvedPhoto): string =>
  photo?.exif?.cameraModel?.trim() ?? "";

const formatLensModel = (photo?: ResolvedPhoto): string =>
  (photo?.exif?.lensModel ?? photo?.exif?.lens)?.trim() ?? "";

const formatFocalLength = (photo?: ResolvedPhoto): string => {
  const raw = photo?.exif?.focalLengthMm ?? photo?.exif?.focalLength;
  if (raw === undefined || raw === null) return "";
  const normalized = String(raw).trim();
  if (!normalized) return "";
  return /mm$/i.test(normalized) ? normalized : `${normalized}mm`;
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
    {summaries
      .filter((summary) => summary.count > 0)
      .map(({ topic, cover, count }) => {
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
  const [displayed, setDisplayed] = useState<{
    photo: ResolvedPhoto;
    url: string;
  } | null>(null);
  const [loadedPreview, setLoadedPreview] = useState<{
    photoId: string;
    url: string;
  } | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const [previewRatio, setPreviewRatio] = useState<number | null>(null);
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
    !!displayed &&
    loadedPreview?.photoId === displayed.photo.id &&
    loadedPreview?.url === displayed.url;
  const placeholderBackgroundImage = placeholderUrl
    ? `url(${JSON.stringify(placeholderUrl)})`
    : undefined;

  // Keep showing the current photo until the next preview has been
  // preloaded, then swap photo and panel ratio in a single commit so
  // switching never flashes an empty frame.
  useEffect(() => {
    if (!active) {
      setDisplayed(null);
      setPreviewRatio(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    const swap = () => {
      if (cancelled) return;
      if (image.naturalWidth && image.naturalHeight) {
        setPreviewRatio(image.naturalWidth / image.naturalHeight);
      }
      setDisplayed({ photo: active, url: previewUrl });
    };
    image.onload = swap;
    image.onerror = swap;
    image.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [active, previewUrl]);

  // First open: size the panel from the grid-cached thumbnail while the
  // preview is still loading.
  useEffect(() => {
    if (!active || displayed || !placeholderUrl) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth && image.naturalHeight) {
        setPreviewRatio(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = placeholderUrl;
    return () => {
      cancelled = true;
    };
  }, [active, displayed, placeholderUrl]);

  // Cached previews can finish decoding before the img mounts, so flip the
  // fade-in from this effect as well as onLoad.
  useEffect(() => {
    if (!displayed) return;
    const image = previewImageRef.current;
    if (image?.complete && image.naturalWidth && image.naturalHeight) {
      setLoadedPreview({ photoId: displayed.photo.id, url: displayed.url });
    }
  }, [displayed]);

  if (!active) return null;
  const watermarkPhoto = displayed?.photo ?? active;
  const watermarkPrimary = [
    formatFocalLength(watermarkPhoto),
    formatExposure(watermarkPhoto),
  ]
    .filter(Boolean)
    .join(watermarkMetadataSpacer);
  const watermarkSecondary = [
    formatCameraModel(watermarkPhoto),
    formatLensModel(watermarkPhoto),
  ]
    .filter(Boolean)
    .join(watermarkSecondarySpacer);
  const panelStyle = (
    previewRatio
      ? {
          "--photo-ratio": `${previewRatio}`,
          "--photo-width": `min(100%, calc(${modalMaxBoxHeight} * ${previewRatio}))`,
          "--photo-height": "auto",
        }
      : {}
  ) as React.CSSProperties;

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
      <article className="modal__panel" style={panelStyle}>
        <div
          className="modal__image-wrap"
          data-preview-loaded={previewIsLoaded}
          style={{ backgroundImage: placeholderBackgroundImage }}
        >
          <button className="modal__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
          {displayed && (
            <img
              key={`${displayed.photo.id}:${displayed.url}`}
              ref={previewImageRef}
              className="modal__preview"
              src={displayed.url}
              alt={displayed.photo.asset.alt ?? displayed.photo.title}
              draggable={false}
              onContextMenu={preventImageSave}
              onLoad={() =>
                setLoadedPreview({
                  photoId: displayed.photo.id,
                  url: displayed.url,
                })
              }
            />
          )}
          {watermarkPrimary || watermarkSecondary ? (
            <div className="modal__watermark" aria-hidden="true">
              <span className="modal__watermark-logo">
                <img src={brandLogoWhiteUrl} alt="" />
              </span>
              <span className="modal__watermark-divider" />
              <span className="modal__watermark-meta">
                {watermarkPrimary && (
                  <span className="modal__watermark-row modal__watermark-row--primary">
                    {watermarkPrimary}
                  </span>
                )}
                {watermarkSecondary && (
                  <span className="modal__watermark-row modal__watermark-row--secondary">
                    {watermarkSecondary}
                  </span>
                )}
              </span>
            </div>
          ) : null}
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
      </article>
    </div>
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
  const stickySentinelRef = useRef<HTMLDivElement | null>(null);
  const [controlsStuck, setControlsStuck] = useState(false);
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
    data && route.tab === "topics" && selectedTopic
      ? topicPhotos
      : (data?.photos ?? []);
  const activePhoto = route.photoId
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

  // The controls bar is pinned once the sentinel above it leaves the
  // viewport; the bar logo shows only for that pinned duration.
  useEffect(() => {
    const sentinel = stickySentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setControlsStuck(entry ? !entry.isIntersecting : false);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [data]);

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
  const selectTab = (key: TabKey) =>
    navigateToRoute({ tab: key });
  const selectTopic = (topic: Topic) =>
    navigateToRoute({ tab: "topics", topicKey: topicRouteKey(topic) });
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
          <a href="#/works/latest" className="brand" aria-label="dkplus photography">
            <img
              src={brandLogoUrl}
              alt=""
              width={1668}
              height={1668}
              draggable={false}
              onContextMenu={preventImageSave}
            />
            <span className="brand__name">dkplus photography</span>
          </a>
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
              </span>
            </label>
          </div>
        </nav>
      </header>

      <main id="gallery" className="shell" aria-busy={isRoutePending}>
        <div ref={stickySentinelRef} className="sticky-sentinel" aria-hidden="true" />
        <section className="controls" aria-label="图库筛选">
          <div className="tabs" role="tablist" aria-label="图库标签">
            {(Object.keys(tabLabels) as TabKey[]).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={route.tab === key}
                className={route.tab === key ? "active" : ""}
                onClick={() => selectTab(key)}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>
          <img
            className={`controls__brand ${controlsStuck ? "controls__brand--visible" : ""}`}
            src={brandLogoWhiteUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            onContextMenu={preventImageSave}
          />
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
              onBack={() => navigateToRoute({ tab: "topics" })}
              onOpen={openPhotoRoute}
            />
          ) : (
            <TopicGrid summaries={topicSummaries} onSelectTopic={selectTopic} />
          ))}
        {deferredRoute.tab === "timeline" && (
          <Timeline photos={data.photos} onOpen={openPhotoRoute} />
        )}
      </main>

      <PhotoModal
        photos={modalPhotos}
        active={activePhoto}
        dataSaverEnabled={dataSaverEnabled}
        onClose={closePhotoRoute}
        onSelect={openPhotoRoute}
      />

      <div className="contact-fab">
        <div className="contact-fab__popover" role="tooltip">
          <img
            src={contactQrUrl}
            alt="联系二维码"
            width={987}
            height={1347}
            draggable={false}
            onContextMenu={preventImageSave}
          />
        </div>
        <button
          type="button"
          className="contact-fab__trigger"
          aria-label="显示联系二维码"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      </div>
    </>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
