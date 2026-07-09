import type {
  BrandLogoRecord,
  BrandPayload,
  BrandRecord,
  PhotoExif,
  PhotoPayload,
  PhotoRecord,
  TopicPayload,
  TopicRecord,
  UploadPreview,
} from "../types";

export interface UploadResult {
  photo?: PhotoRecord;
  url?: string;
  exif?: PhotoRecord["exif"];
}

export interface ExportResult {
  exportFile: string;
  generatedAt: string;
  photoCount: number;
  topicCount: number;
}

export interface UploadFailure {
  index: number;
  fileName: string;
  code: string;
  message: string;
}

export interface UploadBulkResult {
  photos: PhotoRecord[];
  failed: UploadFailure[];
  export?: ExportResult;
}

export interface ApiClient {
  listPhotos: () => Promise<PhotoRecord[]>;
  listTopics: () => Promise<TopicRecord[]>;
  listBrands: () => Promise<BrandRecord[]>;
  createTopic: (payload: TopicPayload) => Promise<TopicRecord>;
  updateTopic: (id: string, payload: TopicPayload) => Promise<TopicRecord>;
  deleteTopic: (id: string) => Promise<void>;
  createBrand: (payload: BrandPayload) => Promise<BrandRecord>;
  updateBrand: (id: string, payload: BrandPayload) => Promise<BrandRecord>;
  deleteBrand: (id: string) => Promise<void>;
  createPhoto: (payload: PhotoPayload) => Promise<PhotoRecord>;
  updatePhoto: (id: string, payload: PhotoPayload) => Promise<PhotoRecord>;
  deletePhoto: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  exportGallery: () => Promise<ExportResult>;
  uploadPhoto: (
    preview: UploadPreview,
    photoId?: string,
  ) => Promise<UploadResult>;
  uploadPhotos: (previews: UploadPreview[]) => Promise<UploadBulkResult>;
}

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/$/, "");

const ADMIN_TOKEN_STORAGE_KEY = "dkplus.adminToken";

type ServerPhoto = PhotoRecord & {
  asset?: {
    original?: string;
    thumbnail?: string;
    preview?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
  image?: { url?: string; key?: string; fileName?: string };
  thumbnailUrl?: string;
  takenAt?: string;
  topicIds?: string[];
  exif?: ServerExif;
};

type ServerPhotoEnvelope = ServerPhoto | { photo: ServerPhoto };
type ServerTopicEnvelope = TopicRecord | { topic: TopicRecord };
type ServerBrand = Omit<Partial<BrandRecord>, "logos"> & {
  id?: string;
  name?: string;
  title?: string;
  brand?: string;
  cameraMake?: string;
  displayName?: string;
  logoUrl?: string;
  logoUrls?: string[];
  logos?: unknown;
};
type ServerBrandEnvelope = ServerBrand | { brand: ServerBrand };
type ServerExportEnvelope = ExportResult | { export: ExportResult };
type ServerExif = PhotoExif & {
  cameraBrand?: string;
  cameraModel?: string;
  lensModel?: string;
  shutterSpeed?: string;
  focalLengthMm?: number;
};
type ServerUploadResult = Omit<UploadResult, "exif" | "photo"> & {
  exif?: ServerExif;
  photo?: ServerPhoto;
  photos?: ServerPhoto[];
};
type ServerUploadBulkResult = {
  photos?: ServerPhoto[];
  failed?: UploadFailure[];
  export?: ExportResult;
};

const isAbsoluteUrl = (value: string): boolean =>
  /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");

const resolveDisplayUrl = (value?: string): string | undefined => {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (isAbsoluteUrl(raw) || raw.startsWith("/")) return raw;
  return `https://images.unsplash.com/${raw.replace(/^\/+/, "")}`;
};

const normalizeTopicIds = (values: Array<string | undefined>): string[] => [
  ...new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ),
];

const topicIdsFromPayload = (payload: PhotoPayload): string[] =>
  normalizeTopicIds([...(payload.topicIds ?? []), payload.topicId]);

const topicIdsFromPreview = (preview: UploadPreview): string[] =>
  normalizeTopicIds([...(preview.topicIds ?? []), preview.topicId]);

