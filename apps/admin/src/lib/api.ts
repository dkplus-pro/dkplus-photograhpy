import type { PhotoPayload, PhotoRecord, UploadPreview } from '../types';

export interface UploadResult {
  photo?: PhotoRecord;
  url?: string;
  exif?: PhotoRecord['exif'];
}

export interface ApiClient {
  listPhotos: () => Promise<PhotoRecord[]>;
  createPhoto: (payload: PhotoPayload) => Promise<PhotoRecord>;
  updatePhoto: (id: string, payload: PhotoPayload) => Promise<PhotoRecord>;
  deletePhoto: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  uploadPhoto: (preview: UploadPreview) => Promise<UploadResult>;
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, '');

const requestJson = async <T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // Keep HTTP status fallback.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const unwrapPhotos = (value: PhotoRecord[] | { photos?: PhotoRecord[]; data?: PhotoRecord[] }): PhotoRecord[] => {
  if (Array.isArray(value)) return value;
  return value.photos ?? value.data ?? [];
};

export const createApiClient = (baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'): ApiClient => ({
  async listPhotos() {
    return unwrapPhotos(await requestJson<PhotoRecord[] | { photos?: PhotoRecord[]; data?: PhotoRecord[] }>(baseUrl, '/photos'));
  },
  async createPhoto(payload) {
    return requestJson<PhotoRecord>(baseUrl, '/photos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async updatePhoto(id, payload) {
    return requestJson<PhotoRecord>(baseUrl, `/photos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  async deletePhoto(id) {
    await requestJson<void>(baseUrl, `/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async batchDelete(ids) {
    await requestJson<void>(baseUrl, '/photos/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },
  async uploadPhoto(preview) {
    const body = new FormData();
    body.append('file', preview.file);
    body.append('title', preview.title);
    body.append('description', preview.description);
    body.append('topicId', preview.topicId);
    body.append('exif', JSON.stringify(preview.exif));

    return requestJson<UploadResult>(baseUrl, '/uploads', {
      method: 'POST',
      body,
    });
  },
});
