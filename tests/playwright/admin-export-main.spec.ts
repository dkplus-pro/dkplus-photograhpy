import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";

const repoRoot = process.cwd();
const adminToken = "playwright-export-token";
const seedPhotoCount = 40;

test.describe.configure({ mode: "serial" });

type ManagedProcess = {
  name: string;
  process: ChildProcessWithoutNullStreams;
  logs: string[];
};

let root = "";
let exportFile = "";
let serverBaseUrl = "";
let adminBaseUrl = "";
let mainBaseUrl = "";
const processes: ManagedProcess[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        reject(new Error("Could not allocate a local port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function spawnProcess(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): ManagedProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const managed: ManagedProcess = { name, process: child, logs: [] };
  const capture = (chunk: Buffer) => {
    managed.logs.push(chunk.toString("utf8"));
    if (managed.logs.length > 80) managed.logs.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  processes.push(managed);
  return managed;
}

async function waitForHttp(url: string, name: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const processLogs = processes
    .filter((entry) => entry.name === name)
    .flatMap((entry) => entry.logs)
    .join("");
  throw new Error(
    `Timed out waiting for ${name} at ${url}. Last error: ${String(lastError)}\n${processLogs}`,
  );
}

const forbiddenClientKeys = [
  "createdAt",
  "updatedAt",
  "image",
  "imageUrl",
  "thumbnailUrl",
  "topicId",
  "topicTitle",
  "tags",
];

function expectNoClientInternals(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      expectNoClientInternals(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of forbiddenClientKeys) {
    expect(record, `${path} exposes ${key}`).not.toHaveProperty(key);
  }
  for (const [key, entry] of Object.entries(record)) {
    expectNoClientInternals(entry, `${path}.${key}`);
  }
}

async function writeSeedGallery(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const svg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23222222'/%3E%3C/svg%3E";
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        generatedAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T01:00:00.000Z",
        topics: [
          {
            id: "editorial",
            title: "编辑精选",
            description: "Playwright seed topic",
            slug: "editorial",
            sortOrder: 1,
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z",
          },
        ],
        photos: Array.from({ length: seedPhotoCount }, (_, index) => {
          const title =
            index === 0 ? "后台导出样片" : `后台导出样片 ${index + 1}`;
          const takenAt = new Date(
            Date.UTC(2026, 6, 7, 8, 0, 0) - index * 24 * 60 * 60 * 1000,
          ).toISOString();
          return {
            id: index === 0 ? "admin-seed-photo" : `admin-seed-photo-${index}`,
            title,
            description: "Seeded from JSON into SQLite",
            topicId: "editorial",
            topicTitle: "编辑精选",
            topicIds: ["editorial"],
            tags: ["playwright-seed"],
            takenAt,
            createdAt: takenAt,
            updatedAt: "2026-07-07T09:00:00.000Z",
            imageUrl: svg,
            thumbnailUrl: svg,
            image: {
              url: svg,
              key: `internal/seed-${index}.svg`,
              storage: "remote",
            },
            asset: {
              original: svg,
              thumbnail: svg,
              preview: svg,
              alt: title,
              width: 800,
              height: 800,
            },
            exif: {
              cameraBrand: index % 2 ? "Fujifilm" : "Sony",
              cameraMake: index % 2 ? "Fujifilm" : "Sony",
              cameraModel: index % 2 ? "X-H2" : "A7R V",
              lens: index % 2 ? "XF 56mm F1.2 R WR" : "FE 35mm F1.4 GM",
              aperture: index % 2 ? "f/2.8" : "f/4",
              shutter: index % 2 ? "1/500s" : "1/250s",
              shutterSpeed: index % 2 ? "1/500s" : "1/250s",
              iso: index % 2 ? 400 : 100,
            },
          };
        }),
      },
      null,
      2,
    )}
`,
    "utf8",
  );
}

async function writeMainGallery(): Promise<void> {
  const galleryPath = path.join(repoRoot, "apps/main/public/data/gallery.json");
  await mkdir(path.dirname(galleryPath), { recursive: true });
  const svg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23222222'/%3E%3C/svg%3E";
  await writeFile(
    galleryPath,
    `${JSON.stringify(
      {
        generatedAt: "2026-07-07T00:00:00.000Z",
        topics: [],
        photos: Array.from({ length: seedPhotoCount }, (_, index) => ({
          id: `main-card-${index}`,
          title: `紧凑样片 ${index + 1}`,
          description: "No hover zoom smoke fixture",
          topicIds: [],
          takenAt: `2026-07-0${Math.min(index + 1, 9)}T08:00:00.000Z`,
          asset: {
            original: svg,
            thumbnail: svg,
            preview: svg,
            alt: `紧凑样片 ${index + 1}`,
            width: 800,
            height: 800,
          },
          urls: {
            original: svg,
            thumbnail: svg,
            preview: svg,
          },
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

test.beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dkplus-playwright-"));
  exportFile = path.join(root, "photos.json");
  const databaseFile = path.join(root, "gallery.sqlite");
  const uploadDir = path.join(root, "uploads");
  await writeSeedGallery(exportFile);
  await writeMainGallery();

  const serverPort = await freePort();
  const adminPort = await freePort();
  const mainPort = await freePort();
  serverBaseUrl = `http://127.0.0.1:${serverPort}`;
  adminBaseUrl = `http://127.0.0.1:${adminPort}`;
  mainBaseUrl = `http://127.0.0.1:${mainPort}`;

  spawnProcess(
    "server",
    "pnpm",
    ["--dir", "apps/server", "exec", "tsx", "src/index.ts"],
    {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(serverPort),
      ADMIN_TOKEN: adminToken,
      CORS_ORIGINS: `${adminBaseUrl},${mainBaseUrl}`,
      DATABASE_FILE: databaseFile,
      GALLERY_EXPORT_FILE: exportFile,
      UPLOAD_DIR: uploadDir,
      PUBLIC_BASE_URL: `${serverBaseUrl}/uploads`,
      COS_ENABLED: "false",
    },
  );
  await waitForHttp(`${serverBaseUrl}/health`, "server");

  spawnProcess(
    "admin",
    "pnpm",
    [
      "--dir",
      "apps/admin",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(adminPort),
      "--strictPort",
    ],
    {
      VITE_API_BASE_URL: `${serverBaseUrl}/api`,
      VITE_ADMIN_TOKEN: adminToken,
    },
  );
  await waitForHttp(adminBaseUrl, "admin");

  spawnProcess(
    "main",
    "pnpm",
    [
      "--dir",
      "apps/main",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(mainPort),
      "--strictPort",
    ],
    {
      VITE_BASE_PATH: "/",
      VITE_API_PROXY_TARGET: serverBaseUrl,
    },
  );
  await waitForHttp(mainBaseUrl, "main");
});

test.afterAll(async () => {
  for (const entry of processes.reverse()) {
    if (!entry.process.killed) {
      entry.process.kill("SIGTERM");
    }
  }
  if (root) await rm(root, { recursive: true, force: true });
});

test("Admin authenticated export action writes the Main JSON artifact", async ({
  page,
}) => {
  await page.goto(adminBaseUrl);
  await expect(page.getByRole("heading", { name: "图片管理" })).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/export/client") &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "导出到客户端" }).first().click(),
  ]);
  expect(response.ok()).toBeTruthy();

  const exported = JSON.parse(await readFile(exportFile, "utf8")) as {
    generatedAt: string;
    photos: Array<{
      id: string;
      topicIds: string[];
      asset: { original: string };
      [key: string]: unknown;
    }>;
    topics: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  expect(Object.keys(exported).sort()).toEqual([
    "generatedAt",
    "photos",
    "topics",
  ]);
  expect(exported.topics).toHaveLength(1);
  expect(exported.photos).toHaveLength(seedPhotoCount);
  expect(exported.photos[0]?.id).toBe("admin-seed-photo");
  expect(exported.photos[0]?.topicIds).toEqual(["editorial"]);
  expect(exported.photos[0]?.asset.original).toContain("data:image/svg+xml");
  expect(JSON.stringify(exported)).not.toMatch(
    /"(createdAt|updatedAt|image|imageUrl|thumbnailUrl)"\s*:/,
  );
});

test("Admin list exposes optimized metadata columns and gallery interactions", async ({
  page,
}) => {
  await page.goto(adminBaseUrl);
  await expect(page.getByPlaceholder("按标题筛选")).toBeVisible();
  await expect(page.getByLabel("按品牌筛选")).toBeVisible();
  await expect(page.getByLabel("按机型筛选")).toBeVisible();
  await expect(page.getByLabel("按专题筛选")).toBeVisible();

  const table = page.locator(".photos-table");
  await expect(table.getByRole("columnheader", { name: /型号/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /镜头/ })).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: /拍摄日期/ }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: /文件信息/ }),
  ).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: /^EXIF$/ })).toHaveCount(
    0,
  );
  await expect(page.getByText(/更新：/)).toHaveCount(0);
  await expect(
    page.getByText(`显示 1-12，共 ${seedPhotoCount} 条`),
  ).toBeVisible();
  await page.locator(".arco-pagination-item").filter({ hasText: "2" }).click();
  await expect(table.getByText("后台导出样片 13")).toBeVisible();
  await page.locator(".arco-pagination-item").filter({ hasText: "1" }).click();

  await page.getByPlaceholder("按标题筛选").fill("后台导出样片");
  await expect(
    table.locator(".photo-cell").filter({ hasText: "后台导出样片" }).first(),
  ).toBeVisible();
  await expect(table.getByText("A7R V").first()).toBeVisible();
  await expect(table.getByText("FE 35mm F1.4 GM").first()).toBeVisible();
  await expect(
    table.getByText(/image\/jpeg|未知格式|未知大小|\bISO\b|f\/4|1\/250s/),
  ).toHaveCount(0);

  await table.getByRole("columnheader", { name: /拍摄日期/ }).click();

  const firstCellAlign = await table
    .locator(".arco-table-td")
    .first()
    .evaluate((element) => getComputedStyle(element).textAlign);
  expect(firstCellAlign).toBe("center");

  await table.locator(".photo-cell__thumb").first().click();
  await expect(
    page.getByRole("dialog", { name: /后台导出样片/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "新增图片" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "新增图片记录" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await table.getByRole("button", { name: "编辑" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "编辑图片记录" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "上传图片" }).first().click();
  const uploadDialog = page.getByRole("dialog", { name: "上传图片" });
  await expect(uploadDialog).toBeVisible();
  await expect(
    uploadDialog.getByRole("button", { name: "上传暂存文件" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  const bodyBackgroundImage = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  );
  expect(bodyBackgroundImage).not.toContain("22, 93, 255");
  expect(bodyBackgroundImage).not.toContain("20, 201, 201");

  await page.locator(".photo-cell__thumb").first().focus();
  const focusOutline = await page
    .locator(".photo-cell__thumb")
    .first()
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(focusOutline).not.toBe("none");
});

test("Admin API auth and upload auto-export the Main client JSON", async ({
  request,
}) => {
  const beforeUploadExport = await readFile(exportFile, "utf8");

  const unauthorized = await request.get(`${serverBaseUrl}/api/photos`);
  expect(unauthorized.status()).toBe(401);

  const uploaded = await request.post(`${serverBaseUrl}/api/uploads`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: {
      title: "Playwright 上传样片",
      description: "Upload smoke keeps SQLite as source of truth",
      file: {
        name: "playwright-upload.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const uploadBody = (await uploaded.json()) as {
    export?: { photoCount?: number; topicCount?: number };
    photos?: Array<{
      id: string;
      title?: string;
      image?: { storage?: string; url?: string };
    }>;
  };
  expect(uploadBody.photos).toHaveLength(1);
  expect(uploadBody.export?.photoCount).toBe(seedPhotoCount + 1);
  expect(uploadBody.photos?.[0]?.image?.storage).toBe("local");

  const listed = await request.get(`${serverBaseUrl}/api/photos`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(listed.ok()).toBeTruthy();
  const listBody = (await listed.json()) as { photos?: unknown[] };
  expect(listBody.photos?.length).toBe(seedPhotoCount + 1);

  const afterUploadExport = await readFile(exportFile, "utf8");
  expect(afterUploadExport).not.toBe(beforeUploadExport);
  const exported = JSON.parse(afterUploadExport) as {
    photos?: Array<{
      id?: string;
      title?: string;
      image?: unknown;
      imageUrl?: unknown;
      asset?: { original?: string };
      topicIds?: string[];
    }>;
  };
  const exportedUpload = exported.photos?.find(
    (photo) => photo.id === uploadBody.photos?.[0]?.id,
  );
  expect(exportedUpload?.title).toBe("Playwright 上传样片");
  expect(exportedUpload?.asset?.original).toBe(
    uploadBody.photos?.[0]?.image?.url,
  );
  expect(exportedUpload?.topicIds).toEqual([]);
  expect(exportedUpload).not.toHaveProperty("image");
  expect(exportedUpload).not.toHaveProperty("imageUrl");
});

test("Main dev loads gallery data from /api and grid remains compact", async ({
  page,
  request,
}) => {
  const svg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23222222'/%3E%3C/svg%3E";
  for (let index = 0; index < 14; index += 1) {
    const response = await request.post(`${serverBaseUrl}/api/photos`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        id: `main-api-card-${index}`,
        title: `API 底部样片 ${String(index).padStart(2, "0")}`,
        description: "Virtual bottom smoke fixture",
        topicId: "editorial",
        takenAt: `2026-06-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
        image: { url: svg, storage: "remote" },
        asset: {
          original: svg,
          thumbnail: svg,
          preview: svg,
          alt: `API 底部样片 ${String(index).padStart(2, "0")}`,
          width: 800,
          height: 800,
        },
      },
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 1366, height: 900 });
  const apiGalleryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes("/api/gallery")) {
      apiGalleryRequests.push(request.url());
    }
  });
  await page.goto(mainBaseUrl);
  const card = page.locator(".photo-card").first();
  await expect(card).toBeVisible();
  expect(apiGalleryRequests.length).toBeGreaterThan(0);

  const beforeBox = await card.boundingBox();
  const before = await card.evaluate((element) => {
    const image = element.querySelector("img");
    const row = element.closest(".virtual-grid__row");
    const meta = element.querySelector(".photo-card__meta");
    if (!image || !row || !meta)
      throw new Error("Photo card DOM is incomplete");
    return {
      cardTransform: getComputedStyle(element).transform,
      imageTransform: getComputedStyle(image).transform,
      gap: getComputedStyle(row).gap,
      borderRadius: getComputedStyle(element).borderRadius,
      aspectRatio: getComputedStyle(element).aspectRatio,
      metaOpacity: getComputedStyle(meta).opacity,
    };
  });

  await card.hover();
  await page.waitForTimeout(260);

  const afterBox = await card.boundingBox();
  const after = await card.evaluate((element) => {
    const image = element.querySelector("img");
    const row = element.closest(".virtual-grid__row");
    const meta = element.querySelector(".photo-card__meta");
    if (!image || !row || !meta)
      throw new Error("Photo card DOM is incomplete");
    return {
      cardTransform: getComputedStyle(element).transform,
      imageTransform: getComputedStyle(image).transform,
      gap: getComputedStyle(row).gap,
      borderRadius: getComputedStyle(element).borderRadius,
      aspectRatio: getComputedStyle(element).aspectRatio,
      metaOpacity: getComputedStyle(meta).opacity,
    };
  });

  expect(after.cardTransform).toBe(before.cardTransform);
  expect(after.imageTransform).toBe(before.imageTransform);
  expect(afterBox?.width).toBe(beforeBox?.width);
  expect(afterBox?.height).toBe(beforeBox?.height);
  expect(Number.parseFloat(after.gap)).toBeLessThanOrEqual(10);
  expect(after.borderRadius).toBe("0px");
  expect(after.aspectRatio).toContain("1");
  expect(Number.parseFloat(before.metaOpacity)).toBeLessThan(0.05);
  expect(Number.parseFloat(after.metaOpacity)).toBeGreaterThan(0.95);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.getByRole("button", { name: /查看图片：API 底部样片 00/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /查看图片：/ })
    .first()
    .click();
  const navCenterDelta = await page
    .locator(".modal__nav--prev")
    .evaluate((element) => {
      const button = element.getBoundingClientRect();
      const wrap = document
        .querySelector(".modal__image-wrap")
        ?.getBoundingClientRect();
      if (!wrap) throw new Error("Modal image pane was not found");
      return Math.abs(
        button.top + button.height / 2 - (wrap.top + wrap.height / 2),
      );
    });
  expect(navCenterDelta).toBeLessThan(2);
});

test("Main virtual grid renders the bottom card and modal nav is vertically centered", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 14; index += 1) {
    const isBottomFixture = index === 13;
    const created = await request.post(`${serverBaseUrl}/api/photos`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        title: isBottomFixture
          ? "底部虚拟样片"
          : `虚拟列表填充样片 ${index + 1}`,
        topicId: "editorial",
        takenAt: isBottomFixture
          ? "2026-01-01T08:00:00.000Z"
          : `2026-07-${String(20 - index).padStart(2, "0")}T08:00:00.000Z`,
        asset: {
          original:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23555555'/%3E%3C/svg%3E",
          alt: isBottomFixture
            ? "底部虚拟样片"
            : `虚拟列表填充样片 ${index + 1}`,
          width: 800,
          height: 800,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(mainBaseUrl);
  await expect(page.locator(".photo-card").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.getByRole("button", { name: "查看图片：底部虚拟样片" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看图片：底部虚拟样片" }).click();

  const centers = await page.evaluate(() => {
    const imageWrap = document.querySelector(".modal__image-wrap");
    const prev = document.querySelector(".modal__nav--prev");
    const next = document.querySelector(".modal__nav--next");
    if (!imageWrap || !prev || !next)
      throw new Error("Modal nav DOM is incomplete");
    const imageBox = imageWrap.getBoundingClientRect();
    const prevBox = prev.getBoundingClientRect();
    const nextBox = next.getBoundingClientRect();
    return {
      imageCenter: imageBox.top + imageBox.height / 2,
      prevCenter: prevBox.top + prevBox.height / 2,
      nextCenter: nextBox.top + nextBox.height / 2,
    };
  });

  expect(Math.abs(centers.prevCenter - centers.imageCenter)).toBeLessThan(2);
  expect(Math.abs(centers.nextCenter - centers.imageCenter)).toBeLessThan(2);
});

test("Main dev loads gallery through /api and virtualizes to the bottom row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const [galleryResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/gallery")),
    page.goto(mainBaseUrl),
  ]);
  expect(galleryResponse.ok()).toBeTruthy();

  await expect(
    page.getByRole("button", { name: "查看图片：后台导出样片", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.getByRole("button", {
      name: `查看图片：后台导出样片 ${seedPhotoCount}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("Main topics tab opens a virtual detail page with scoped modal navigation", async ({
  page,
}) => {
  const svg = (fill: string) =>
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23${fill}'/%3E%3C/svg%3E`;
  const makePhoto = (
    id: string,
    title: string,
    topicIds: string[],
    takenAt: string,
    fill: string,
  ) => ({
    id,
    title,
    description: `${title} description`,
    topicIds,
    takenAt,
    asset: {
      original: svg(fill),
      thumbnail: svg(fill),
      preview: svg(fill),
      alt: title,
      width: 800,
      height: 800,
    },
  });

  await page.route("**/api/gallery", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-07-07T00:00:00.000Z",
        topics: [
          {
            id: "editorial",
            title: "编辑精选",
            description: "三张编辑精选作品",
            sortOrder: 1,
          },
          {
            id: "travel",
            title: "旅行专题",
            description: "不应出现在编辑精选二级页",
            sortOrder: 2,
          },
        ],
        photos: [
          makePhoto(
            "travel-a",
            "旅行样片",
            ["travel"],
            "2030-01-01T00:00:00.000Z",
            "775533",
          ),
          makePhoto(
            "editorial-a",
            "编辑样片 A",
            ["editorial"],
            "2029-01-01T00:00:00.000Z",
            "222222",
          ),
          makePhoto(
            "editorial-b",
            "编辑样片 B",
            ["editorial"],
            "2028-01-01T00:00:00.000Z",
            "333333",
          ),
          makePhoto(
            "editorial-c",
            "编辑样片 C",
            ["editorial"],
            "2027-01-01T00:00:00.000Z",
            "444444",
          ),
        ],
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(mainBaseUrl);
  await page.getByRole("tab", { name: "专题" }).click();
  await page.getByRole("button", { name: "查看专题：编辑精选" }).click();

  await expect(
    page.getByRole("heading", { name: "编辑精选", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("专题 / 编辑精选")).toBeVisible();
  await expect(page.getByText("3 张作品")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看图片：编辑样片 A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看图片：旅行样片" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "查看图片：编辑样片 A" }).click();
  await expect(page.getByRole("dialog", { name: "编辑样片 A" })).toBeVisible();
  await expect(page.locator(".modal .eyebrow")).toHaveText("1 / 3");

  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.locator(".modal h2")).toHaveText("编辑样片 B");
  await expect(page.locator(".modal .eyebrow")).toHaveText("2 / 3");

  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "返回专题列表" }).click();
  await expect(
    page.getByRole("button", { name: "查看专题：旅行专题" }),
  ).toBeVisible();
});

test("Main hash routes restore tabs/topic detail and thumbnails stay display-only", async ({
  page,
}) => {
  const photos = [
    {
      id: "editorial-route-a",
      title: "路由样片 A",
      description: "Route fixture with COS thumbnail query",
      topicIds: ["editorial"],
      takenAt: "2031-01-02T00:00:00.000Z",
      asset: {
        original: "https://cdn.example.com/original-a.jpg",
        thumbnail: "https://cdn.example.com/thumb-a.jpg?existing=1#card",
        preview: "https://cdn.example.com/preview-a.jpg?full=1#modal",
        alt: "路由样片 A",
        width: 800,
        height: 800,
      },
    },
    {
      id: "editorial-route-b",
      title: "路由样片 B",
      description: "Second topic fixture",
      topicIds: ["editorial"],
      takenAt: "2030-01-01T00:00:00.000Z",
      asset: {
        original: "https://cdn.example.com/original-b.jpg",
        thumbnail: "https://cdn.example.com/thumb-b.jpg",
        preview: "https://cdn.example.com/preview-b.jpg",
        alt: "路由样片 B",
        width: 800,
        height: 800,
      },
    },
  ];

  await page.route("**/api/gallery", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-07-07T00:00:00.000Z",
        topics: [
          {
            id: "editorial",
            title: "编辑精选",
            description: "Hash route topic",
            slug: "featured",
            sortOrder: 1,
          },
        ],
        photos,
      }),
    });
  });

  await page.goto(`${mainBaseUrl}#/topics`);
  await expect(page.getByRole("tab", { name: "专题" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "查看专题：编辑精选" }).click();
  await expect(page).toHaveURL(/#\/topics\/featured$/);
  await expect(
    page.getByRole("heading", { name: "编辑精选", level: 1 }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "编辑精选", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("2 张作品")).toBeVisible();

  await page.getByRole("button", { name: "返回专题列表" }).click();
  await expect(page).toHaveURL(/#\/topics$/);

  await page.getByRole("tab", { name: "时间轴" }).click();
  await expect(page).toHaveURL(/#\/timeline$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "时间轴" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: "最新" }).click();
  await expect(page).toHaveURL(/#\/latest$/);
  const cardImageSrc = await page
    .locator(".photo-card img")
    .first()
    .getAttribute("src");
  expect(cardImageSrc).toContain(
    "https://cdn.example.com/thumb-a.jpg?existing=1&imageMogr2/thumbnail/800x#card",
  );

  await page.getByRole("button", { name: "查看图片：路由样片 A" }).click();
  const modalImageSrc = await page
    .locator(".modal__image-wrap img")
    .getAttribute("src");
  expect(modalImageSrc).toBe(
    "https://cdn.example.com/preview-a.jpg?full=1#modal",
  );
  expect(modalImageSrc).not.toContain("imageMogr2");
});

test("Main modal navigation buttons are vertically centered and switch photos", async ({
  page,
  request,
}) => {
  const aspectRatioFixtures = [
    {
      title: "超宽居中样片",
      takenAt: "2026-07-31T08:00:00.000Z",
      svg: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='500'%3E%3Crect width='1600' height='500' fill='%23333333'/%3E%3C/svg%3E",
      width: 1600,
      height: 500,
    },
    {
      title: "竖幅居中样片",
      takenAt: "2026-07-30T08:00:00.000Z",
      svg: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='1600'%3E%3Crect width='500' height='1600' fill='%23444444'/%3E%3C/svg%3E",
      width: 500,
      height: 1600,
    },
  ];

  for (const fixture of aspectRatioFixtures) {
    const created = await request.post(`${serverBaseUrl}/api/photos`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        title: fixture.title,
        topicId: "editorial",
        takenAt: fixture.takenAt,
        asset: {
          original: fixture.svg,
          alt: fixture.title,
          width: fixture.width,
          height: fixture.height,
        },
      },
    });
    expect(created.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 1280, height: 720 });

  for (const fixture of aspectRatioFixtures) {
    await page.goto(mainBaseUrl);
    await page
      .getByRole("button", { name: `查看图片：${fixture.title}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: fixture.title });
    await expect(dialog).toBeVisible();

    const navMetrics = await page.evaluate(() => {
      const imageWrap = document.querySelector(".modal__image-wrap");
      const image = document.querySelector(".modal__image-wrap img");
      const panel = document.querySelector(".modal__panel");
      const prev = document.querySelector(".modal__nav--prev");
      const next = document.querySelector(".modal__nav--next");
      if (!imageWrap || !image || !panel || !prev || !next) {
        throw new Error("Modal navigation DOM was not found");
      }
      const imageBox = imageWrap.getBoundingClientRect();
      const renderedImageBox = image.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const prevBox = prev.getBoundingClientRect();
      const nextBox = next.getBoundingClientRect();
      const prevStyles = getComputedStyle(prev);
      const nextStyles = getComputedStyle(next);
      return {
        imageCenterY: imageBox.top + imageBox.height / 2,
        prevCenterY: prevBox.top + prevBox.height / 2,
        nextCenterY: nextBox.top + nextBox.height / 2,
        imageHeight: imageBox.height,
        renderedImageWidth: renderedImageBox.width,
        renderedImageHeight: renderedImageBox.height,
        wrapWidth: imageBox.width,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        panelHeight: panelBox.height,
        prevTransform: prevStyles.transform,
        nextTransform: nextStyles.transform,
      };
    });
    expect(
      Math.abs(navMetrics.prevCenterY - navMetrics.imageCenterY),
    ).toBeLessThan(2);
    expect(
      Math.abs(navMetrics.nextCenterY - navMetrics.imageCenterY),
    ).toBeLessThan(2);
    expect(
      Math.abs(navMetrics.imageHeight - navMetrics.panelHeight),
    ).toBeLessThan(2);
    expect(navMetrics.renderedImageWidth).toBeLessThanOrEqual(
      navMetrics.wrapWidth + 1,
    );
    expect(navMetrics.renderedImageHeight).toBeLessThanOrEqual(
      navMetrics.imageHeight + 1,
    );
    expect(navMetrics.renderedImageWidth).toBeGreaterThan(0);
    expect(navMetrics.renderedImageHeight).toBeGreaterThan(0);
    expect(
      navMetrics.renderedImageWidth / navMetrics.renderedImageHeight,
    ).toBeCloseTo(navMetrics.naturalWidth / navMetrics.naturalHeight, 2);
    expect(navMetrics.imageHeight).toBeGreaterThan(600);
    expect(navMetrics.prevTransform).not.toBe("none");
    expect(navMetrics.nextTransform).not.toBe("none");
  }

  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".modal h2")).not.toHaveText(
    aspectRatioFixtures[aspectRatioFixtures.length - 1]?.title ?? "",
  );
});
