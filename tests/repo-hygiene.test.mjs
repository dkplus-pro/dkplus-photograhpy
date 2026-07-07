import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const generatedArtifactPatterns = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /(^|\/)\.turbo\//,
  /(^|\/)\.vite\//,
  /(^|\/)\.cache\//,
  /(^|\/)node_modules\//,
  /(^|\/)playwright-report\//,
  /(^|\/)test-results\//,
  /(^|\/).*\.tsbuildinfo$/,
  /^apps\/main\/public\/data\/gallery\.json$/,
];

const expectedIgnoredGeneratedPaths = [
  "apps/main/public/data/gallery.json",
  "apps/main/dist/index.js",
  "apps/server/dist/index.js",
  "packages/shared/dist/index.js",
  ".turbo/cache/artifact.json",
  ".vite/deps/chunk.js",
  ".cache/tool-output.json",
  "coverage/lcov.info",
  "test-results/results.json",
  "playwright-report/index.html",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

test("generated artifacts are not tracked by git", () => {
  const trackedFiles = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const trackedGeneratedArtifacts = trackedFiles.filter((filePath) =>
    generatedArtifactPatterns.some((pattern) => pattern.test(filePath)),
  );

  assert.deepEqual(trackedGeneratedArtifacts, []);
});

test("generated artifact locations are ignored by git", () => {
  const ignoredPaths = git(["check-ignore", ...expectedIgnoredGeneratedPaths])
    .split("\n")
    .filter(Boolean);

  assert.deepEqual(ignoredPaths.sort(), expectedIgnoredGeneratedPaths.sort());
});
