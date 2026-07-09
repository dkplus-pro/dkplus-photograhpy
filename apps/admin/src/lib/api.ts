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
  createBrand: (payload: BrandPayload) => Promise<BrandRecord>;
  updateBrand: (id: string, payload: BrandPayload) => Promise<BrandRecord>;
  deleteBrand: (id: string) => Promise<void>;
  uploadBrandLogos: (id: string, files: File[]) => Promise<BrandRecord>;
  addBrandLogo: (id: string, logo: BrandLogoRecord) => Promise<BrandRecord>;
  createTopic: (payload: TopicPayload) => Promise<TopicRecord>;
  updateTopic: (id: string, payload: TopicPayload) => Promise<TopicRecord>;
  deleteTopic: (id: string) => Promise<void>;
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
type ServerBrandLogo = BrandLogoRecord | string;
type ServerBrand = Omit<BrandRecord, "logos"> & {
  brand?: string;
  cameraMake?: string;
  logoUrl?: string;
  logos?: ServerBrandLogo[];
  logoUrls?: string[];
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
  uploads?: ServerBrandLogo[];
  files?: ServerBrandLogo[];
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
    .map((logo) => {
      const url = logo.url.trim();
      const alt = (logo.alt ?? logo.label)?.trim() || undefined;
      return {
        url,
        key: logo.key?.trim() || undefined,
        fileName: logo.fileName?.trim() || undefined,
        mimeType: logo.mimeType?.trim() || undefined,
        size: logo.size,
        storage: logo.storage,
        alt,
      };
    })
    .filter((logo) => Boolean(logo.url));

const uploadedLogosFromResult = (
  result: Pick<ServerUploadResult, "uploads" | "files">,
): BrandLogoRecord[] => normalizeBrandLogos(result.uploads ?? result.files);

const toServerBrandPayload = (payload: BrandPayload) => {
  const logos = cleanBrandLogos(payload.logos);
  return {
    id: payload.id?.trim() || undefined,
    name: payload.name.trim(),
    title: payload.title?.trim() || payload.name.trim(),
    aliases: payload.aliases
      ?.map((alias) => alias.trim())
      .filter((alias) => Boolean(alias)),
    logos,
    logoUrls:
      payload.logoUrls
        ?.map((url) => url.trim())
        .filter((url) => Boolean(url)) ?? logos.map((logo) => logo.url),
  };
};

const appendBrandLogosViaBrandUpdate = async (
  baseUrl: string,
  id: string,
  logos: BrandLogoRecord[],
): Promise<BrandRecord> => {
  const newLogos = cleanBrandLogos(logos);
  if (!newLogos.length) throw new Error("Logo URL is required");

  const path = `/brands/${encodeURIComponent(id)}`;
  const current = normalizeBrandForAdmin(
    await requestJson<ServerBrandEnvelope>(baseUrl, path),
  );
  const mergedLogos = cleanBrandLogos([...current.logos, ...newLogos]);

  return normalizeBrandForAdmin(
    await requestJson<ServerBrandEnvelope>(baseUrl, path, {
      method: "PATCH",
      body: JSON.stringify(
        toServerBrandPayload({
          name: current.name,
          title: current.title ?? current.name,
          aliases: current.aliases ?? [],
          logos: mergedLogos,
          logoUrls: mergedLogos.map((logo) => logo.url),
        }),
      ),
    }),
  );
};

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
  return ascii || encodeURIComponent(name.trim()).toLowerCase();
};

const normalizeBrandLogos = (
  source?: ServerBrandLogo[] | string,
): BrandLogoRecord[] => {
  const entries = Array.isArray(source) ? source : source ? [source] : [];
  return entries
    .map((entry, index): BrandLogoRecord | undefined => {
      if (typeof entry === "string") {
        const url = entry.trim();
        return url ? { id: `logo-${index + 1}`, url } : undefined;
      }
      const url = entry.url?.trim();
      if (!url) return undefined;
      const label = (entry.label ?? entry.alt)?.trim() || undefined;
      const alt = entry.alt?.trim() || label;
      return {
        ...entry,
        id: entry.id ?? entry.key ?? `logo-${index + 1}`,
        url,
        ...(label ? { label } : {}),
        ...(alt ? { alt } : {}),
      };
    })
    .filter((logo): logo is BrandLogoRecord => Boolean(logo));
};

export const normalizeBrandForAdmin = (
  input: ServerBrandEnvelope,
): BrandRecord => {
  const source: ServerBrand =
    "brand" in input && typeof input.brand === "object" && input.brand
      ? input.brand
      : (input as ServerBrand);
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
  const sourceLogoUrls = (source.logoUrls ?? [])
    .map((url) => url.trim())
    .filter((url) => Boolean(url));
  const logoSource =
    source.logos ??
    (sourceLogoUrls.length ? sourceLogoUrls : source.logoUrl) ??
    undefined;
  const logos = normalizeBrandLogos(logoSource);
  const logoUrls = source.logoUrls?.map((url) => url.trim()).filter(Boolean);
  return {
    ...source,
    id: (source.id || brandIdFromName(name)).trim(),
    name,
    title,
    logos,
    logoUrls: logoUrls?.length ? logoUrls : logos.map((logo) => logo.url),
    aliases: (source.aliases ?? [])
      .map((alias) => alias.trim())
      .filter((alias) => Boolean(alias)),
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
  async uploadBrandLogos(id, files) {
    const body = new FormData();
    for (const file of files) body.append("files", file);
    body.append("mode", "asset");
    body.append("purpose", "brand-logo");

    const result = await requestJson<ServerUploadResult>(baseUrl, "/uploads", {
      method: "POST",
      body,
    });
    const uploadedLogos = uploadedLogosFromResult(result);
    if (!uploadedLogos.length) {
      throw new Error("Upload did not return any logo files");
    }

    return appendBrandLogosViaBrandUpdate(baseUrl, id, uploadedLogos);
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
  async addBrandLogo(id, logo) {
    return appendBrandLogosViaBrandUpdate(baseUrl, id, [logo]);
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
