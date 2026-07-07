# DKPlus Photography

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

## Data flow

`data/photos.json` is the editable source of truth for gallery metadata. The public app build reads that file and writes a generated static artifact at `apps/main/public/data/gallery.json`, which is ignored by git.
