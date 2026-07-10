# Watermark tool

`apps/watermark` is a standalone Vite + React application for applying a branded watermark to locally selected photos. It is designed for static hosting on GitHub Pages: the production build has no runtime dependency on the private admin API or server.

## Supported workflow

1. Select one or more source photos from the local machine.
2. Choose a logo from an imported brand kit or select a custom local logo.
3. Review and edit the per-photo camera metadata when EXIF is incomplete.
4. Render the selected photos with bounded worker concurrency. Rendering falls back to the main thread when a Worker or `OffscreenCanvas` is unavailable.
5. Download the completed batch as a client-side ZIP archive.

Source files and custom logos remain local to the browser. The application must revoke object URLs when files are replaced or removed, and should release worker resources when work completes or the page closes.

## Watermark metadata

The watermark displays the available EXIF camera fields:

- camera model
- lens
- focal length
- aperture
- shutter speed
- ISO

These values are extracted from each source image where possible. Any missing value remains editable before rendering, so photos without complete EXIF can still be exported accurately.

## Brand kit input

GitHub Pages cannot query the private admin API. A brand logo is therefore supplied through an importable gallery/brand JSON export or a statically bundled sample kit. Custom uploaded logos are also supported and are never uploaded to an API.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @dkplus/watermark dev
pnpm --filter @dkplus/watermark typecheck
pnpm --filter @dkplus/watermark test
pnpm --filter @dkplus/watermark build
```

Use Node.js 20.19+ and pnpm 10+ (via Corepack), consistent with the workspace root.

## Deployment

GitHub Pages permits one Pages site per repository. A second workflow that calls
`deploy-pages` would therefore replace the gallery's current Pages deployment;
it is not an isolation boundary. The safe repository-level deployment design is
one workflow and one assembled Pages artifact:

1. Keep `.github/workflows/pages.yml` as the sole workflow that uploads and
   deploys the `github-pages` artifact.
2. Build the gallery at its existing project Pages base,
   `/${repositoryName}/`.
3. Build the watermark app with
   `VITE_BASE_PATH=/${repositoryName}/watermark/`.
4. Stage `apps/main/dist` at the artifact root and copy
   `apps/watermark/dist` into `watermark/` below that root before
   `upload-pages-artifact` runs.

This retains the gallery at `https://<owner>.github.io/<repository>/` and
publishes the watermark app at
`https://<owner>.github.io/<repository>/watermark/` in the same atomic
deployment. The Pages workflow must continue to use the existing
`github-pages` concurrency group, permissions, build-to-deploy dependency, and
deployment environment. Do not add an independent `deploy-pages` workflow for
the watermark app.

The required workflow contract test should build both apps, inspect the staged
artifact for `index.html` and `watermark/index.html`, and assert the watermark
HTML references assets below the `/watermark/` project Pages base. This catches
an accidental artifact replacement or incorrect asset base before deployment.

## Verification checklist

Before release, verify:

- the production build works with no API/server process running;
- batch selection, removal, and replacement do not leave stale previews or object URLs;
- EXIF fields are preserved when available and editable when absent;
- both bundled/imported brand logos and custom local logos render;
- the Worker/OffscreenCanvas fallback path renders a valid export;
- ZIP export contains every completed selection with predictable filenames;
- all controls have accessible labels and status/progress updates;
- the app-local tests, root typecheck, lint, and test suites pass.
