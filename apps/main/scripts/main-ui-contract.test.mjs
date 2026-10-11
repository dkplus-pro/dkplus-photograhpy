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

test("main data-saver switch persists and controls modal preview quality only", () => {
  assert.match(mainSource, /const dataSaverStorageKey = "dkplus:data-saver"/);
  assert.match(
    mainSource,
    /window\.localStorage\.getItem\(dataSaverStorageKey\) === "true"/,
  );
  assert.match(
    mainSource,
    /window\.localStorage\.setItem\(dataSaverStorageKey, String\(enabled\)\)/,
  );
  assert.match(mainSource, /readStoredDataSaverEnabled/);
  assert.match(mainSource, /writeStoredDataSaverEnabled/);
  assert.match(
    mainSource,
    /const \[dataSaverEnabled, setDataSaverEnabled\] = useState\(\(\) =>\s*readStoredDataSaverEnabled\(\),\s*\)/,
  );
  assert.match(
    mainSource,
    /useEffect\(\(\) => \{\s*writeStoredDataSaverEnabled\(dataSaverEnabled\);\s*\}, \[dataSaverEnabled\]\)/,
  );
  assert.match(mainSource, /className="topbar__actions"/);
  assert.match(mainSource, /className="data-saver"/);
  assert.match(mainSource, /<span className="data-saver__copy">/);
  assert.doesNotMatch(mainSource, /大图低流量|原图预览/);
  assert.doesNotMatch(styles, /data-saver__copy small/);
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
    /const previewUrl = active[\s\S]*?dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview[\s\S]*?: "";/,
  );
  assert.match(mainSource, /src=\{displayed\.url\}/);
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("main photo detail paints the existing thumbnail until the preview image loads", () => {
  assert.match(
    mainSource,
    /const \[loadedPreview, setLoadedPreview\] = useState<\{\s*photoId: string;\s*url: string;\s*\} \| null>\(null\)/,
  );
  assert.match(
    mainSource,
    /const previewUrl = active[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview[\s\S]*?: "";/,
  );
  assert.match(
    mainSource,
    /const placeholderUrl = active[\s\S]*?withThumbnailDisplayQuery\(active\.urls\.thumbnail\)[\s\S]*?: "";/,
  );
  assert.match(
    mainSource,
    /const previewIsLoaded =[\s\S]*?loadedPreview\?\.photoId === displayed\.photo\.id[\s\S]*?loadedPreview\?\.url === displayed\.url/,
  );
  assert.match(
    mainSource,
    /const placeholderBackgroundImage = placeholderUrl[\s\S]*?JSON\.stringify\(placeholderUrl\)/,
  );
  assert.match(
    mainSource,
    /data-preview-loaded=\{previewIsLoaded\}[\s\S]*?style=\{\{ backgroundImage: placeholderBackgroundImage \}\}/,
  );
  assert.match(
    mainSource,
    /onLoad=\{\(\) =>[\s\S]*?setLoadedPreview\(\{[\s\S]*?photoId: displayed\.photo\.id,[\s\S]*?url: displayed\.url,[\s\S]*?\}\)\}/,
  );
  assert.match(cssBlock(".modal__image-wrap"), /background-size:\s*contain;/);
  assert.match(cssBlock(".modal__preview"), /opacity:\s*0;/);
  assert.match(
    cssBlock('.modal__image-wrap[data-preview-loaded="true"] .modal__preview'),
    /opacity:\s*1;/,
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
  assert.match(mainSource, /src=\{displayed\.url\}/);
  assert.match(
    mainSource,
    /const previewUrl = active[\s\S]*?dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview[\s\S]*?: "";/,
  );
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("main photo detail opens as a hash route and images block context-menu saves", () => {
  assert.match(mainSource, /photoId\?: string/);
  assert.match(mainSource, /tabSegment === "photo" && detailSegment/);
  assert.match(mainSource, /firstSegment === "works"/);
  assert.match(
    mainSource,
    /return `#\/works\/\$\{route\.tab\}\/\$\{photoSegment\}`/,
  );
  assert.match(
    mainSource,
    /const preventImageSave = \(event: React\.MouseEvent<HTMLImageElement>\)/,
  );
  assert.match(mainSource, /event\.preventDefault\(\)/);
  assert.match(
    mainSource,
    /const openPhotoRoute = \(photo: ResolvedPhoto\) =>/,
  );
  assert.match(
    mainSource,
    /navigateToRoute\(\{ \.\.\.galleryRouteWithoutPhoto\(route\), photoId: photo\.id \}\)/,
  );
  assert.match(
    mainSource,
    /const closePhotoRoute = \(\) => \{[\s\S]*?navigateToRoute\(galleryRouteWithoutPhoto\(route\)\)[\s\S]*?\};/,
  );
  assert.match(
    mainSource,
    /activePhoto = route\.photoId\s*\?\s*\(photoById\.get\(route\.photoId\) \?\? null\)\s*: null/,
  );
  assert.match(mainSource, /onClose=\{closePhotoRoute\}/);
  assert.match(mainSource, /onSelect=\{openPhotoRoute\}/);
  assert.equal(mainSource.match(/draggable=\{false\}/g)?.length, 6);
  assert.equal(
    mainSource.match(/onContextMenu=\{preventImageSave\}/g)?.length,
    6,
  );
  assert.match(cssBlock("img"), /user-select:\s*none;/);
  assert.match(cssBlock("img"), /-webkit-user-drag:\s*none;/);
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
    /const selectTab = \(key: TabKey\) =>\s*navigateToRoute\(\{ tab: key \}\)/,
  );
  assert.match(mainSource, /const selectTopic = \(topic: Topic\) =>/);
  assert.match(
    mainSource,
    /onBack=\{\(\) =>\s*navigateToRoute\(\{ tab: "topics" \}\)\s*\}/,
  );
});

test("topics tab opens a secondary virtual topic detail page", () => {
  assert.match(mainSource, /buildTopicSummaries/);
  assert.match(mainSource, /selectedTopicSummary/);
  assert.match(mainSource, /const TopicGrid =/);
  assert.match(mainSource, /const TopicDetail =/);
  assert.match(
    mainSource,
    /summaries\s*\.filter\(\(summary\) => summary\.count > 0\)/,
  );
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
    /data && route\.tab === "topics" && selectedTopic[\s\S]*?\? topicPhotos[\s\S]*?: \(data\?\.photos \?\? \[\]\)/,
  );
  assert.match(
    cssBlock(".topic-detail__header"),
    /justify-content:\s*space-between;/,
  );
  assert.match(
    cssBlock(".topic-detail__actions button"),
    /border-radius:\s*999px;/,
  );
  const topicDescriptionStyles = cssBlocks(".topic-card__copy em").join("\n");
  assert.match(topicDescriptionStyles, /display:\s*-webkit-box;/);
  assert.match(topicDescriptionStyles, /overflow:\s*hidden;/);
  assert.match(topicDescriptionStyles, /-webkit-line-clamp:\s*2;/);
});

test("main tabs and topic detail are backed by GitHub Pages-safe hash routes", () => {
  assert.match(mainSource, /const parseRouteHash =/);
  assert.match(mainSource, /const routeToHash =/);
  assert.match(mainSource, /#\/works\/\$\{route\.tab\}/);
  assert.match(mainSource, /#\/works\/\$\{route\.tab\}\/\$\{photoSegment\}/);
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

test("main header shows the logo brand and works-only navigation", () => {
  assert.match(mainSource, /className="brand"/);
  assert.match(
    mainSource,
    /const brandLogoUrl = `\$\{import\.meta\.env\.BASE_URL\}img\/logo-black\.png`/,
  );
  assert.match(mainSource, /<img\s*src=\{brandLogoUrl\}/);
  assert.match(mainSource, /className="brand__name">dkplus photography<\/span>/);
  assert.match(cssBlock(".brand img"), /height:\s*35px;/);
  assert.match(mainSource, /href="#\/works\/latest"/);
  assert.match(cssBlock(".brand"), /gap:\s*0;/);
  assert.match(
    cssBlock(".brand__name"),
    /font-family:\s*Futura, "Futura PT"/,
  );
  assert.match(cssBlock(".brand__name"), /font-size:\s*0\.75rem;/);
  assert.match(cssBlock(".brand__name"), /text-transform:\s*uppercase;/);
  assert.match(mainSource, /<main id="gallery"/);
  assert.match(mainSource, /#\/works\/\$\{route\.tab\}/);

  assert.doesNotMatch(mainSource, /水印导出|watermark-export|WatermarkExport/);
  assert.doesNotMatch(mainSource, /className="main-menu"/);
  assert.doesNotMatch(mainSource, /导出水印|watermark-download|onExportWatermark/);
  assert.doesNotMatch(styles, /\.main-menu|\.watermark-page|\.watermark-download/);
  assert.doesNotMatch(styles, /\.watermark-preview|\.watermark-controls/);
});

test("photo modal renders watermark-style metadata strip with div and css", () => {
  assert.match(mainSource, /const watermarkMetadataSpacer = "  "/);
  assert.match(mainSource, /const watermarkSecondarySpacer = "     "/);
  assert.match(
    mainSource,
    /const formatCameraModel = \(photo\?: ResolvedPhoto\): string =>\s*photo\?\.exif\?\.cameraModel\?\.trim\(\) \?\? "";/,
  );
  assert.match(
    mainSource,
    /const formatLensModel = \(photo\?: ResolvedPhoto\): string =>/,
  );
  assert.match(
    mainSource,
    /const formatFocalLength = \(photo\?: ResolvedPhoto\): string =>/,
  );
  assert.match(
    mainSource,
    /const formatExposure = \(photo\?: ResolvedPhoto\): string =>/,
  );
  assert.match(
    mainSource,
    /const watermarkPrimary = \[\s*formatFocalLength\(watermarkPhoto\),\s*formatExposure\(watermarkPhoto\),\s*\]\s*\.filter\(Boolean\)\s*\.join\(watermarkMetadataSpacer\)/,
  );
  assert.match(
    mainSource,
    /const watermarkSecondary = \[\s*formatCameraModel\(watermarkPhoto\),\s*formatLensModel\(watermarkPhoto\),\s*\]\s*\.filter\(Boolean\)\s*\.join\(watermarkSecondarySpacer\)/,
  );
  assert.match(mainSource, /className="modal__watermark"/);
  assert.match(mainSource, /modal__watermark-logo/);
  assert.match(mainSource, /modal__watermark-divider/);
  assert.match(mainSource, /modal__watermark-row--primary/);
  assert.match(mainSource, /modal__watermark-row--secondary/);
  assert.match(mainSource, /<img src=\{brandLogoWhiteUrl\} alt="" \/>/);
  assert.match(mainSource, /className="modal__close"/);
  assert.doesNotMatch(mainSource, /renderWatermarkExport|canvas/i);
  assert.doesNotMatch(mainSource, /watermarkRouteFields|WatermarkFieldState/);
  assert.doesNotMatch(mainSource, /modal__info|exifRows|formatDate/);
  assert.doesNotMatch(styles, /\.modal__info|\.modal h2|\.modal p|^dl \{|^dt \{|^dd \{/m);

  assert.match(cssBlock(".modal__watermark"), /position:\s*absolute;/);
  assert.match(cssBlock(".modal__watermark"), /inset:\s*auto 0 0;/);
  assert.match(cssBlock(".modal__watermark"), /linear-gradient/);
  assert.match(cssBlock(".modal__watermark"), /pointer-events:\s*none;/);
  assert.doesNotMatch(cssBlock(".modal__watermark"), /opacity:\s*0;/);
  assert.doesNotMatch(
    styles,
    /data-preview-loaded="true"\] \.modal__watermark/,
  );
  assert.doesNotMatch(cssBlock(".modal__watermark-logo"), /background:/);
  assert.doesNotMatch(cssBlock(".modal__watermark-logo"), /padding:/);
  assert.match(cssBlock(".modal__watermark-divider"), /rgba\(250, 250, 250, 0\.55\)/);
  assert.match(cssBlock(".modal__watermark-row"), /white-space:\s*pre;/);
  assert.match(
    cssBlock(".modal__watermark-row--primary"),
    /font-family:\s*Futura, "Futura PT"/,
  );
  assert.match(
    cssBlock(".modal__watermark-row--secondary"),
    /rgba\(250, 250, 250, 0\.78\)/,
  );
  assert.match(cssBlock(".modal__panel"), /overflow:\s*hidden;/);
  assert.doesNotMatch(cssBlock(".modal__panel"), /grid-template-columns/);
  assert.match(cssBlock(".modal__close"), /position:\s*absolute;/);
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
    /const resolveUrls =[\s\S]*?const original = resolveDisplayAssetUrl\(urls\?\.original \?\? asset\.original\);[\s\S]*?thumbnail: original,[\s\S]*?preview: original/,
  );
  assert.doesNotMatch(gallerySource, /asset\.thumbnail/);
  assert.doesNotMatch(gallerySource, /asset\.preview/);
  assert.doesNotMatch(gallerySource, /urls\?\.thumbnail/);
  assert.doesNotMatch(gallerySource, /urls\?\.preview/);
  assert.doesNotMatch(gallerySource, /thumbnail:\s*withThumbnailDisplayQuery/);
  assert.match(
    mainSource,
    /src=\{withThumbnailDisplayQuery\(photo\.urls\.thumbnail\)\}/,
  );
  assert.match(mainSource, /src=\{displayed\.url\}/);
  assert.match(
    mainSource,
    /const previewUrl = active[\s\S]*?dataSaverEnabled[\s\S]*?withPreviewQualityDisplayQuery\(active\.urls\.preview\)[\s\S]*?: active\.urls\.preview[\s\S]*?: "";/,
  );
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("modal navigation is vertically centered in the image pane", () => {
  assert.match(
    cssBlock(".modal__panel"),
    /height:\s*var\(--photo-height, min\(820px,\s*calc\(100dvh - clamp\(24px, 6vw, 72px\)\)\)\);/,
  );
  assert.match(cssBlock(".modal__image-wrap"), /overflow:\s*hidden;/);
  assert.match(cssBlock(".modal__image-wrap"), /height:\s*100%;/);
  assert.match(
    styles,
    /\.modal__nav\s*\{[\s\S]*?top:\s*50%;[\s\S]*?transform:\s*translateY\(-50%\);/,
  );
});

test("modal panel hugs the photo with no letterbox or rounded corners", () => {
  assert.match(mainSource, /style=\{panelStyle\}/);
  assert.match(mainSource, /const \[previewRatio, setPreviewRatio\] = useState<number \| null>\(null\)/);
  assert.match(
    mainSource,
    /const \[displayed, setDisplayed\] = useState<\{\s*photo: ResolvedPhoto;\s*url: string;\s*\} \| null>\(null\)/,
  );
  assert.match(mainSource, /"--photo-ratio": `\$\{previewRatio\}`/);
  assert.match(
    mainSource,
    /"--photo-width": `min\(100%, calc\(\$\{modalMaxBoxHeight\} \* \$\{previewRatio\}\)\)`/,
  );
  assert.match(mainSource, /const modalMaxBoxHeight = "min\(820px/);
  assert.match(
    mainSource,
    /image\.src = placeholderUrl;/,
  );
  assert.match(
    mainSource,
    /setPreviewRatio\(image\.naturalWidth \/ image\.naturalHeight\)/,
  );
  // 切换图片：先预加载再单次提交交换，避免空帧闪烁
  assert.match(mainSource, /image\.src = previewUrl;/);
  assert.match(mainSource, /key=\{`\$\{displayed\.photo\.id\}:\$\{displayed\.url\}`\}/);
  assert.match(
    mainSource,
    /const watermarkPhoto = displayed\?\.photo \?\? active;/,
  );
  assert.match(cssBlock(".modal__panel"), /width:\s*var\(--photo-width,/);
  assert.match(cssBlock(".modal__panel"), /aspect-ratio:\s*var\(--photo-ratio, auto\);/);
  assert.match(cssBlock(".modal__panel"), /border-radius:\s*0;/);
  assert.match(cssBlock(".modal__panel"), /background:\s*transparent;/);
  assert.match(cssBlock(".modal__panel"), /transition:\s*width\s/);
  assert.doesNotMatch(cssBlock(".modal__panel"), /grid-template-columns/);
  assert.match(
    cssBlock(".modal__image-wrap"),
    /background-color:\s*transparent;/,
  );

  const previewBlock = cssBlock(".modal__preview");
  assert.match(previewBlock, /position:\s*absolute;/);
  assert.match(previewBlock, /inset:\s*0;/);
  assert.match(previewBlock, /width:\s*100%;/);
  assert.match(previewBlock, /height:\s*100%;/);
  assert.match(previewBlock, /object-fit:\s*contain;/);
  assert.match(previewBlock, /object-position:\s*center;/);
  assert.doesNotMatch(previewBlock, /object-fit:\s*cover;/);
  assert.doesNotMatch(mainSource, /modal__image-frame/);
  assert.doesNotMatch(styles, /\.modal__image-frame/);
});

test("the white logo shows in the sticky bar only while pinned", () => {
  assert.match(
    mainSource,
    /const brandLogoWhiteUrl = `\$\{import\.meta\.env\.BASE_URL\}img\/logo-white\.png`/,
  );
  assert.match(
    mainSource,
    /className=\{`controls__brand \$\{controlsStuck \? "controls__brand--visible" : ""\}`\}/,
  );
  assert.match(mainSource, /stickySentinelRef = useRef/);
  assert.match(mainSource, /new IntersectionObserver\(\(entries\) =>/);
  assert.match(mainSource, /className="sticky-sentinel"/);
  assert.match(
    mainSource,
    /<img\s*className=\{`controls__brand \$\{controlsStuck \? "controls__brand--visible" : ""\}`\}\s*src=\{brandLogoWhiteUrl\}/,
  );

  assert.match(cssBlock(".controls"), /position:\s*sticky;/);
  assert.match(cssBlock(".controls"), /justify-content:\s*space-between;/);
  assert.match(cssBlock(".sticky-sentinel"), /height:\s*1px;/);
  assert.match(cssBlock(".controls__brand"), /opacity:\s*0;/);
  assert.match(cssBlock(".controls__brand"), /drop-shadow\(/);
  assert.match(cssBlock(".controls__brand--visible"), /opacity:\s*1;/);
  assert.doesNotMatch(styles, /\.sticky-brand/);
});

test("closing the modal scrolls the grid back to the viewed photo", () => {
  assert.match(
    mainSource,
    /const \[scrollToPhotoId, setScrollToPhotoId\] = useState<string \| null>\(null\)/,
  );
  assert.match(
    mainSource,
    /if \(route\.photoId\) setScrollToPhotoId\(route\.photoId\);/,
  );
  assert.match(
    mainSource,
    /Math\.floor\(index \/ columns\) \* rowStride/,
  );
  assert.match(
    mainSource,
    /window\.scrollTo\(\{ top: Math\.max\(0, top - 96\), behavior: "auto" \}\)/,
  );
  assert.equal(
    (mainSource.match(/scrollToPhotoId=\{scrollToPhotoId\}/g) ?? []).length,
    5,
  );
  assert.match(virtualRows, /rowStride: measuredRowHeight \+ gap/);
});

test("contact floating button reveals a QR popover on hover", () => {
  assert.match(
    mainSource,
    /const contactQrUrl = `\$\{import\.meta\.env\.BASE_URL\}img\/contact-me\.JPG`/,
  );
  assert.match(mainSource, /className="contact-fab"/);
  assert.match(mainSource, /className="contact-fab__popover" role="tooltip"/);
  assert.match(mainSource, /className="contact-fab__trigger"/);
  assert.match(mainSource, /aria-label="显示联系二维码"/);
  assert.match(mainSource, /alt="联系二维码"/);

  assert.match(cssBlock(".contact-fab"), /position:\s*fixed;/);
  assert.match(cssBlock(".contact-fab"), /bottom:\s*clamp\(/);
  assert.match(cssBlock(".contact-fab__popover"), /opacity:\s*0;/);
  assert.match(cssBlock(".contact-fab__popover"), /pointer-events:\s*none;/);
  assert.match(
    styles,
    /\.contact-fab:hover \.contact-fab__popover,[\s\S]*?\.contact-fab:focus-within \.contact-fab__popover\s*\{[\s\S]*?opacity:\s*1;/,
  );
  assert.match(cssBlock(".contact-fab__popover img"), /width:\s*100%;/);
});
