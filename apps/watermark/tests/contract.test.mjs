import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const appRoot = new URL("..", import.meta.url);

async function appFile(path) {
  return readFile(new URL(path, `${appRoot}/`), "utf8");
}

test("watermark app declares the static-export dependencies", async () => {
  const manifest = JSON.parse(await appFile("package.json"));

  assert.equal(manifest.dependencies.react.startsWith("^19."), true);
  assert.equal(typeof manifest.dependencies.exifr, "string");
  assert.equal(typeof manifest.dependencies.jszip, "string");
  assert.match(manifest.scripts.build, /vite build/);
});

test("watermark UI keeps batch, EXIF, logo, and ZIP controls accessible", async () => {
  const app = await appFile("src/App.tsx");

  assert.match(app, /multiple onChange={addPhotos}/);
  assert.match(app, /Brand kit JSON/);
  assert.match(app, /Upload custom logo/);
  assert.match(app, /Camera model/);
  assert.match(app, /Export watermarked ZIP/);
  assert.match(app, /aria-live="polite"/);
});

test("worker rendering is bounded and falls back to the main thread", async () => {
  const renderer = await appFile("src/render-client.ts");

  assert.match(renderer, /Math\.min\(jobCount, hardware, 4\)/);
  assert.match(renderer, /new Worker\(/);
  assert.match(renderer, /await mainThreadRender/);
  assert.match(renderer, /URL\.revokeObjectURL/);
});

test("Pages build uses a separate watermark directory", async () => {
  const config = await appFile("vite.config.ts");
  const workflow = await readFile(new URL("../../../.github/workflows/watermark-pages.yml", import.meta.url), "utf8");

  assert.match(config, /watermark/);
  assert.match(workflow, /destination_dir: watermark/);
  assert.match(workflow, /keep_files: true/);
});
