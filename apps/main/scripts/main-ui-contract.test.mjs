import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(dirname, "../src/styles.css"), "utf8");
const mainSource = readFileSync(path.join(dirname, "../src/main.tsx"), "utf8");
const virtualRows = readFileSync(
  path.join(dirname, "../src/useVirtualRows.ts"),
  "utf8",
);
const mainSource = readFileSync(path.join(dirname, "../src/main.tsx"), "utf8");

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
const lastCssBlock = (selector) => cssBlocks(selector).at(-1);


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
    /import\.meta\.env\.DEV\s*\?\s*`\$\{apiBaseUrl\}\/photos`/,
  );
  assert.match(
    mainSource,
    /staticDataUrl\s*=\s*`\$\{import\.meta\.env\.BASE_URL\}data\/gallery\.json`/,
  );
});

test("main modal navigation and virtual rows keep bottom-edge contracts", () => {
  const modalNavPlacement = lastCssBlock(".modal__nav");
  assert.match(modalNavPlacement, /top:\s*50%;/);
  assert.match(modalNavPlacement, /transform:\s*translateY\(-50%\);/);
  assert.match(modalNavPlacement, /place-items:\s*center;/);

  assert.match(virtualRows, /containerRef\s*=\s*useRef<HTMLDivElement \| null>\(null\)/);
  assert.doesNotMatch(virtualRows, /topOffset\s*=\s*260/);
  assert.match(virtualRows, /rows\.length \* measuredRowHeight \+ \(rows\.length - 1\) \* gap/);
  assert.match(virtualRows, /Math\.ceil\(\(viewport\.scrollY \+ viewport\.height - container\.top\) \/ stride\) \+\s*overscan/s);
});
