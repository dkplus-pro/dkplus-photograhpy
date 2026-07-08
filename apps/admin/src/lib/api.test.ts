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

function makePreview(exif: UploadPreview["exif"] = {}): UploadPreview {
  return {
    id: "preview-1",
    file: new File(["jpeg"], "frame.jpg", { type: "image/jpeg" }),
    previewUrl: "blob:preview-1",
    title: "Uploaded frame",
    topicId: "",
    description: "",
    exif,
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
    const preview = makePreview({
      cameraMake: "Canon",
      cameraModel: "R5",
      lens: "RF 50mm",
    });
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({ photos: [photo] }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient("http://api.test/api").uploadPhoto(preview);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/uploads");
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get("title")).toBe("Uploaded frame");
    expect(JSON.parse(String(body.get("exif")))).toEqual(preview.exif);

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("content-type")).toBeNull();
  });

  it("normalizes EXIF aliases on uploaded photo responses", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(
        {
          exif: {
            cameraBrand: "Nikon",
            cameraModel: "Z 8",
            lensModel: "Nikkor Z 50mm",
            shutterSpeed: "1/160",
          },
          photos: [
            {
              ...photo,
              exif: {
                cameraBrand: "Canon",
                cameraModel: "R5",
                lensModel: "RF 50mm",
              },
            },
          ],
        },
        201,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient("http://api.test/api").uploadPhoto(
      makePreview(),
    );

    expect(result.photo?.exif?.cameraMake).toBe("Canon");
    expect(result.photo?.exif?.cameraModel).toBe("R5");
    expect(result.photo?.exif?.lens).toBe("RF 50mm");
    expect(result.exif?.cameraMake).toBe("Nikon");
    expect(result.exif?.lens).toBe("Nikkor Z 50mm");
    expect(result.exif?.shutter).toBe("1/160");
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

  it("reads and mutates persisted topics through the Admin API", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " topic-token ");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/topics") && !init?.method) {
        return jsonResponse({ topics: [{ id: "editorial", title: "编辑精选" }] });
      }
      if (url.endsWith("/topics") && init?.method === "POST") {
        return jsonResponse(
          {
            topic: {
              id: "travel",
              title: "旅行专题",
              description: "旅拍合集",
            },
          },
          201,
        );
      }
      if (url.endsWith("/topics/travel") && init?.method === "PATCH") {
        return jsonResponse({
          topic: {
            id: "travel",
            title: "旅行专题更新",
            description: "更新说明",
          },
        });
      }
      return jsonResponse(undefined, 204);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://api.test/api");

    await expect(client.listTopics()).resolves.toEqual([
      { id: "editorial", title: "编辑精选" },
    ]);
    await expect(
      client.createTopic({
        id: " travel ",
        title: " 旅行专题 ",
        description: " 旅拍合集 ",
      }),
    ).resolves.toMatchObject({ id: "travel", title: "旅行专题" });
    await expect(
      client.updateTopic("travel", {
        title: "旅行专题更新",
        description: "更新说明",
      }),
    ).resolves.toMatchObject({ id: "travel", title: "旅行专题更新" });
    await expect(client.deleteTopic("travel")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://api.test/api/topics",
      "http://api.test/api/topics",
      "http://api.test/api/topics/travel",
      "http://api.test/api/topics/travel",
    ]);
    const createBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as Record<string, string>;
    expect(createBody).toEqual({
      id: "travel",
      title: "旅行专题",
      description: "旅拍合集",
    });
    const headers = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer topic-token");
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
