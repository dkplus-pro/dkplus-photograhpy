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

const cssBlock = (selector) => {
  const match = styles.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"),
  );
  assert.ok(match, `Expected ${selector} CSS block to exist`);
  return match[1];
};

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

test("main selects /api data in dev and static JSON for production builds", () => {
  assert.match(mainSource, /const staticDataUrl\s*=\s*`\$\{import\.meta\.env\.BASE_URL\}data\/gallery\.json`/);
  assert.match(mainSource, /import\.meta\.env\.DEV\s*\?\s*`\$\{apiBaseUrl\}\/gallery`\s*:\s*staticDataUrl/s);
  assert.match(mainSource, /fetch\(galleryDataUrl\)/);
});

test("main modal navigation and virtual rows keep bottom-edge contracts", () => {
  assert.match(cssBlock(".modal__nav"), /top:\s*50%;/);
  assert.match(cssBlock(".modal__nav"), /transform:\s*translateY\(-50%\);/);
  assert.match(cssBlock(".modal__nav"), /place-items:\s*center;/);

  assert.match(virtualRows, /containerRef\s*=\s*useRef<HTMLDivElement \| null>\(null\)/);
  assert.doesNotMatch(virtualRows, /topOffset\s*=\s*260/);
  assert.match(virtualRows, /rows\.length \* measuredRowHeight \+ \(rows\.length - 1\) \* gap/);
  assert.match(virtualRows, /Math\.ceil\(\(viewport\.scrollY \+ viewport\.height - container\.top\) \/ stride\) \+\s*overscan/s);
});
