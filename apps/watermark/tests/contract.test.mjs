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

test("watermark UI keeps batch, EXIF, logo, and ZIP controls accessible in Chinese", async () => {
  const app = await appFile("src/App.tsx");

  assert.match(app, /multiple[\s\S]*onChange={addPhotos}/);
  for (const message of [
    "品牌素材包 JSON",
    "上传自定义标志",
    "相机型号",
    "导出已加水印的 ZIP",
    "照片会始终保留在当前浏览器中",
    "无需上传，即可为整组照片添加水印。",
    "尚未选择照片。",
    "文件只会在本地处理，照片不会上传到服务器。",
  ]) {
    assert.match(app, new RegExp(message));
  }
  assert.doesNotMatch(
    app,
    /Export watermarked ZIP|Camera model|Upload custom logo/,
  );
  assert.match(app, /aria-live="polite"/);
});

test("live preview renders the selected photo with the export watermark treatment", async () => {
  const app = await appFile("src/App.tsx");
  const preview = await appFile("src/live-watermark-preview.tsx");
  const styles = await appFile("src/styles.css");

  assert.match(app, /import \{ LiveWatermarkPreview \}/);
  assert.match(app, /photo=\{photos\[0\] \?\? null\}/);
  assert.match(app, /logoSource=\{logoSource\}/);
  assert.match(preview, /drawWatermark/);
  assert.match(preview, /maximumPreviewDimension = 1600/);
  assert.match(preview, /photo: PhotoEntry \| null/);
  assert.match(preview, /尚未选择预览照片/);
  assert.match(preview, /实时水印预览/);
  assert.match(styles, /\.preview-canvas/);
  assert.match(styles, /@media \(max-width: 640px\)/);
});

test("brand-kit imports assign unique logo IDs before rendering options", async () => {
  const app = await appFile("src/App.tsx");

  assert.match(app, /function withUniqueLogoIds/);
  assert.match(
    app,
    /const usedIds = new Set\(existing\.map\(\(logo\) => logo\.id\)\)/,
  );
  assert.match(app, /while \(usedIds\.has\(id\)\)/);
  assert.match(
    app,
    /const uniqueImported = withUniqueLogoIds\(brandLogos, imported\)/,
  );
});

test("worker rendering is bounded and falls back to the main thread", async () => {
  const renderer = await appFile("src/render-client.ts");

  assert.match(renderer, /Math\.min\(jobCount, hardware, 4\)/);
  assert.match(renderer, /new Worker\(/);
  assert.match(renderer, /await mainThreadRender/);
  assert.match(renderer, /URL\.revokeObjectURL/);
});

test("watermark canvas uses the canonical footer composition in both render paths", async () => {
  const canvas = await appFile("src/canvas.ts");
  const renderer = await appFile("src/render-client.ts");
  const worker = await appFile("src/watermark.worker.ts");

  assert.match(canvas, /clamp\(height \* 0\.2, 132, 340\)/);
  assert.match(canvas, /rgba\(9, 9, 11, 0\.9\)/);
  assert.match(canvas, /#fafafa/);
  assert.match(canvas, /Futura, "Futura PT", "Avenir Next"/);
  assert.match(canvas, /"Fira Code", "Fira Sans"/);
  assert.match(canvas, /watermarkMetadataSpacer = "  "/);
  assert.match(canvas, /watermarkSecondarySpacer = "     "/);
  assert.match(
    canvas,
    /\[options\.exif\.focalLength, options\.exif\.exposure\]/,
  );
  assert.match(canvas, /\[options\.exif\.model, options\.exif\.lens\]/);
  assert.match(canvas, /drawAdaptiveLogoImage/);
  assert.match(canvas, /drawLogoMark/);
  assert.match(canvas, /const hasLogo = Boolean\(options\.logoMark\)/);
  assert.match(canvas, /options\.logoMark \|\| "dk\+"/);
  assert.doesNotMatch(canvas, /drawLogoMark\([\s\S]*options\.text/);
  assert.match(canvas, /fitText\(context, firstRow, textWidth\)/);
  assert.match(canvas, /fitText\(context, secondRow, textWidth\)/);
  assert.doesNotMatch(canvas, /footerTop|exifLines\(options\.exif\)/);
  assert.match(
    renderer,
    /drawWatermark\(context, width, height, options, logo\)/,
  );
  assert.match(renderer, /context\.fillStyle = "#09090b"/);
  assert.match(
    worker,
    /drawWatermark\(context, canvas\.width, canvas\.height, options, logo\)/,
  );
  assert.match(worker, /context\.fillStyle = "#09090b"/);
});

test("selected logo marks are passed to batch rendering independently of watermark text", async () => {
  const app = await appFile("src/App.tsx");
  const types = await appFile("src/types.ts");

  assert.match(app, /const logoMark =/);
  assert.match(app, /selectedBrandLogo\?\.name \|\| null/);
  assert.match(app, /logoMark,/);
  assert.match(types, /logoMark\?: string \| null/);
});

test("Pages build includes watermark under the gallery's combined artifact", async () => {
  const config = await appFile("vite.config.ts");
  const workflow = await readFile(
    new URL("../../../.github/workflows/pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(config, /watermark/);
  assert.match(workflow, /pnpm --filter @dkplus\/watermark build/);
  assert.match(workflow, /apps\/main\/dist\/watermark/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
});
