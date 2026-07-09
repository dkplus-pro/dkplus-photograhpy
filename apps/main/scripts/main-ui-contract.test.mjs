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
const watermarkSource = readFileSync(
  path.join(dirname, "../src/watermark.ts"),
  "utf8",
);
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
  assert.match(mainSource, /src=\{previewUrl\}/);
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
    /const previewIsLoaded =[\s\S]*?loadedPreview\?\.photoId === active\?\.id[\s\S]*?loadedPreview\?\.url === previewUrl/,
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
    /onLoad=\{\(\) =>\s*setLoadedPreview\(\{ photoId: active\.id, url: previewUrl \}\)\s*\}/,
  );
  assert.match(cssBlock(".modal__image-wrap"), /background-size:\s*contain;/);
  assert.match(cssBlock(".modal__image-wrap img"), /opacity:\s*0;/);
  assert.match(
    cssBlock('.modal__image-wrap[data-preview-loaded="true"] img'),
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
  assert.match(mainSource, /src=\{previewUrl\}/);
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
    /const closePhotoRoute = \(\) =>\s*navigateToRoute\(galleryRouteWithoutPhoto\(route\)\)/,
  );
  assert.match(
    mainSource,
    /activePhoto =\s*route\.page === "works" && route\.photoId/,
  );
  assert.match(mainSource, /onClose=\{closePhotoRoute\}/);
  assert.match(mainSource, /onSelect=\{openPhotoRoute\}/);
  assert.equal(mainSource.match(/draggable=\{false\}/g)?.length, 3);
  assert.equal(
    mainSource.match(/onContextMenu=\{preventImageSave\}/g)?.length,
    3,
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
    /const selectTab = \(key: TabKey\) =>\s*navigateToRoute\(\{ page: "works", tab: key \}\)/,
  );
  assert.match(mainSource, /const selectTopic = \(topic: Topic\) =>/);
  assert.match(
    mainSource,
    /onBack=\{\(\) =>\s*navigateToRoute\(\{ page: "works", tab: "topics" \}\)\s*\}/,
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
    /data && route\.page === "works" && route\.tab === "topics" && selectedTopic[\s\S]*?\? topicPhotos[\s\S]*?: \(data\?\.photos \?\? \[\]\)/,
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

test("main top menu exposes works and canvas watermark export contracts", () => {
  assert.match(mainSource, /className="main-menu"/);
  assert.match(mainSource, /aria-label="主菜单"/);
  assert.match(mainSource, /href=\{routeToHash\(\{ page, tab: "latest" \}\)\}/);
  assert.match(mainSource, /selectMainPage\(page\)/);
  assert.match(
    mainSource,
    /id=\{deferredRoute\.page === "works" \? "gallery" : "watermark-export"\}/,
  );
  assert.match(mainSource, /<WatermarkExportPage photos=\{data\.photos\} \/>/);
  assert.match(mainSource, /const useAdminBrandLogos = \(\) =>/);
  assert.match(mainSource, /fetch\(`\$\{apiBaseUrl\}\/brands`\)/);
  assert.match(mainSource, /logoUrls/);
  assert.match(mainSource, /deriveCameraBrandLogos/);
  assert.match(mainSource, /const noLogoWatermarkOption/);
  assert.match(mainSource, /id: "none"/);
  assert.match(mainSource, /不使用 Logo/);
  assert.match(mainSource, /Logo（可选）/);
  assert.match(mainSource, /上传自定义 Logo/);
  assert.match(mainSource, /白字黑底/);
  assert.match(mainSource, /黑字白底/);
  assert.doesNotMatch(mainSource, /aria-label="水印日期"|显示日期/);
  assert.match(mainSource, /显示设备行/);
  assert.match(mainSource, /显示曝光行/);
  assert.match(mainSource, /水印相机品牌/);
  assert.match(mainSource, /水印镜头/);
  assert.match(mainSource, /水印焦段/);
  assert.match(mainSource, /const watermarkFieldSpacer = "  "/);
  assert.match(
    mainSource,
    /const formatCameraBrand = \(photo\?: ResolvedPhoto\): string =>/,
  );
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
  assert.doesNotMatch(mainSource, /水印标题|fields\.title|input\.title/);
  assert.match(
    mainSource,
    /if \(selectedWatermarkLogo\) input\.logo = selectedWatermarkLogo/,
  );
  assert.match(styles, /\.main-menu__link\.active/);
  assert.match(styles, /\.watermark-preview\[data-tone="black"\]/);

  assert.match(watermarkSource, /export const renderWatermarkExport =/);
  assert.match(watermarkSource, /OffscreenCanvas/);
  assert.match(watermarkSource, /workerTimeoutMs/);
  assert.match(watermarkSource, /renderWatermarkOnMainThread/);
  assert.match(watermarkSource, /renderer: "worker"/);
  assert.match(watermarkSource, /renderer: "main-thread"/);
  assert.match(
    watermarkSource,
    /const stripHeight = clamp\(canvasHeight \* 0\.2, 132, 340\)/,
  );
  assert.match(watermarkSource, /const hasLogo = Boolean\(input\.logo\)/);
  assert.match(watermarkSource, /if \(hasLogo && input\.logo\)/);
  assert.match(
    watermarkSource,
    /const logoMaxHeight = clamp\(stripHeight \* 0\.45, 48, 132\)/,
  );
  assert.match(watermarkSource, /const logoWidth = logoImage/);
  assert.match(
    watermarkSource,
    /createLinearGradient\(\s*0,\s*canvasHeight,\s*0,\s*stripY,?\s*\)/,
  );
  assert.match(watermarkSource, /createLinearGradient\(0, height, 0, stripY\)/);
  assert.doesNotMatch(
    watermarkSource,
    /input\.title|input\.date|titleSize|brandLabel|const logoSize|separatorX|palette\.separator|watermarkSignature/,
  );
  assert.match(watermarkSource, /const watermarkMetadataSpacer = "  "/);
  assert.match(
    watermarkSource,
    /const watermarkPrimaryFontFamily =[\s\S]*?Futura,[\s\S]*?"Futura PT"/,
  );
  assert.match(
    watermarkSource,
    /const watermarkFontFamily =[\s\S]*?"Fira Code", "Fira Sans", ui-sans-serif, system-ui, sans-serif/,
  );
  assert.match(
    watermarkSource,
    /const firstRow = \[input\.focalLength, input\.exposure\][\s\S]*?\.join\(watermarkMetadataSpacer\)/,
  );
  assert.match(
    watermarkSource,
    /const secondRow = \[input\.model, input\.lens\][\s\S]*?\.join\(watermarkMetadataSpacer\)/,
  );
  assert.match(
    watermarkSource,
    /watermarkFont\(primarySize, 400, watermarkPrimaryFontFamily\)/,
  );
  assert.match(watermarkSource, /watermarkFont\(secondarySize, 300\)/);
});

test("watermark export renders metadata-only output with optional logo and fade overlay", () => {
  assert.match(
    mainSource,
    /const formatCameraModel = \(photo\?: ResolvedPhoto\): string =>\s*photo\?\.exif\?\.cameraModel\?\.trim\(\) \?\? "";/,
  );

  assert.doesNotMatch(
    mainSource,
    /水印标题|aria-label="水印标题"|aria-label="水印日期"|显示日期/,
  );
  assert.doesNotMatch(
    watermarkSource,
    /input\.title|input\.date|DKPLUS PHOTOGRAPHY|watermarkSignature|separatorX|palette\.separator|·/,
  );
  assert.match(
    mainSource,
    /const \[selectedLogoId, setSelectedLogoId\] = useState\("none"\)/,
  );
  assert.match(mainSource, /const noLogoWatermarkOption[\s\S]*?id: "none"/);
  assert.match(watermarkSource, /logo\?: WatermarkLogoInput \| undefined;/);
  assert.match(watermarkSource, /const hasLogo = Boolean\(input\.logo\)/);
  assert.match(
    watermarkSource,
    /if \(hasLogo && input\.logo\) \{[\s\S]*?drawLogoMark/,
  );
  assert.match(
    watermarkSource,
    /const dividerGap = clamp\(paddingX \* 0\.54, 28, 56\)[\s\S]*?const dividerX = logoX \+ logoWidth \+ dividerGap/,
  );
  assert.match(
    watermarkSource,
    /context\.moveTo\(dividerX, stripY \+ stripHeight \* 0\.4\)/,
  );
  assert.match(watermarkSource, /const watermarkMetadataSpacer = "  "/);
  assert.match(
    watermarkSource,
    /const firstRow = \[input\.focalLength, input\.exposure\][\s\S]*?\.join\(watermarkMetadataSpacer\)/,
  );
  assert.match(
    watermarkSource,
    /const secondRow = \[input\.model, input\.lens\][\s\S]*?\.join\(watermarkMetadataSpacer\)/,
  );

  const gradientCalls =
    watermarkSource.match(
      /createLinearGradient\(\s*0,\s*(?:canvasHeight|height),\s*0,\s*stripY,?\s*\)/g,
    ) ?? [];
  assert.equal(gradientCalls.length, 2);
  assert.match(
    watermarkSource,
    /overlayGradient\.addColorStop\(0, palette\.strip\)/,
  );
  assert.match(
    watermarkSource,
    /overlayGradient\.addColorStop\(1, palette\.stripFade\)/,
  );
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
  assert.match(mainSource, /src=\{previewUrl\}/);
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

test("main top menu exposes Works and watermark-export routes", () => {
  assert.match(mainSource, /作品/);
  assert.match(mainSource, /水印导出/);
  assert.match(mainSource, /\bworks\b/);
  assert.match(mainSource, /\bwatermark\b/);
  assert.match(mainSource, /#\/works/);
  assert.match(mainSource, /#\/watermark/);
  assert.match(mainSource, /top-menu|primary-nav|main-nav|main-menu|topbar/);
  assert.match(
    styles,
    /\.top-menu|\.primary-nav|\.main-nav|\.main-menu|\.topbar/,
  );

  assert.match(mainSource, /VirtualPhotoGrid/);
  assert.match(mainSource, /route\.(section|page|view|tab)\s*===\s*"works"/);
});

test("watermark export page captures required canvas and metadata controls", () => {
  assert.match(mainSource, /WatermarkExport/);
  assert.match(watermarkSource, /createElement\("canvas"\)|OffscreenCanvas/);
  assert.match(mainSource, /黑色|black/i);
  assert.match(mainSource, /白色|white/i);
  assert.doesNotMatch(mainSource, /aria-label="水印日期"|显示日期/);
  assert.match(mainSource, /机型|型号|model/i);
  assert.match(mainSource, /曝光|快门|光圈|exposure/i);
  assert.match(mainSource, /自定义\s*Logo|custom\s*logo/i);
  assert.match(mainSource, /Logo（可选）|不使用 Logo|optional\s*logo/i);
  assert.match(mainSource, /示例|example/i);
  assert.match(mainSource, /download|toBlob|toDataURL|导出/i);

  const watermarkStyles = styles.match(
    /\.(watermark-export|watermark-page|watermark-canvas)[\s\S]*/i,
  )?.[0];
  assert.ok(watermarkStyles, "Expected watermark export CSS selectors");
  assert.match(watermarkStyles, /bottom|flex-end|end/i);
});
