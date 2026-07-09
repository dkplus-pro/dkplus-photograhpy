import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createApiClient,
  normalizeBrandForAdmin,
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
    topicIds: [],
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

  it("uploads staged files through the authenticated bulk endpoint", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " bulk-token ");
    const previews: UploadPreview[] = [
      makePreview({
        cameraMake: "Canon",
        cameraModel: "R5",
      }),
      {
        ...makePreview({
          cameraMake: "Sony",
          cameraModel: "A7R V",
        }),
        id: "preview-2",
        file: new File(["jpeg"], "street-frame.jpg", {
          type: "image/jpeg",
        }),
        previewUrl: "blob:preview-2",
        title: " Street frame ",
        topicId: "street",
        topicIds: ["street", "editorial"],
        description: " Second bulk upload ",
      },
    ];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(
        {
          photos: [
            photo,
            {
              id: "photo-2",
              title: "Street frame",
              image: { url: "/uploads/street-frame.jpg" },
              topicId: "street",
              exif: {
                cameraBrand: "Sony",
                cameraModel: "A7R V",
              },
            },
          ],
          failed: [],
          export: {
            exportFile: "/tmp/photos.json",
            generatedAt: "2026-07-08T00:00:00.000Z",
            photoCount: 2,
            topicCount: 1,
          },
        },
        201,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient("http://api.test/api").uploadPhotos(
      previews,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/uploads/bulk");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.getAll("files")).toHaveLength(2);
    expect(body.get("file")).toBeNull();
    expect(JSON.parse(String(body.get("items")))).toEqual([
      {
        title: "Uploaded frame",
        exif: previews[0]?.exif,
      },
      {
        title: "Street frame",
        description: "Second bulk upload",
        topicId: "street",
        topicIds: ["street", "editorial"],
        exif: previews[1]?.exif,
      },
    ]);

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer bulk-token");
    expect(headers.get("content-type")).toBeNull();
    expect(result.photos).toHaveLength(2);
    expect(result.photos[1]?.imageUrl).toBe("/uploads/street-frame.jpg");
    expect(result.photos[1]?.exif?.cameraMake).toBe("Sony");
    expect(result.failed).toEqual([]);
    expect(result.export?.photoCount).toBe(2);
  });

  it("returns structured bulk failures from total-failure responses", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(
        {
          photos: [],
          failed: [
            {
              index: 0,
              fileName: "frame.txt",
              code: "UPLOAD_UNSUPPORTED_TYPE",
              message: "Only image uploads are supported",
            },
          ],
        },
        400,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient("http://api.test/api").uploadPhotos([
      makePreview(),
    ]);

    expect(result.photos).toEqual([]);
    expect(result.failed).toEqual([
      {
        index: 0,
        fileName: "frame.txt",
        code: "UPLOAD_UNSUPPORTED_TYPE",
        message: "Only image uploads are supported",
      },
    ]);
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
      if (url.endsWith("/topics") && !init?.method) {
        return jsonResponse({
          topics: [{ id: "editorial", title: "编辑精选" }],
        });
      }
      if (url.endsWith("/topics") && init?.method === "POST") {
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

  it("lists, creates, updates, deletes, and uploads logos for camera brands", async () => {
    vi.stubEnv("VITE_ADMIN_TOKEN", " brand-token ");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/brands") && !init?.method) {
        return jsonResponse({
          brands: [
            {
              id: "canon",
              name: " Canon ",
              title: " Canon / 佳能 ",
              aliases: [" 佳能 "],
              logos: [
                {
                  url: " /uploads/brands/canon.svg ",
                  alt: " 白标 ",
                },
              ],
              photoCount: 3,
            },
          ],
        });
      }
      if (url.endsWith("/brands") && init?.method === "POST") {
        return jsonResponse(
          {
            brand: {
              id: "sony",
              name: "Sony",
              title: "Sony / 索尼",
              aliases: ["Sony Corporation"],
              logos: [{ url: "/logos/sony.svg", alt: "White" }],
              logoUrls: ["/logos/sony.svg"],
            },
          },
          201,
        );
      }
      if (url.endsWith("/brands/sony") && !init?.method) {
        return jsonResponse({
          brand: {
            id: "sony",
            name: "Sony",
            title: "Sony Alpha",
            aliases: ["索尼"],
            logos: [{ url: "/logos/sony-white.svg", alt: "White" }],
            logoUrls: ["/logos/sony-white.svg"],
          },
        });
      }
      if (url.endsWith("/brands/sony") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        if (payload.logoUrls?.includes("/uploads/brand-logo.png")) {
          return jsonResponse({
            brand: {
              id: "sony",
              name: "Sony",
              title: "Sony Alpha",
              aliases: ["索尼"],
              logos: [
                { url: "/logos/sony-white.svg", alt: "White" },
                { url: "/logos/sony-black.svg", alt: "Black" },
                {
                  url: "/uploads/brand-logo.png",
                  fileName: "brand-logo.png",
                  alt: "brand-logo.png",
                },
              ],
              logoUrls: [
                "/logos/sony-white.svg",
                "/logos/sony-black.svg",
                "/uploads/brand-logo.png",
              ],
            },
          });
        }
        return jsonResponse({
          brand: {
            id: "sony",
            name: "Sony",
            title: "Sony Alpha",
            aliases: ["索尼"],
            logos: [
              { url: "/logos/sony-white.svg", alt: "White" },
              { url: "/logos/sony-black.svg", alt: "Black" },
            ],
            logoUrls: ["/logos/sony-white.svg", "/logos/sony-black.svg"],
          },
        });
      }
      if (url.endsWith("/uploads") && init?.method === "POST") {
        return jsonResponse(
          {
            uploads: [
              {
                url: "/uploads/brand-logo.png",
                fileName: "brand-logo.png",
                mimeType: "image/png",
                storage: "local",
                alt: "brand-logo.png",
              },
            ],
          },
          201,
        );
      }
      if (url.endsWith("/brands/sony") && !init?.method) {
        return jsonResponse(
          {
            brand: {
              id: "sony",
              name: "Sony",
              title: "Sony Alpha",
              aliases: ["索尼"],
              logos: [
                { url: "/logos/sony-white.svg", alt: "White" },
                { url: "/logos/sony-black.svg", alt: "Black" },
              ],
              logoUrls: ["/logos/sony-white.svg", "/logos/sony-black.svg"],
            },
          },
        );
      }
      return jsonResponse(undefined, 204);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://api.test/api");

    const listed = await client.listBrands();
    const created = await client.createBrand({
      id: " sony ",
      name: " Sony ",
      title: " Sony / 索尼 ",
      aliases: [" Sony Corporation "],
      logos: [
        {
          url: " /logos/sony.svg ",
          label: " White ",
        },
      ],
      logoUrls: [" /logos/sony.svg "],
    });
    const updated = await client.updateBrand("sony", {
      name: "Sony",
      title: " Sony Alpha ",
      aliases: [" 索尼 "],
      logos: [
        { url: " /logos/sony-white.svg ", label: " White " },
        { url: " /logos/sony-black.svg ", alt: " Black " },
      ],
      logoUrls: [],
    });
    const logoResult = await client.uploadBrandLogos("sony", [
      new File(["jpeg"], "sony-logo.jpg", { type: "image/jpeg" }),
      new File(["png"], "sony-logo-dark.png", { type: "image/png" }),
    ]);
    await client.deleteBrand("old brand");

    expect(listed[0]?.name).toBe("Canon");
    expect(listed[0]?.logoUrls).toEqual(["/uploads/brands/canon.svg"]);
    expect(created.aliases).toEqual(["Sony Corporation"]);
    expect(updated.title).toBe("Sony Alpha");
    expect(logoResult.logoUrls).toEqual([
      "/logos/sony-white.svg",
      "/logos/sony-black.svg",
      "/uploads/brand-logo.png",
      "/uploads/brand-logo-dark.png",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(7);

    const [listUrl] = fetchMock.mock.calls[0] ?? [];
    expect(listUrl).toBe("http://api.test/api/brands");

    const [createUrl, createInit] = fetchMock.mock.calls[1] ?? [];
    expect(createUrl).toBe("http://api.test/api/brands");
    expect(createInit?.method).toBe("POST");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      id: "sony",
      name: "Sony",
      title: "Sony / 索尼",
      aliases: ["Sony Corporation"],
      logos: [{ url: "/logos/sony.svg", alt: "White" }],
      logoUrls: ["/logos/sony.svg"],
    });

    const [updateUrl, updateInit] = fetchMock.mock.calls[2] ?? [];
    expect(updateUrl).toBe("http://api.test/api/brands/sony");
    expect(updateInit?.method).toBe("PATCH");
    expect(JSON.parse(String(updateInit?.body))).toEqual({
      name: "Sony",
      title: "Sony Alpha",
      aliases: ["索尼"],
      logos: [
        { url: "/logos/sony-white.svg", alt: "White" },
        { url: "/logos/sony-black.svg", alt: "Black" },
      ],
      logoUrls: [],
    });

    const [assetUploadUrl, assetUploadInit] = fetchMock.mock.calls[3] ?? [];
    expect(assetUploadUrl).toBe("http://api.test/api/uploads/assets");
    expect(assetUploadInit?.method).toBe("POST");
    expect(assetUploadInit?.body).toBeInstanceOf(FormData);
    expect((assetUploadInit?.body as FormData).getAll("files")).toHaveLength(2);

    const [readBrandUrl, readBrandInit] = fetchMock.mock.calls[4] ?? [];
    expect(readBrandUrl).toBe("http://api.test/api/brands/sony");
    expect(readBrandInit?.method).toBeUndefined();

    const [brandPatchUrl, brandPatchInit] = fetchMock.mock.calls[5] ?? [];
    expect(brandPatchUrl).toBe("http://api.test/api/brands/sony");
    expect(brandPatchInit?.method).toBe("PATCH");
    expect(JSON.parse(String(brandPatchInit?.body))).toMatchObject({
      name: "Sony",
      title: "Sony Alpha",
      aliases: ["索尼"],
      logoUrls: [
        "/logos/sony-white.svg",
        "/logos/sony-black.svg",
        "/uploads/brand-logo.png",
      ],
    });

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[6] ?? [];
    expect(deleteUrl).toBe("http://api.test/api/brands/old%20brand");
    expect(deleteInit?.method).toBe("DELETE");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/logos")))
      .toBe(false);
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

  it("normalizes brand envelopes and logo URL aliases for Admin brand forms", () => {
    expect(
      normalizeBrandForAdmin({
        brand: {
          id: " sony ",
          name: " Sony ",
          displayName: " Sony / 索尼 ",
          logoUrls: [" /uploads/brands/sony.svg "],
          photoCount: 2,
        },
      }),
    ).toMatchObject({
      id: "sony",
      name: "Sony",
      title: "Sony / 索尼",
      logos: [{ url: "/uploads/brands/sony.svg" }],
      logoUrls: ["/uploads/brands/sony.svg"],
      aliases: [],
      photoCount: 2,
      displayName: " Sony / 索尼 ",
    });
  });

  it("normalizes brand envelopes with logoUrls derived from logos", () => {
    expect(
      normalizeBrandForAdmin({
        brand: {
          id: " sony ",
          name: " Sony ",
          aliases: [],
          logos: [{ url: "/logos/sony.svg", alt: "Sony mark" }],
          logoUrls: [],
        },
      }),
    ).toMatchObject({
      id: "sony",
      name: "Sony",
      aliases: [],
      logos: [{ url: "/logos/sony.svg", label: "Sony mark" }],
      logoUrls: ["/logos/sony.svg"],
    });
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
