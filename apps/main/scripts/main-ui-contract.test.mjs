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
  assert.match(mainSource, /src=\{active\.urls\.preview\}/);
  assert.doesNotMatch(
    mainSource,
    /withThumbnailDisplayQuery\(active\.urls\.preview\)/,
  );
});

test("main virtual rows are measured from the grid container", () => {
  assert.match(virtualRows, /containerRef\s*=\s*useRef/);
  assert.match(virtualRows, /getBoundingClientRect\(\)/);
  assert.match(virtualRows, /viewport\.scrollY\s*-\s*container\.top/);
  assert.match(
    virtualRows,
    /rows\.length \* measuredRowHeight \+ \(rows\.length - 1\) \* gap/,
  );
});

test("topics tab opens a secondary virtual topic detail page", () => {
  assert.match(mainSource, /selectedTopicId/);
  assert.match(mainSource, /const TopicDetail =/);
  assert.match(mainSource, /onSelectTopic\(topic\.id\)/);
  assert.match(mainSource, /onSelectTopic=\{setSelectedTopicId\}/);
  assert.doesNotMatch(
    mainSource,
    /onClick=\{\(\) => cover && onOpen\(cover\)\}/,
  );
  assert.match(
    mainSource,
    /data\.photos\.filter\([\s\S]*?photo\.topicIds\.includes\(selectedTopicId\)/,
  );
  assert.match(
    mainSource,
    /<VirtualPhotoGrid[\s\S]*?photos=\{photos\}[\s\S]*?style="square"/,
  );
  assert.match(mainSource, /<TopicDetail[\s\S]*?photos=\{topicPhotos\}/);
  assert.match(
    mainSource,
    /data && tab === "topics" && selectedTopic[\s\S]*?\? topicPhotos[\s\S]*?: \(data\?\.photos \?\? \[\]\)/,
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
