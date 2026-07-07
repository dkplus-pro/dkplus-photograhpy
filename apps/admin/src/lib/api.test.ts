import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient, normalizePhotoForAdmin } from "./api";
import type { UploadPreview } from "../types";

const photo = {
  id: "photo-1",
  title: "Uploaded frame",
  imageUrl: "/uploads/frame.jpg",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 201 ? "Created" : "OK",
    json: async () => body,
  } as Response;
}

function makePreview(): UploadPreview {
  return {
    id: "preview-1",
    file: new File(["jpeg"], "frame.jpg", { type: "image/jpeg" }),
    previewUrl: "blob:preview-1",
    title: "Uploaded frame",
    topicId: "",
    description: "",
    exif: {},
  };
}

describe("admin API client auth headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the VITE_ADMIN_TOKEN bearer header for multipart uploads", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " test-token ");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({ photos: [photo] }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient("http://api.test/api").uploadPhoto(makePreview());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/uploads");
    expect(init?.body).toBeInstanceOf(FormData);

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("content-type")).toBeNull();
  });

  it("falls back to the local admin token storage key", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", "");
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => " stored-token "),
      },
    });
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({ photos: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient("http://api.test/api").listPhotos();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer stored-token");
  });

  it("posts the authenticated export-to-client action", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " export-token ");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({
        export: {
          exportFile: "/tmp/photos.json",
          generatedAt: "2026-07-07T00:00:00.000Z",
          photoCount: 2,
          topicCount: 1,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient("http://api.test/api").exportGallery();

    expect(result.photoCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/export/client");
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer export-token");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("normalizes server photo assets and EXIF aliases for admin filters", () => {
    const normalized = normalizePhotoForAdmin({
      id: "photo-server",
      title: "Server frame",
      topicIds: ["editorial"],
      imageUrl: "",
      asset: {
        original: "photo-original.jpg",
        thumbnail: "photo-thumb.jpg",
      },
      exif: {
        cameraBrand: "Canon",
        cameraModel: "R5",
        lensModel: "RF 50mm",
        shutterSpeed: "1/250",
        focalLengthMm: 50,
      },
    });

    expect(normalized.topicId).toBe("editorial");
    expect(normalized.imageUrl).toBe(
      "https://images.unsplash.com/photo-original.jpg",
    );
    expect(normalized.thumbnailUrl).toBe(
      "https://images.unsplash.com/photo-thumb.jpg",
    );
    expect(normalized.exif?.cameraMake).toBe("Canon");
    expect(normalized.exif?.cameraModel).toBe("R5");
    expect(normalized.exif?.lens).toBe("RF 50mm");
    expect(normalized.exif?.shutter).toBe("1/250");
    expect(normalized.exif?.focalLength).toBe("50mm");
  });
});
