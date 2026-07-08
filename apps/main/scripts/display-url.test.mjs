import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const galleryPath = path.join(dirname, "../src/gallery.ts");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "dkplus-main-gallery-"));
const tempModulePath = path.join(tempDir, "gallery.mjs");
const source = readFileSync(galleryPath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: galleryPath,
});
await writeFile(tempModulePath, outputText, "utf8");

const { withPreviewQualityDisplayQuery, withThumbnailDisplayQuery } =
  await import(pathToFileURL(tempModulePath).href);

test.after(async () => {
  await unlink(tempModulePath);
});

test("display imageMogr2 helpers preserve query/hash and keep preview quality opt-in", () => {
  assert.equal(
    withThumbnailDisplayQuery(
      "https://cdn.example.com/thumb.jpg?existing=1#card",
    ),
    "https://cdn.example.com/thumb.jpg?existing=1&imageMogr2/thumbnail/800x#card",
  );
  assert.equal(
    withPreviewQualityDisplayQuery(
      "https://cdn.example.com/preview.jpg?existing=1#modal",
    ),
    "https://cdn.example.com/preview.jpg?existing=1&imageMogr2/quality/25#modal",
  );
});

test("display imageMogr2 helpers skip unsafe or already transformed urls", () => {
  const dataUrl = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
  const blobUrl = "blob:https://example.com/photo-id";
  const transformed =
    "https://cdn.example.com/photo.jpg?imageMogr2/thumbnail/800x#done";
  const unsplash = "https://images.unsplash.com/photo.jpg?ixid=abc";

  assert.equal(withPreviewQualityDisplayQuery(dataUrl), dataUrl);
  assert.equal(withPreviewQualityDisplayQuery(blobUrl), blobUrl);
  assert.equal(withPreviewQualityDisplayQuery(transformed), transformed);
  assert.equal(withPreviewQualityDisplayQuery(unsplash), unsplash);
});
