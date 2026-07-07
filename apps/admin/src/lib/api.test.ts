import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api";
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
    const fetchMock = vi.fn(async () => jsonResponse({ photos: [photo] }, 201));
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
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => " stored-token "),
      },
    });
    const fetchMock = vi.fn(async () => jsonResponse({ photos: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient("http://api.test/api").listPhotos();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer stored-token");
  });
});