const toServerPayload = (payload: PhotoPayload) => {
  const topicIds = topicIdsFromPayload(payload);
  return {
    title: payload.title,
    description: payload.description,
    topicId: topicIds[0],
    topicIds,
    image: payload.imageUrl
      ? {
          url: payload.imageUrl,
          storage: "remote",
        }
      : undefined,
    exif: payload.exif,
  };
};

const toServerTopicPayload = (payload: TopicPayload) => ({
  id: payload.id?.trim() || undefined,
  title: payload.title.trim(),
  description: payload.description?.trim() ?? "",
});

const cleanBrandLogos = (logos: BrandLogoRecord[]): BrandLogoRecord[] =>
  logos
    .map((logo) => ({
      id: logo.id?.trim() || undefined,
      url: logo.url.trim(),
      label: logo.label?.trim() || undefined,
    }))
    .filter((logo) => Boolean(logo.url));

const toServerBrandPayload = (payload: BrandPayload) => ({
  name: payload.name.trim(),
  title: payload.title?.trim() || payload.name.trim(),
  aliases: payload.aliases
    ?.map((alias) => alias.trim())
    .filter((alias) => Boolean(alias)),
  logos: cleanBrandLogos(payload.logos),
});

const toBulkUploadItem = (preview: UploadPreview) => {
  const topicIds = topicIdsFromPreview(preview);
  return {
    title: preview.title.trim() || undefined,
    description: preview.description.trim() || undefined,
    topicId: topicIds[0],
    topicIds: topicIds.length ? topicIds : undefined,
    exif: preview.exif,
  };
};

const readAdminToken = (): string | undefined => {
  const envToken = import.meta.env.VITE_ADMIN_TOKEN?.trim();
  if (envToken) return envToken;

  if (typeof window === "undefined") return undefined;

  try {
    return (
      window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() || undefined
    );
  } catch {
    return undefined;
  }
};

const buildHeaders = (init?: RequestInit): Headers => {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const adminToken = readAdminToken();
  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
};

export const normalizePhotoForAdmin = (
  input: ServerPhotoEnvelope,
): PhotoRecord => {
  const source = "photo" in input ? input.photo : input;
  const topicIds = normalizeTopicIds([
    source.topicId,
    ...(source.topicIds ?? []),
  ]);
  const imageUrl = resolveDisplayUrl(
    source.imageUrl || source.image?.url || source.asset?.original,
  );
  const thumbnailUrl = resolveDisplayUrl(
    source.thumbnailUrl ||
      source.asset?.thumbnail ||
      source.image?.url ||
      source.asset?.original,
  );
  return {
    ...source,
    topicId: source.topicId ?? topicIds[0],
    topicIds,
    imageUrl: imageUrl ?? "",
    thumbnailUrl,
    exif: normalizeExifForAdmin(source.exif),
  };
};

export const normalizeTopicForAdmin = (
  input: ServerTopicEnvelope,
): TopicRecord => {
  const source = "topic" in input ? input.topic : input;
  return {
    ...source,
    id: source.id.trim(),
    title: source.title.trim(),
    description: source.description?.trim() || undefined,
  };
};

const brandIdFromName = (name: string): string => {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `brand-${Array.from(name)
    .map((char) => char.charCodeAt(0).toString(36))
    .join("-")}`;
};

const normalizeBrandLogos = (value: unknown): BrandLogoRecord[] => {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry, index): BrandLogoRecord | undefined => {
      if (typeof entry === "string") {
        const url = entry.trim();
        return url ? { id: `logo-${index + 1}`, url } : undefined;
      }
      if (!entry || typeof entry !== "object") return undefined;
      const logo = entry as {
        id?: unknown;
        url?: unknown;
        logoUrl?: unknown;
        src?: unknown;
        label?: unknown;
        title?: unknown;
        name?: unknown;
      };
      const rawUrl =
        typeof logo.url === "string"
          ? logo.url
          : typeof logo.logoUrl === "string"
            ? logo.logoUrl
            : typeof logo.src === "string"
              ? logo.src
              : "";
      const url = rawUrl.trim();
      if (!url) return undefined;
      const label =
        typeof logo.label === "string"
          ? logo.label.trim()
          : typeof logo.title === "string"
            ? logo.title.trim()
            : typeof logo.name === "string"
              ? logo.name.trim()
              : undefined;
      const id = typeof logo.id === "string" ? logo.id.trim() : "";
      return { id: id || `logo-${index + 1}`, url, label: label || undefined };
    })
    .filter((logo): logo is BrandLogoRecord => Boolean(logo));
};

