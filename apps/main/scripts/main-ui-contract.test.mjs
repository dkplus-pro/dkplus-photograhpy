import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(dirname, "../src/styles.css"), "utf8");
const gallerySource = readFileSync(
  path.join(dirname, "../src/gallery.ts"),
  "utf8",
);
const mainSource = readFileSync(path.join(dirname, "../src/main.tsx"), "utf8");
const virtualRows = readFileSync(
  path.join(dirname, "../src/useVirtualRows.ts"),
  "utf8",
);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cssBlocks = (selector) => {
  const matches = [
    ...styles.matchAll(
      new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, "gm"),
    ),
  ];
  assert.ok(matches.length, `Expected ${selector} CSS block to exist`);
  return matches.map((match) => match[1]);
};

const cssBlock = (selector) => cssBlocks(selector)[0];

test("main photo cards keep the compact no-zoom square-card contract", () => {
  assert.match(cssBlock(".virtual-grid__row"), /gap:\s*10px;/);
  assert.match(virtualRows, /gap\s*=\s*10,/);

  assert.match(cssBlock(".photo-card"), /border-radius:\s*0;/);
  assert.match(cssBlock(".photo-card.square"), /aspect-ratio:\s*1;/);

  assert.doesNotMatch(cssBlock(".photo-card"), /transform\s*:/);
  assert.doesNotMatch(cssBlock(".photo-card:hover"), /transform\s*:/);
  assert.doesNotMatch(cssBlock(".photo-card img"), /transform\b/);
  assert.doesNotMatch(cssBlock(".photo-card:hover img"), /transform\s*:/);

  assert.match(cssBlock(".photo-card__meta"), /opacity:\s*0;/);
  assert.match(cssBlock(".photo-card__meta"), /linear-gradient/);
  assert.match(
    styles,
    /\.photo-card:hover \.photo-card__meta,[\s\S]*?\.photo-card:focus-visible \.photo-card__meta\s*\{[\s\S]*?opacity:\s*1;/,
  );

  assert.doesNotMatch(styles, /\b(mosaic|adaptive)\b/i);
});

test("main data loading uses the API in dev and static JSON in builds", () => {
  assert.match(
    mainSource,
    /import\.meta\.env\.DEV\s*\?\s*`\$\{apiBaseUrl\}\/gallery`/,
  );
  assert.match(
    mainSource,
    /staticDataUrl\s*=\s*`\$\{import\.meta\.env\.BASE_URL\}data\/gallery\.json`/,
  );
});

test("main data-saver switch controls modal preview quality only", () => {
  assert.match(
    mainSource,
    /const \[dataSaverEnabled, setDataSaverEnabled\] = useState\(false\)/,
  );
  assert.match(mainSource, /className="topbar__actions"/);
  assert.match(mainSource, /className="data-saver"/);
  assert.match(mainSource, /role="switch"/);
  assert.match(mainSource, /aria-label="省流模式"/);
  assert.match(mainSource, /aria-checked=\{dataSaverEnabled\}/);
  assert.match(mainSource, /checked=\{dataSaverEnabled\}/);
  assert.match(mainSource, /dataSaverEnabled=\{dataSaverEnabled\}/);
  assert.match(cssBlock(".topbar__actions"), /justify-content:\s*flex-end;/);
  assert.match(cssBlock(".data-saver"), /min-height:\s*44px;/);
  assert.match(cssBlock(".data-saver input"), /appearance:\s*none;/);

  assert.match(
    gallerySource,
    /const previewQualityDisplayQuery = "imageMogr2\/quality\/25"/,
  );
  assert.match(gallerySource, /export const withPreviewQualityDisplayQuery =/);
  assert.match(
    mainSource,
    /const previewUrl = dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview/,
  );
  assert.match(mainSource, /src=\{previewUrl\}/);
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("main list thumbnails use display-only Tencent thumbnail query", () => {
  assert.match(gallerySource, /withThumbnailDisplayQuery/);
  assert.match(gallerySource, /imageMogr2\/thumbnail\/800x/);
  assert.match(gallerySource, /\^\(data\|blob\):/);
  assert.match(gallerySource, /raw\.includes\("imageMogr2"\)/);
  assert.match(gallerySource, /images\.unsplash\.com/);
  assert.match(gallerySource, /const hashIndex = raw\.indexOf\("#"\)/);

  assert.match(
    mainSource,
    /src=\{withThumbnailDisplayQuery\(photo\.urls\.thumbnail\)\}/,
  );
  assert.match(
    mainSource,
    /src=\{withThumbnailDisplayQuery\(cover\.urls\.thumbnail\)\}/,
  );
  assert.match(mainSource, /src=\{previewUrl\}/);
  assert.match(
    mainSource,
    /const previewUrl = dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview/,
  );
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("main virtual rows are measured from the grid container", () => {
  assert.match(virtualRows, /containerRef\s*=\s*useRef/);
  assert.match(virtualRows, /useSyncExternalStore/);
  assert.match(virtualRows, /subscribeViewport/);
  assert.match(virtualRows, /getBoundingClientRect\(\)/);
  assert.match(virtualRows, /viewport\.scrollY\s*-\s*container\.top/);
  assert.match(
    virtualRows,
    /rows\.length \* measuredRowHeight \+ \(rows\.length - 1\) \* gap/,
  );
});

test("main tab rendering precomputes topic stats before render branches", () => {
  assert.match(gallerySource, /export const buildTopicSummaries =/);
  assert.match(gallerySource, /const photosById = new Map/);
  assert.match(gallerySource, /summary\.photos\.push\(photo\)/);
  assert.match(
    gallerySource,
    /photosById\.get\(summary\.topic\.coverPhotoId\)/,
  );
  assert.match(mainSource, /const topicSummaryById = useMemo/);
  assert.match(
    mainSource,
    /const topicPhotos = selectedTopicSummary\?\.photos \?\? \[\]/,
  );
  assert.doesNotMatch(mainSource, /data\.photos\.filter/);
});

test("timeline grouping and virtual rows avoid duplicated hot-path work", () => {
  assert.match(gallerySource, /for \(const photo of photos\)/);
  assert.match(gallerySource, /group\.push\(photo\)/);
  assert.doesNotMatch(gallerySource, /groups\.set\(key,\s*\[\.\.\./);
  assert.doesNotMatch(gallerySource, /\[\.\.\.photos\]\.sort\(compareNewest\)/);

  assert.match(virtualRows, /const viewportSubscribers = new Set/);
  assert.match(virtualRows, /const subscribeViewport =/);
  assert.match(
    virtualRows,
    /window\.addEventListener\("scroll", scheduleViewportUpdate,[\s\S]*?passive:\s*true/,
  );
  assert.equal(
    virtualRows.match(/window\.addEventListener\("scroll"/g)?.length,
    1,
  );
  assert.doesNotMatch(
    virtualRows,
    /window\.addEventListener\("resize", update/,
  );
});

test("tab and topic changes are scheduled as non-urgent route transitions", () => {
  assert.match(mainSource, /useTransition/);
  assert.match(mainSource, /const navigateToRoute =/);
  assert.match(
    mainSource,
    /startRouteTransition\(\(\) => setRoute\(nextRoute\)\)/,
  );
  assert.match(
    mainSource,
    /const selectTab = \(key: TabKey\) => navigateToRoute\(\{ tab: key \}\)/,
  );
  assert.match(mainSource, /const selectTopic = \(topic: Topic\) =>/);
  assert.match(
    mainSource,
    /onBack=\{\(\) => navigateToRoute\(\{ tab: "topics" \}\)\}/,
  );
});

test("topics tab opens a secondary virtual topic detail page", () => {
  assert.match(mainSource, /buildTopicSummaries/);
  assert.match(mainSource, /selectedTopicSummary/);
  assert.match(mainSource, /const TopicDetail =/);
  assert.match(mainSource, /onSelectTopic\(topic\)/);
  assert.match(mainSource, /onSelectTopic=\{selectTopic\}/);
  assert.doesNotMatch(
    mainSource,
    /onClick=\{\(\) => cover && onOpen\(cover\)\}/,
  );
  assert.doesNotMatch(mainSource, /data\.photos\.filter/);
  assert.doesNotMatch(mainSource, /topicCover\(topic,\s*data\.photos\)/);
  assert.match(
    mainSource,
    /<VirtualPhotoGrid[\s\S]*?photos=\{photos\}[\s\S]*?style="square"/,
  );
  assert.match(mainSource, /<TopicDetail[\s\S]*?photos=\{topicPhotos\}/);
  assert.match(
    mainSource,
    /data && deferredRoute\.tab === "topics" && selectedTopic[\s\S]*?\? topicPhotos[\s\S]*?: \(data\?\.photos \?\? \[\]\)/,
  );
  assert.match(
    cssBlock(".topic-detail__header"),
    /justify-content:\s*space-between;/,
  );
  assert.match(
    cssBlock(".topic-detail__actions button"),
    /border-radius:\s*999px;/,
  );
});

test("main tabs and topic detail are backed by GitHub Pages-safe hash routes", () => {
  assert.match(mainSource, /const parseRouteHash =/);
  assert.match(mainSource, /const routeToHash =/);
  assert.match(mainSource, /#\/\$\{route\.tab\}/);
  assert.match(mainSource, /window\.location\.hash/);
  assert.match(
    mainSource,
    /window\.addEventListener\("hashchange", syncRoute\)/,
  );
  assert.match(mainSource, /window\.addEventListener\("popstate", syncRoute\)/);
  assert.match(mainSource, /window\.history\.pushState/);
  assert.match(mainSource, /topicRouteKey\(topic\)/);
  assert.match(mainSource, /safeDecodeRouteSegment/);
  assert.match(mainSource, /topicSummaryByRouteKey/);
  assert.match(mainSource, /topicSummaryById\.get\(deferredRoute\.topicKey\)/);
  assert.match(mainSource, /useTransition/);
  assert.match(mainSource, /useDeferredValue/);
});

test("topic and timeline derived data are precomputed without repeated render scans", () => {
  assert.match(gallerySource, /export const buildTopicSummaries =/);
  assert.match(gallerySource, /summary\.photos\.push\(photo\)/);
  assert.match(gallerySource, /summary\.cover = photo/);
  assert.match(
    gallerySource,
    /photosById\.get\(summary\.topic\.coverPhotoId\)/,
  );
  assert.match(gallerySource, /export const groupByMonth =/);
  assert.match(gallerySource, /group\.push\(photo\)/);
  assert.doesNotMatch(gallerySource, /groups\.set\(key,\s*\[\.\.\./);
});

test("display-only thumbnail reduction does not affect modal preview quality", () => {
  assert.match(
    gallerySource,
    /const thumbnailDisplayQuery = "imageMogr2\/thumbnail\/800x"/,
  );
  assert.match(
    gallerySource,
    /const previewQualityDisplayQuery = "imageMogr2\/quality\/25"/,
  );
  assert.match(gallerySource, /export const withThumbnailDisplayQuery =/);
  assert.match(gallerySource, /export const withPreviewQualityDisplayQuery =/);
  assert.match(
    gallerySource,
    /thumbnail:\s*resolveDisplayAssetUrl\([\s\S]*?urls\?\.thumbnail/,
  );
  assert.doesNotMatch(gallerySource, /thumbnail:\s*withThumbnailDisplayQuery/);
  assert.match(
    gallerySource,
    /preview:\s*resolveDisplayAssetUrl\([\s\S]*?urls\?\.preview/,
  );
  assert.match(
    mainSource,
    /src=\{withThumbnailDisplayQuery\(photo\.urls\.thumbnail\)\}/,
  );
  assert.match(mainSource, /src=\{previewUrl\}/);
  assert.match(
    mainSource,
    /const previewUrl = dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview/,
  );
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("modal navigation is vertically centered in the image pane", () => {
  assert.match(
    cssBlock(".modal__panel"),
    /height:\s*min\(820px,\s*calc\(100dvh - clamp\(24px, 6vw, 72px\)\)\);/,
  );
  assert.match(cssBlock(".modal__image-wrap"), /place-items:\s*center;/);
  assert.match(cssBlock(".modal__image-wrap"), /overflow:\s*hidden;/);
  assert.match(
    cssBlock(".modal__image-wrap"),
    /min-height:\s*min\(420px, 100%\);/,
  );
  assert.match(cssBlock(".modal__image-wrap"), /height:\s*100%;/);
  assert.match(
    styles,
    /\.modal__nav\s*\{[\s\S]*?top:\s*50%;[\s\S]*?transform:\s*translateY\(-50%\);/,
  );
});

test("modal image uses max-bounded containment for all aspect ratios", () => {
  const imageBlock = cssBlock(".modal__image-wrap img");

  assert.match(imageBlock, /width:\s*auto;/);
  assert.match(imageBlock, /height:\s*auto;/);
  assert.match(imageBlock, /max-width:\s*100%;/);
  assert.match(
    imageBlock,
    /max-height:\s*min\(820px,\s*calc\(100dvh - clamp\(24px, 6vw, 72px\)\)\);/,
  );
  assert.match(imageBlock, /object-fit:\s*contain;/);
  assert.match(imageBlock, /object-position:\s*center;/);
  assert.doesNotMatch(imageBlock, /^\s*width:\s*100%;/m);
  assert.doesNotMatch(imageBlock, /^\s*height:\s*100%;/m);
  assert.doesNotMatch(imageBlock, /object-fit:\s*cover;/);
});
