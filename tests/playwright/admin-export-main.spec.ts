import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const adminToken = "playwright-export-token";

type ManagedProcess = {
  name: string;
  process: ChildProcessWithoutNullStreams;
  logs: string[];
};

let root = "";
let exportFile = "";
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
  const managed = { name, process: child, logs: [] };
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

async function writeSeedGallery(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        generatedAt: "2026-07-07T00:00:00.000Z",
        topics: [
          {
            id: "editorial",
            title: "编辑精选",
            description: "Playwright seed topic",
            sortOrder: 1,
          },
        ],
        photos: [
          {
            id: "admin-seed-photo",
            title: "后台导出样片",
            description: "Seeded from JSON into SQLite",
            topicIds: ["editorial"],
            takenAt: "2026-07-07T08:00:00.000Z",
            asset: {
              original:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' fill='%23222222'/%3E%3C/svg%3E",
              thumbnail:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='480'%3E%3Crect width='480' height='480' fill='%23333333'/%3E%3C/svg%3E",
              preview:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'%3E%3Crect width='640' height='640' fill='%23444444'/%3E%3C/svg%3E",
              alt: "后台导出样片",
              width: 800,
              height: 800,
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
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
        photos: Array.from({ length: 6 }, (_, index) => ({
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
  const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
  adminBaseUrl = `http://127.0.0.1:${adminPort}`;
  mainBaseUrl = `http://127.0.0.1:${mainPort}`;

  spawnProcess("server", "pnpm", ["--dir", "apps/server", "exec", "tsx", "src/index.ts"], {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(serverPort),
    ADMIN_TOKEN: adminToken,
    CORS_ORIGINS: adminBaseUrl,
    DATABASE_FILE: databaseFile,
    GALLERY_EXPORT_FILE: exportFile,
    UPLOAD_DIR: uploadDir,
    PUBLIC_BASE_URL: `${serverBaseUrl}/uploads`,
  });
  await waitForHttp(`${serverBaseUrl}/health`, "server");

  spawnProcess("admin", "pnpm", [
    "--dir",
    "apps/admin",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(adminPort),
    "--strictPort",
  ], {
    VITE_API_BASE_URL: `${serverBaseUrl}/api`,
    VITE_ADMIN_TOKEN: adminToken,
  });
  await waitForHttp(adminBaseUrl, "admin");

  spawnProcess("main", "pnpm", [
    "--dir",
    "apps/main",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(mainPort),
    "--strictPort",
  ], {
    VITE_BASE_PATH: "/",
  });
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

test("Admin authenticated export action writes the Main JSON artifact", async ({ page }) => {
  await page.goto(adminBaseUrl);
  await expect(page.getByRole("heading", { name: "图片管理" })).toBeVisible();

  await page.getByRole("button", { name: "导出到客户端" }).first().click();
  await expect(page.getByText(/已导出到客户端：1 张图片、1 个专题/)).toBeVisible();

  const exported = JSON.parse(await readFile(exportFile, "utf8")) as {
    photos: Array<{ id: string; topicIds: string[]; asset: { original: string } }>;
    topics: unknown[];
  };
  expect(exported.topics).toHaveLength(1);
  expect(exported.photos).toHaveLength(1);
  expect(exported.photos[0]?.id).toBe("admin-seed-photo");
  expect(exported.photos[0]?.topicIds).toEqual(["editorial"]);
  expect(exported.photos[0]?.asset.original).toContain("data:image/svg+xml");
});

test("Main grid remains compact and does not transform cards or images on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(mainBaseUrl);
  const card = page.locator(".photo-card").first();
  await expect(card).toBeVisible();

  const beforeBox = await card.boundingBox();
  const before = await card.evaluate((element) => {
    const image = element.querySelector("img");
    const row = element.closest(".virtual-grid__row");
    const meta = element.querySelector(".photo-card__meta");
    if (!image || !row || !meta) throw new Error("Photo card DOM is incomplete");
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
    if (!image || !row || !meta) throw new Error("Photo card DOM is incomplete");
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
  expect(Number.parseFloat(after.gap)).toBeLessThanOrEqual(12);
  expect(after.borderRadius).toBe("0px");
  expect(after.aspectRatio).toContain("1");
  expect(Number.parseFloat(before.metaOpacity)).toBeLessThan(0.05);
  expect(Number.parseFloat(after.metaOpacity)).toBeGreaterThan(0.95);
});
