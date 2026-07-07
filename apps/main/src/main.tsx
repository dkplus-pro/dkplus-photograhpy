import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  groupByMonth,
  normalizePayload,
  tabLabels,
  topicCover,
} from "./gallery";
import type { GalleryPayload, GridStyle, ResolvedPhoto, TabKey } from "./types";
import { useVirtualRows } from "./useVirtualRows";
import "./styles.css";

const dataUrl = import.meta.env.DEV
  ? "/api/gallery"
  : `${import.meta.env.BASE_URL}data/gallery.json`;

const useGallery = () => {
  const [data, setData] = useState<GalleryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
        return response.json() as Promise<GalleryPayload>;
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
      src={photo.urls.thumbnail}
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
  const { columns, rows, totalHeight } = useVirtualRows(photos, 300);
  return (
    <div
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
  data,
  onOpen,
}: {
  data: GalleryPayload;
  onOpen: (photo: ResolvedPhoto) => void;
}) => (
  <div className="topic-grid" aria-label="专题列表">
    {data.topics.map((topic) => {
      const cover = topicCover(topic, data.photos);
      const count = data.photos.filter((photo) =>
        photo.topicIds.includes(topic.id),
      ).length;
      return (
        <button
          className="topic-card"
          key={topic.id}
          onClick={() => cover && onOpen(cover)}
          disabled={!cover}
        >
          {cover ? (
            <img
              src={cover.urls.thumbnail}
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
    ["镜头", active.exif?.lensModel],
    ["ISO", active.exif?.iso],
    ["光圈", active.exif?.aperture ? `f/${active.exif.aperture}` : undefined],
    ["快门", active.exif?.shutterSpeed],
    [
      "焦距",
      active.exif?.focalLengthMm ? `${active.exif.focalLengthMm}mm` : undefined,
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
  const [tab, setTab] = useState<TabKey>("latest");
  const [activePhoto, setActivePhoto] = useState<ResolvedPhoto | null>(null);

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
          <a href="#gallery" className="brand">
            DKPlus Photography
          </a>
          <span>
            {data.photos.length} Photos · {data.topics.length} Topics
          </span>
        </nav>
      </header>

      <main id="gallery" className="shell">
        <section className="controls" aria-label="图库筛选">
          <div className="tabs" role="tablist" aria-label="图库标签">
            {(Object.keys(tabLabels) as TabKey[]).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>
        </section>

        {tab === "latest" && (
          <VirtualPhotoGrid
            photos={data.photos}
            style="square"
            onOpen={setActivePhoto}
          />
        )}
        {tab === "topics" && <TopicGrid data={data} onOpen={setActivePhoto} />}
        {tab === "timeline" && (
          <Timeline photos={data.photos} onOpen={setActivePhoto} />
        )}
      </main>

      <PhotoModal
        photos={data.photos}
        active={activePhoto}
        onClose={() => setActivePhoto(null)}
        onSelect={setActivePhoto}
      />
    </>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
