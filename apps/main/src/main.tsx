import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createRoot } from "react-dom/client";
import {
  buildTopicSummaries,
  groupByMonth,
  normalizePayload,
  tabLabels,
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

type AppRoute = {
  tab: TabKey;
  topicKey?: string;
};

const routeTabs = new Set<TabKey>(["latest", "topics", "timeline"]);

const parseRouteHash = (hash: string): AppRoute => {
  const path = hash.replace(/^#\/?/, "").replace(/^\/+/, "");
  const [tabSegment, topicSegment] = path.split("/");
  if (tabSegment === "topics") {
    return {
      tab: "topics",
      topicKey: topicSegment ? decodeURIComponent(topicSegment) : undefined,
    };
  }
  if (routeTabs.has(tabSegment as TabKey)) {
    return { tab: tabSegment as TabKey };
  }
  return { tab: "latest" };
};

const routeToHash = (route: AppRoute): string =>
  `#/${route.tab}${
    route.tab === "topics" && route.topicKey
      ? `/${encodeURIComponent(route.topicKey)}`
      : ""
  }`;

const topicRouteKey = (topic: Topic): string => topic.slug ?? topic.id;

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

type TopicSummary = {
  topic: GalleryPayload["topics"][number];
  count: number;
  photos: ResolvedPhoto[];
  cover: ResolvedPhoto | undefined;
};

const buildTopicSummaries = (data: GalleryPayload): TopicSummary[] => {
  const photoById = new Map<string, ResolvedPhoto>();
  const photosByTopic = new Map<string, ResolvedPhoto[]>();
  const firstPhotoByTopic = new Map<string, ResolvedPhoto>();

  for (const photo of data.photos) {
    photoById.set(photo.id, photo);
    for (const topicId of photo.topicIds) {
      const topicPhotos = photosByTopic.get(topicId);
      if (topicPhotos) {
        topicPhotos.push(photo);
      } else {
        photosByTopic.set(topicId, [photo]);
      }
      if (!firstPhotoByTopic.has(topicId)) {
        firstPhotoByTopic.set(topicId, photo);
      }
    }
  }

  return data.topics.map((topic) => {
    const photos = photosByTopic.get(topic.id) ?? [];
    return {
      topic,
      count: photos.length,
      photos,
      cover:
        (topic.coverPhotoId ? photoById.get(topic.coverPhotoId) : undefined) ??
        firstPhotoByTopic.get(topic.id),
    };
  });
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
  onClose,
  onSelect,
}: {
  photos: ResolvedPhoto[];
  active: ResolvedPhoto | null;
  onClose: () => void;
  onSelect: (photo: ResolvedPhoto) => void;
}) => {
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
        <div className="modal__image-wrap">
          <img
            src={active.urls.preview}
            alt={active.asset.alt ?? active.title}
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

const App = () => {
  const { data, error } = useGallery();
  const [route, setRoute] = useState<AppRoute>(() =>
    parseRouteHash(window.location.hash),
  );
  const [isRoutePending, startRouteTransition] = useTransition();
  const deferredRoute = useDeferredValue(route);
  const [activePhoto, setActivePhoto] = useState<ResolvedPhoto | null>(null);
  const topicSummaries = useMemo(
    () => (data ? buildTopicSummaries(data.topics, data.photos) : []),
    [data],
  );
  const selectedTopicSummary = useMemo(() => {
    if (deferredRoute.tab !== "topics" || !deferredRoute.topicKey) {
      return undefined;
    }
    return topicSummaries.find(
      ({ topic }) =>
        topic.id === deferredRoute.topicKey ||
        topic.slug === deferredRoute.topicKey,
    );
  }, [deferredRoute.tab, deferredRoute.topicKey, topicSummaries]);
  const selectedTopic = selectedTopicSummary?.topic;
  const topicPhotos = selectedTopicSummary?.photos ?? [];
  const modalPhotos =
    data && deferredRoute.tab === "topics" && selectedTopic
      ? topicPhotos
      : (data?.photos ?? []);

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
  const selectTab = (key: TabKey) => navigateToRoute({ tab: key });
  const selectTopic = (topic: Topic) =>
    navigateToRoute({ tab: "topics", topicKey: topicRouteKey(topic) });

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
          <a href="#/latest" className="brand">
            DKPlus Photography
          </a>
          <span>
            {data.photos.length} Photos · {data.topics.length} Topics
          </span>
        </nav>
      </header>

      <main id="gallery" className="shell" aria-busy={isRoutePending}>
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
        </section>

        {deferredRoute.tab === "latest" && (
          <VirtualPhotoGrid
            photos={data.photos}
            style="square"
            onOpen={setActivePhoto}
          />
        )}
        {deferredRoute.tab === "topics" &&
          (selectedTopic ? (
            <TopicDetail
              topic={selectedTopic}
              photos={topicPhotos}
              onBack={() => navigateToRoute({ tab: "topics" })}
              onOpen={setActivePhoto}
            />
          ) : (
            <TopicGrid summaries={topicSummaries} onSelectTopic={selectTopic} />
          ))}
        {deferredRoute.tab === "timeline" && (
          <Timeline photos={data.photos} onOpen={setActivePhoto} />
        )}
      </main>

      <PhotoModal
        photos={modalPhotos}
        active={activePhoto}
        onClose={() => setActivePhoto(null)}
        onSelect={setActivePhoto}
      />
    </>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
