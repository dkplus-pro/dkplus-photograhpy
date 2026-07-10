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

The watermark tool deploys through its own GitHub Pages workflow and artifact. It must not replace the existing gallery deployment. The Vite base path is derived from `GITHUB_REPOSITORY`, allowing the static bundle to load correctly from a project Pages URL.

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
