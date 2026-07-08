# dk+ photography

A pnpm/turbo monorepo for a static public photography gallery, admin UI, shared TypeScript domain helpers, and a private admin API.

## Workspace layout

```text
apps/
  main/      Public static gallery site built with React + Vite.
  admin/     Private admin UI built with React + Vite.
  server/    Private Koa API for JSON data, upload, COS, and EXIF workflows.
packages/
  shared/    Shared TypeScript photo/topic/EXIF types and reusable helpers.
data/
  photos.json  Source gallery records used by the public build and admin API.
```

## Prerequisites

- Node.js 20.19 or newer
- pnpm 10 or newer via Corepack (`corepack enable`)

## Common commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The root scripts delegate to Turbo so each workspace can provide its own `build`, `lint`, `typecheck`, `test`, `dev`, and `clean` scripts.

## Configuration and secrets

- Keep real secrets in local-only files such as `.env.local`.
- Commit only example files such as `.env.example` or `.env.local.example`.
- The server package owns Tencent COS credentials and upload configuration examples.

## Gallery refinement notes

The current gallery/admin refinement contract and review checklist live in [`docs/gallery-refinement-review.md`](docs/gallery-refinement-review.md). It records the square-corner public gallery requirement, Chinese Arco-based admin target, compact modal/table management flow, `/api/uploads` 404 root-cause evidence, and verification checklist.

## Data flow

`data/photos.json` is the editable seed/export artifact for gallery metadata. The server keeps the private editable source in SQLite, exposes a minimal public client payload at `/api/gallery` for local Main development, and writes the generated static artifact used by production Main builds at `apps/main/public/data/gallery.json` (ignored by git). That public payload intentionally omits admin-only fields such as record `createdAt`/`updatedAt`, raw upload/image records, SQLite metadata, and secrets.

Set `GALLERY_CDN_BASE_URL` (or `VITE_CDN_BASE_URL`) and optional `GALLERY_ASSET_PREFIX` during `pnpm --filter @dkplus/main build` to rewrite relative image asset keys to CDN URLs in the generated static JSON.
