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
const viteConfig = readFileSync(path.join(dirname, "../vite.config.ts"), "utf8");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cssBlock = (selector) => {
  const match = styles.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"),
  );
  assert.ok(match, `Expected ${selector} CSS block to exist`);
  return match[1];
};

test("main photo cards keep the compact no-zoom square-card contract", () => {
  assert.match(cssBlock(".virtual-grid__row"), /gap:\s*8px;/);
  assert.match(virtualRows, /gap\s*=\s*8,/);

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

test("main dev uses API data while build uses generated static JSON", () => {
  assert.match(mainSource, /import\.meta\.env\.DEV\s*\?\s*"\/api\/gallery"/);
  assert.match(mainSource, /BASE_URL\}data\/gallery\.json/);
  assert.match(viteConfig, /"\/api"\s*:\s*\{/);
  assert.match(viteConfig, /VITE_API_PROXY_TARGET/);
});

test("main modal navigation buttons stay vertically centered", () => {
  assert.match(cssBlock(".modal__nav"), /top:\s*50%;/);
  assert.match(cssBlock(".modal__nav"), /transform:\s*translateY\(-50%\);/);
});

test("virtual rows measure their own grid offset instead of using a fixed page offset", () => {
  assert.match(virtualRows, /containerRef/);
  assert.match(virtualRows, /getBoundingClientRect\(\)\.top\s*\+\s*window\.scrollY/);
  assert.doesNotMatch(virtualRows, /topOffset\s*=\s*260/);
});