export const normalizeBrandForAdmin = (
  input: ServerBrandEnvelope,
): BrandRecord => {
  const source = "brand" in input ? input.brand : input;
  const name = (
    source.name ||
    source.title ||
    source.displayName ||
    source.brand ||
    source.cameraMake ||
    source.id ||
    "未命名品牌"
  ).trim();
  const title = (source.title || source.displayName || name).trim();
  const logoSource =
    source.logos ?? source.logoUrls ?? source.logoUrl ?? undefined;
  return {
    ...source,
    id: (source.id || brandIdFromName(name)).trim(),
    name,
    title,
    logos: normalizeBrandLogos(logoSource),
    aliases: source.aliases?.filter((alias) => Boolean(alias.trim())),
    photoCount: source.photoCount,
  };
};

const normalizeExifForAdmin = (exif?: ServerExif): PhotoExif | undefined => {
  if (!exif) return undefined;
  return {
    ...exif,
    cameraMake: exif.cameraMake ?? exif.cameraBrand,
    lens: exif.lens ?? exif.lensModel,
    shutter: exif.shutter ?? exif.shutterSpeed,
    focalLength:
      exif.focalLength ??
      (typeof exif.focalLengthMm === "number"
        ? `${exif.focalLengthMm}mm`
        : undefined),
  };
};

const requestJson = async <T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: buildHeaders(init),
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: string | { message?: string };
        message?: string;
      };
      message =
        typeof body.error === "string"
          ? body.error
          : (body.error?.message ?? body.message ?? message);
    } catch {
      // Keep HTTP status fallback.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const hasBulkFailures = (value: unknown): value is ServerUploadBulkResult =>
  Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { failed?: unknown }).failed),
  );

const requestBulkUploadJson = async (
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<ServerUploadBulkResult> => {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: buildHeaders(init),
  });

  let parsedBody: unknown;
  try {
    parsedBody = await response.json();
  } catch {
    parsedBody = undefined;
  }

  if (!response.ok) {
    if (hasBulkFailures(parsedBody)) return parsedBody;

    let message = `${response.status} ${response.statusText}`;
    const body = parsedBody as
      { error?: string | { message?: string }; message?: string } | undefined;
    if (body) {
      message =
        typeof body.error === "string"
          ? body.error
          : (body.error?.message ?? body.message ?? message);
    }
    throw new Error(message);
  }

  return (parsedBody ?? {}) as ServerUploadBulkResult;
};

const unwrapPhotos = (
  value: ServerPhoto[] | { photos?: ServerPhoto[]; data?: ServerPhoto[] },
): PhotoRecord[] => {
  if (Array.isArray(value)) return value.map(normalizePhotoForAdmin);
  return (value.photos ?? value.data ?? []).map(normalizePhotoForAdmin);
};

const unwrapTopics = (
  value:
    | ServerTopicEnvelope[]
    | { topics?: ServerTopicEnvelope[]; data?: ServerTopicEnvelope[] },
): TopicRecord[] => {
  if (Array.isArray(value)) return value.map(normalizeTopicForAdmin);
  return (value.topics ?? value.data ?? []).map(normalizeTopicForAdmin);
};

const unwrapBrands = (
  value:
    | ServerBrandEnvelope[]
    | { brands?: ServerBrandEnvelope[]; data?: ServerBrandEnvelope[] },
): BrandRecord[] => {
  if (Array.isArray(value)) return value.map(normalizeBrandForAdmin);
  return (value.brands ?? value.data ?? []).map(normalizeBrandForAdmin);
};

