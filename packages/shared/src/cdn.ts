import type { Photo, ResolvedPhoto, ResolvedPhotoUrls } from "./types.js";

export type CdnSearchParamValue = boolean | number | string | null | undefined;

export interface CdnUrlOptions {
  /** CDN origin, e.g. https://cdn.example.com. Omit to keep paths relative. */
  baseUrl?: string;
  /** Optional prefix/bucket folder applied before relative asset keys. */
  assetPrefix?: string;
  /** Optional query params, useful for immutable versioning or image transforms. */
  searchParams?: Readonly<Record<string, CdnSearchParamValue>>;
}

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:/i;

export const isAbsoluteUrl = (value: string): boolean =>
  ABSOLUTE_URL_RE.test(value) || value.startsWith("//");

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, "");

const joinPath = (...parts: Array<string | undefined>): string =>
  parts
    .map((part) => trimSlashes(part ?? ""))
    .filter(Boolean)
    .join("/");

const encodePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const appendSearchParams = (
  url: string,
  params?: CdnUrlOptions["searchParams"],
): string => {
  const entries = Object.entries(params ?? {}).filter(
    (
      entry,
    ): entry is [string, Exclude<CdnSearchParamValue, null | undefined>] => {
      const [, value] = entry;
      return value !== undefined && value !== null;
    },
  );

  if (entries.length === 0) {
    return url;
  }

  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const search = new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
  const separator = withoutHash.includes("?") ? "&" : "?";

  return `${withoutHash}${separator}${search.toString()}${hash}`;
};

export const resolveCdnUrl = (
  pathOrUrl: string,
  options: CdnUrlOptions = {},
): string => {
  const raw = pathOrUrl.trim();
  if (!raw) {
    throw new Error("Cannot resolve an empty CDN path.");
  }

  if (isAbsoluteUrl(raw)) {
    return appendSearchParams(raw, options.searchParams);
  }

  const [pathAndQuery = "", hash = ""] = raw.split("#", 2);
  const [pathOnly = "", query = ""] = pathAndQuery.split("?", 2);
  const normalizedPath = encodePath(joinPath(options.assetPrefix, pathOnly));
  const normalizedBase = options.baseUrl?.trim().replace(/\/+$/g, "") ?? "";
  const prefix = normalizedBase ? `${normalizedBase}/` : "";
  const resolved = `${prefix}${normalizedPath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;

  return appendSearchParams(resolved, options.searchParams);
};

export const resolvePhotoUrls = (
  photo: Photo,
  options: CdnUrlOptions = {},
): ResolvedPhotoUrls => {
  const original = resolveCdnUrl(photo.asset.original, options);
  const thumbnail = resolveCdnUrl(
    photo.asset.thumbnail ?? photo.asset.original,
    options,
  );
  const preview = resolveCdnUrl(
    photo.asset.preview ?? photo.asset.thumbnail ?? photo.asset.original,
    options,
  );

  return { original, thumbnail, preview };
};

export const resolvePhotoAssetUrls = (
  photo: Photo,
  options: CdnUrlOptions = {},
): ResolvedPhoto => ({
  ...photo,
  urls: resolvePhotoUrls(photo, options),
});

export const resolveGalleryPhotoUrls = (
  photos: readonly Photo[],
  options: CdnUrlOptions = {},
): ResolvedPhoto[] =>
  photos.map((photo) => resolvePhotoAssetUrls(photo, options));
