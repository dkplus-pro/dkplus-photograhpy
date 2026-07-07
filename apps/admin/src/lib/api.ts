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

export interface ApiClient {
  listPhotos: () => Promise<PhotoRecord[]>;
  createPhoto: (payload: PhotoPayload) => Promise<PhotoRecord>;
  updatePhoto: (id: string, payload: PhotoPayload) => Promise<PhotoRecord>;
  deletePhoto: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  uploadPhoto: (preview: UploadPreview) => Promise<UploadResult>;
}

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/$/, "");

type ServerPhoto = PhotoRecord & {
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

const normalizePhoto = (input: ServerPhotoEnvelope): PhotoRecord => {
  const source = "photo" in input ? input.photo : input;
  return {
    ...source,
    topicId: source.topicId ?? source.topicIds?.[0],
    imageUrl: source.imageUrl ?? source.image?.url ?? "",
    thumbnailUrl: source.thumbnailUrl ?? source.image?.url,
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
    headers: {
      Accept: "application/json",
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      message = body.error ?? body.message ?? message;
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
  if (Array.isArray(value)) return value.map(normalizePhoto);
  return (value.photos ?? value.data ?? []).map(normalizePhoto);
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
    return normalizePhoto(
      await requestJson<ServerPhotoEnvelope>(baseUrl, "/photos", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  },
  async updatePhoto(id, payload) {
    return normalizePhoto(
      await requestJson<ServerPhotoEnvelope>(
        baseUrl,
        `/photos/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
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
  async uploadPhoto(preview) {
    const body = new FormData();
    body.append("file", preview.file);
    body.append("title", preview.title);
    body.append("description", preview.description);
    body.append("topicId", preview.topicId);
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
        ? normalizePhoto(result.photo)
        : result.photos?.[0]
          ? normalizePhoto(result.photos[0])
          : undefined,
    };
  },
});
