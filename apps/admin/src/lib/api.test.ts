import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createApiClient,
  normalizePhotoForAdmin,
  normalizeTopicForAdmin,
} from "./api";
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

  it("lists topics from the authenticated Admin topics endpoint", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " topic-token ");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({
        topics: [
          {
            id: "editorial",
            title: "编辑精选",
            description: "Homepage curation",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient("http://api.test/api").listTopics();

    expect(result).toEqual([
      {
        id: "editorial",
        title: "编辑精选",
        description: "Homepage curation",
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/topics");
    expect(init?.method).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer topic-token");
  });

  it("creates, updates, and deletes topics through Admin CRUD endpoints", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") return jsonResponse(undefined, 204);
      if (url.endsWith("/topics")) {
        return jsonResponse(
          {
            topic: {
              id: "street",
              title: "街头",
              description: "Street frames",
            },
          },
          201,
        );
      }
      return jsonResponse({
        topic: {
          id: "topic/one",
          title: "专题一",
          description: "Updated description",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://api.test/api");

    const created = await client.createTopic({
      id: " street ",
      title: " 街头 ",
      description: " Street frames ",
    });
    const updated = await client.updateTopic("topic/one", {
      title: "专题一",
      description: "Updated description",
    });
    await client.deleteTopic("old topic");

    expect(created.title).toBe("街头");
    expect(updated.description).toBe("Updated description");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [createUrl, createInit] = fetchMock.mock.calls[0] ?? [];
    expect(createUrl).toBe("http://api.test/api/topics");
    expect(createInit?.method).toBe("POST");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      id: "street",
      title: "街头",
      description: "Street frames",
    });

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] ?? [];
    expect(updateUrl).toBe("http://api.test/api/topics/topic%2Fone");
    expect(updateInit?.method).toBe("PATCH");
    expect(JSON.parse(String(updateInit?.body))).toEqual({
      title: "专题一",
      description: "Updated description",
    });

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[2] ?? [];
    expect(deleteUrl).toBe("http://api.test/api/topics/old%20topic");
    expect(deleteInit?.method).toBe("DELETE");
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

  it("normalizes topic envelopes for Admin topic forms", () => {
    expect(
      normalizeTopicForAdmin({
        topic: {
          id: " editorial ",
          title: " 编辑精选 ",
          description: " Homepage curation ",
        },
      }),
    ).toEqual({
      id: "editorial",
      title: "编辑精选",
      description: "Homepage curation",
    });
  });
});
