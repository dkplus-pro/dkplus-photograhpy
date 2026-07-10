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

  assert.match(app, /multiple[\s\S]*onChange={addPhotos}/);
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

test("Pages build preserves the gallery and publishes watermark below its nested base", async () => {
  const [config, mainConfig, workflow] = await Promise.all([
    appFile("vite.config.ts"),
    readFile(
      new URL("../../../apps/main/vite.config.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../.github/workflows/pages.yml", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(config, /`\/\$\{repositoryName\}\/watermark\//);
  assert.match(mainConfig, /`\/\$\{repositoryName\}\//);
  assert.match(workflow, /Build main gallery/);
  assert.match(workflow, /pnpm --filter @dkplus\/watermark build/);
  assert.match(workflow, /mkdir -p apps\/main\/dist\/watermark/);
  assert.match(
    workflow,
    /cp -R apps\/watermark\/dist\/\. apps\/main\/dist\/watermark\//,
  );
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.doesNotMatch(
    workflow,
    /peaceiris\/actions-gh-pages|contents:\s*write|destination_dir:/,
  );

  await assert.rejects(
    readFile(
      new URL(
        "../../../.github/workflows/watermark-pages.yml",
        import.meta.url,
      ),
      "utf8",
    ),
    { code: "ENOENT" },
  );
});
