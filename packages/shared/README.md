# @dkplus/shared

Shared TypeScript contract package for dk+ photography.

## Exports

- Photo, Topic, GalleryData, EXIF, and resolved CDN URL types
- JSON schema-like shape constants for API/admin documentation
- Validation helpers returning structured field-level issues
- Timeline month grouping helpers for the public gallery
- CDN URL resolution helpers for build-time data generation

The package intentionally avoids runtime dependencies so it can be reused by the Vite apps, server, and static build scripts.
