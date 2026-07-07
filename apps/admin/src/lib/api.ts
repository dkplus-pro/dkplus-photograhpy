import type {
  PhotoExif,
  PhotoPayload,
  PhotoRecord,
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

export interface ApiClient {
  listPhotos: () => Promise<PhotoRecord[]>;
  createPhoto: (payload: PhotoPayload) => Promise<PhotoRecord>;
  updatePhoto: (id: string, payload: PhotoPayload) => Promise<PhotoRecord>;
  deletePhoto: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  exportGallery: () => Promise<ExportResult>;
  uploadPhoto: (
    preview: UploadPreview,
    photoId?: string,
  ) => Promise<UploadResult>;
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
  exif?: PhotoExif & {
    cameraBrand?: string;
    cameraModel?: string;
    lensModel?: string;
    shutterSpeed?: string;
    focalLengthMm?: number;
  };
};

type ServerPhotoEnvelope = ServerPhoto | { photo: ServerPhoto };
type ServerExportEnvelope = ExportResult | { export: ExportResult };

const isAbsoluteUrl = (value: string): boolean =>
  /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");

const resolveDisplayUrl = (value?: string): string | undefined => {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (isAbsoluteUrl(raw) || raw.startsWith("/")) return raw;
  return `https://images.unsplash.com/${raw.replace(/^\/+/, "")}`;
};

const toServerPayload = (payload: PhotoPayload) => ({
  title: payload.title,
  description: payload.description,
  topicId: payload.topicId,
  image: payload.imageUrl
    ? {
        url: payload.imageUrl,
        storage: "remote",
      }
    : undefined,
  exif: payload.exif,
});

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
    topicId: source.topicId ?? source.topicIds?.[0],
    imageUrl: imageUrl ?? "",
    thumbnailUrl,
    exif: source.exif
      ? {
          ...source.exif,
          cameraMake: source.exif.cameraMake ?? source.exif.cameraBrand,
          lens: source.exif.lens ?? source.exif.lensModel,
          shutter: source.exif.shutter ?? source.exif.shutterSpeed,
          focalLength:
            source.exif.focalLength ??
            (source.exif.focalLengthMm
              ? `${source.exif.focalLengthMm}mm`
              : undefined),
        }
      : undefined,
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

const unwrapPhotos = (
  value: ServerPhoto[] | { photos?: ServerPhoto[]; data?: ServerPhoto[] },
): PhotoRecord[] => {
  if (Array.isArray(value)) return value.map(normalizePhotoForAdmin);
  return (value.photos ?? value.data ?? []).map(normalizePhotoForAdmin);
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
    if (preview.topicId.trim()) body.append("topicId", preview.topicId.trim());
    body.append("exif", JSON.stringify(preview.exif));

    const result = await requestJson<UploadResult & { photos?: ServerPhoto[] }>(
      baseUrl,
      "/uploads",
      {
        method: "POST",
        body,
      },
    );
    return {
      ...result,
      photo: result.photo
        ? normalizePhotoForAdmin(result.photo)
        : result.photos?.[0]
          ? normalizePhotoForAdmin(result.photos[0])
          : undefined,
    };
  },
});
