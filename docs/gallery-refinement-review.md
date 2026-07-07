# DKPlus Gallery Refinement Review

This note records the code-review and documentation slice for the DKPlus gallery/admin refinement. It is intentionally evidence-based: target behavior is separated from current-code observations so implementation and test tasks can use it as an integration checklist.

## Target product contract

### Public gallery (`apps/main`)

- Main image items must render with square corners and no visual rounding on the card, image, or clipping container.
- The homepage must not show oversized hero/title marketing copy. Keep navigation/brand affordances concise and let the gallery grid lead the page.
- Virtualized gallery, topic, timeline, and modal flows should continue to support keyboard access, lazy image loading, and descriptive image alt text.

### Admin UI (`apps/admin`)

- The admin interface copy must be Chinese-first.
- Do not use a large hero/banner panel in the admin workspace. Use a compact page header and action toolbar instead.
- Migrate form controls, actions, upload controls, table/list, pagination, dialogs, and notifications to `@arco-design/web-react` so interaction states and accessibility behavior are consistent.
- Add/edit photo metadata through an Arco `Modal`; avoid a permanently expanded editor form in the main workspace.
- Image management should be a compact paginated table/list with rich operational columns:
  - thumbnail and title
  - topic/status/tags
  - storage, mime type, file size, and URL/key hints
  - EXIF summary such as camera, lens, ISO, shutter, aperture, focal length
  - taken/created/updated timestamps
  - row actions for edit/delete and batch actions for selected records

### Admin API and uploads (`apps/server`)

- The admin client builds upload requests from base URL `/api` plus path `/uploads`, so local development expects `POST /api/uploads` to reach the Koa server.
- Upload requests require the configured admin bearer token, multipart image files, and safe local/COS storage configuration from `apps/server/.env.local`.
- Real `apps/server/.env.local` values remain local-only. Commit only example environment files such as `apps/server/.env.local.example`.

## `/api/uploads` 404 root-cause evidence

Observed source evidence:

1. `apps/admin/src/lib/api.ts` defaults the API base URL to `import.meta.env.VITE_API_BASE_URL ?? "/api"` and uploads with `requestJson(baseUrl, "/uploads", { method: "POST", body })`.
2. `apps/server/src/routes/photos.ts` mounts the Koa router with `new Router({ prefix: "/api" })` and defines the upload endpoint as `router.post("/uploads", upload.any(), ...)`, so the server-side endpoint is `POST /api/uploads`.
3. `apps/admin/vite.config.ts` sets only the dev and preview ports; it does not proxy `/api` from the admin Vite dev server (`5174`) to the Koa API server (`4010`).
4. `apps/server/.env.local.example` documents the API server default as `PORT=4010` and allows `CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174`.

Conclusion: in admin local development, the default relative `/api/uploads` URL is sent to the Vite admin origin unless `VITE_API_BASE_URL` points at the Koa server or Vite proxies `/api`. Because the current admin Vite config has no proxy, the request can 404 before it reaches the Koa upload route. The implementation fix should add an admin dev proxy for `/api` to `http://127.0.0.1:4010` or require/document `VITE_API_BASE_URL=http://127.0.0.1:4010/api` for local admin sessions. A proxy is the safer default because it preserves same-origin browser requests.

## Review checklist before completion

Use this checklist during integration review:

- [ ] Public gallery image cards and images have square corners/no border radius in the primary grid.
- [ ] Homepage oversized hero/title copy is removed; the gallery content is visible without a banner dominating the page.
- [ ] Admin visible copy is Chinese-first.
- [ ] Admin no longer renders a large hero/banner panel.
- [ ] Admin controls use `@arco-design/web-react` components rather than bespoke buttons/inputs/selects/dialogs.
- [ ] Add/edit flows open in an Arco modal and reset state after save/cancel.
- [ ] Image management is a compact paginated table/list with rich metadata and EXIF columns.
- [ ] `POST /api/uploads` reaches Koa in local development via proxy or explicit `VITE_API_BASE_URL`.
- [ ] Local/COS upload URLs are usable by the admin UI after upload.
- [ ] `apps/server/.env.local` is not tracked and no secret values are committed.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm format:check` pass.