export const createApiClient = (
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api",
): ApiClient => ({
  async listPhotos() {
    return unwrapPhotos(
      await requestJson<
        PhotoRecord[] | { photos?: PhotoRecord[]; data?: PhotoRecord[] }
      >(baseUrl, "/photos"),
    );
  },
  async listTopics() {
    return unwrapTopics(
      await requestJson<
        TopicRecord[] | { topics?: TopicRecord[]; data?: TopicRecord[] }
      >(baseUrl, "/topics"),
    );
  },
  async listBrands() {
    return unwrapBrands(
      await requestJson<
        | ServerBrandEnvelope[]
        | { brands?: ServerBrandEnvelope[]; data?: ServerBrandEnvelope[] }
      >(baseUrl, "/brands"),
    );
  },
  async createTopic(payload) {
    return normalizeTopicForAdmin(
      await requestJson<ServerTopicEnvelope>(baseUrl, "/topics", {
        method: "POST",
        body: JSON.stringify(toServerTopicPayload(payload)),
      }),
    );
  },
  async updateTopic(id, payload) {
    return normalizeTopicForAdmin(
      await requestJson<ServerTopicEnvelope>(
        baseUrl,
        `/topics/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(toServerTopicPayload(payload)),
        },
      ),
    );
  },
  async deleteTopic(id) {
    await requestJson<void>(baseUrl, `/topics/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  async createBrand(payload) {
    return normalizeBrandForAdmin(
      await requestJson<ServerBrandEnvelope>(baseUrl, "/brands", {
        method: "POST",
        body: JSON.stringify(toServerBrandPayload(payload)),
      }),
    );
  },
  async updateBrand(id, payload) {
    return normalizeBrandForAdmin(
      await requestJson<ServerBrandEnvelope>(
        baseUrl,
        `/brands/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(toServerBrandPayload(payload)),
        },
      ),
    );
  },
  async deleteBrand(id) {
    await requestJson<void>(baseUrl, `/brands/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  async createPhoto(payload) {
    return normalizePhotoForAdmin(
      await requestJson<ServerPhotoEnvelope>(baseUrl, "/photos", {
        method: "POST",
        body: JSON.stringify(toServerPayload(payload)),
      }),
    );
  },
  async updatePhoto(id, payload) {
    return normalizePhotoForAdmin(
      await requestJson<ServerPhotoEnvelope>(
        baseUrl,
        `/photos/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(toServerPayload(payload)),
        },
      ),
    );
  },
  async deletePhoto(id) {
    await requestJson<void>(baseUrl, `/photos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  async batchDelete(ids) {
    await requestJson<void>(baseUrl, "/photos/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
  async exportGallery() {
    const result = await requestJson<ServerExportEnvelope>(
      baseUrl,
      "/export/client",
      { method: "POST" },
    );
    return "export" in result ? result.export : result;
  },
  async uploadPhoto(preview, photoId) {
    const body = new FormData();
    body.append("file", preview.file);
    if (photoId) body.append("photoId", photoId);
    if (preview.title.trim()) body.append("title", preview.title.trim());
    if (preview.description.trim()) {
      body.append("description", preview.description.trim());
    }
    const topicIds = topicIdsFromPreview(preview);
    if (topicIds[0]) body.append("topicId", topicIds[0]);
    if (topicIds.length) body.append("topicIds", JSON.stringify(topicIds));
    body.append("exif", JSON.stringify(preview.exif));

    const result = await requestJson<ServerUploadResult>(baseUrl, "/uploads", {
      method: "POST",
      body,
    });
    return {
      ...result,
      exif: normalizeExifForAdmin(result.exif),
      photo: result.photo
        ? normalizePhotoForAdmin(result.photo)
        : result.photos?.[0]
          ? normalizePhotoForAdmin(result.photos[0])
          : undefined,
    };
  },
  async uploadPhotos(previews) {
    const body = new FormData();
    for (const preview of previews) {
      body.append("files", preview.file);
    }
    body.append("items", JSON.stringify(previews.map(toBulkUploadItem)));

    const result = await requestBulkUploadJson(baseUrl, "/uploads/bulk", {
      method: "POST",
      body,
    });
    return {
      photos: (result.photos ?? []).map(normalizePhotoForAdmin),
      failed: result.failed ?? [],
      export: result.export,
    };
  },
});
