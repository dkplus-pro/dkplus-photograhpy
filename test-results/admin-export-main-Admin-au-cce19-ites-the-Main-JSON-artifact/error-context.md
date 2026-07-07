# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-export-main.spec.ts >> Admin authenticated export action writes the Main JSON artifact
- Location: tests/playwright/admin-export-main.spec.ts:234:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/已导出到客户端：1 张图片、1 个专题/)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText(/已导出到客户端：1 张图片、1 个专题/)

```

```yaml
- main:
  - paragraph: DKPlus 图库后台
  - heading "图片管理" [level=1]
  - button "刷新 API"
  - button "新增图片"
  - button "上传图片"
  - button "导出到客户端"
  - region "图片统计": 图片记录 1 筛选结果 1 专题数量 1 已选择 0
  - textbox "搜索标题、专题、文件名、标签或 EXIF"
  - combobox: 全部专题
  - button "新增图片"
  - button "删除所选" [disabled]
  - button "导出到客户端"
  - text: 图片列表 1 条结果
  - table:
    - rowgroup:
      - row "图片 专题 文件信息 EXIF / 时间 操作":
        - columnheader:
          - checkbox
        - columnheader "图片"
        - columnheader "专题"
        - columnheader "文件信息"
        - columnheader "EXIF / 时间"
        - columnheader "操作"
  - table:
    - rowgroup:
      - row "放大预览：后台导出样片 后台导出样片 Seeded from JSON into SQLite editorial 后台导出样片 · remote 未知格式 未知大小 暂无 EXIF 拍摄：2026年7月7日 更新：2026年7月7日 编辑 删除":
        - cell:
          - checkbox
        - cell "放大预览：后台导出样片 后台导出样片 Seeded from JSON into SQLite":
          - button "放大预览：后台导出样片":
            - img "后台导出样片"
          - strong: 后台导出样片
          - text: Seeded from JSON into SQLite
        - cell "editorial"
        - cell "后台导出样片 · remote 未知格式 未知大小":
          - strong: 后台导出样片 · remote
          - text: 未知格式 未知大小
        - cell "暂无 EXIF 拍摄：2026年7月7日 更新：2026年7月7日":
          - strong: 暂无 EXIF
          - text: 拍摄：2026年7月7日 更新：2026年7月7日
        - cell "编辑 删除":
          - button "编辑"
          - button "删除"
  - text: 显示 1-8，共 1 条
  - list:
    - listitem "上一页": .
    - listitem "第 1 页": "1"
    - listitem "下一页": .
  - combobox: 8 条/页
```

# Test source

```ts
  139 |           title: `紧凑样片 ${index + 1}`,
  140 |           description: "No hover zoom smoke fixture",
  141 |           topicIds: [],
  142 |           takenAt: `2026-07-0${Math.min(index + 1, 9)}T08:00:00.000Z`,
  143 |           asset: {
  144 |             original: svg,
  145 |             thumbnail: svg,
  146 |             preview: svg,
  147 |             alt: `紧凑样片 ${index + 1}`,
  148 |             width: 800,
  149 |             height: 800,
  150 |           },
  151 |           urls: {
  152 |             original: svg,
  153 |             thumbnail: svg,
  154 |             preview: svg,
  155 |           },
  156 |         })),
  157 |       },
  158 |       null,
  159 |       2,
  160 |     )}\n`,
  161 |     "utf8",
  162 |   );
  163 | }
  164 | 
  165 | test.beforeAll(async () => {
  166 |   root = await mkdtemp(path.join(tmpdir(), "dkplus-playwright-"));
  167 |   exportFile = path.join(root, "photos.json");
  168 |   const databaseFile = path.join(root, "gallery.sqlite");
  169 |   const uploadDir = path.join(root, "uploads");
  170 |   await writeSeedGallery(exportFile);
  171 |   await writeMainGallery();
  172 | 
  173 |   const serverPort = await freePort();
  174 |   const adminPort = await freePort();
  175 |   const mainPort = await freePort();
  176 |   const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
  177 |   adminBaseUrl = `http://127.0.0.1:${adminPort}`;
  178 |   mainBaseUrl = `http://127.0.0.1:${mainPort}`;
  179 | 
  180 |   spawnProcess("server", "pnpm", ["--dir", "apps/server", "exec", "tsx", "src/index.ts"], {
  181 |     NODE_ENV: "test",
  182 |     HOST: "127.0.0.1",
  183 |     PORT: String(serverPort),
  184 |     ADMIN_TOKEN: adminToken,
  185 |     CORS_ORIGINS: adminBaseUrl,
  186 |     DATABASE_FILE: databaseFile,
  187 |     GALLERY_EXPORT_FILE: exportFile,
  188 |     UPLOAD_DIR: uploadDir,
  189 |     PUBLIC_BASE_URL: `${serverBaseUrl}/uploads`,
  190 |   });
  191 |   await waitForHttp(`${serverBaseUrl}/health`, "server");
  192 | 
  193 |   spawnProcess("admin", "pnpm", [
  194 |     "--dir",
  195 |     "apps/admin",
  196 |     "exec",
  197 |     "vite",
  198 |     "--host",
  199 |     "127.0.0.1",
  200 |     "--port",
  201 |     String(adminPort),
  202 |     "--strictPort",
  203 |   ], {
  204 |     VITE_API_BASE_URL: `${serverBaseUrl}/api`,
  205 |     VITE_ADMIN_TOKEN: adminToken,
  206 |   });
  207 |   await waitForHttp(adminBaseUrl, "admin");
  208 | 
  209 |   spawnProcess("main", "pnpm", [
  210 |     "--dir",
  211 |     "apps/main",
  212 |     "exec",
  213 |     "vite",
  214 |     "--host",
  215 |     "127.0.0.1",
  216 |     "--port",
  217 |     String(mainPort),
  218 |     "--strictPort",
  219 |   ], {
  220 |     VITE_BASE_PATH: "/",
  221 |   });
  222 |   await waitForHttp(mainBaseUrl, "main");
  223 | });
  224 | 
  225 | test.afterAll(async () => {
  226 |   for (const entry of processes.reverse()) {
  227 |     if (!entry.process.killed) {
  228 |       entry.process.kill("SIGTERM");
  229 |     }
  230 |   }
  231 |   if (root) await rm(root, { recursive: true, force: true });
  232 | });
  233 | 
  234 | test("Admin authenticated export action writes the Main JSON artifact", async ({ page }) => {
  235 |   await page.goto(adminBaseUrl);
  236 |   await expect(page.getByRole("heading", { name: "图片管理" })).toBeVisible();
  237 | 
  238 |   await page.getByRole("button", { name: "导出到客户端" }).first().click();
> 239 |   await expect(page.getByText(/已导出到客户端：1 张图片、1 个专题/)).toBeVisible();
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  240 | 
  241 |   const exported = JSON.parse(await readFile(exportFile, "utf8")) as {
  242 |     photos: Array<{ id: string; topicIds: string[]; asset: { original: string } }>;
  243 |     topics: unknown[];
  244 |   };
  245 |   expect(exported.topics).toHaveLength(1);
  246 |   expect(exported.photos).toHaveLength(1);
  247 |   expect(exported.photos[0]?.id).toBe("admin-seed-photo");
  248 |   expect(exported.photos[0]?.topicIds).toEqual(["editorial"]);
  249 |   expect(exported.photos[0]?.asset.original).toContain("data:image/svg+xml");
  250 | });
  251 | 
  252 | test("Main grid remains compact and does not transform cards or images on hover", async ({ page }) => {
  253 |   await page.setViewportSize({ width: 1366, height: 900 });
  254 |   await page.goto(mainBaseUrl);
  255 |   const card = page.locator(".photo-card").first();
  256 |   await expect(card).toBeVisible();
  257 | 
  258 |   const beforeBox = await card.boundingBox();
  259 |   const before = await card.evaluate((element) => {
  260 |     const image = element.querySelector("img");
  261 |     const row = element.closest(".virtual-grid__row");
  262 |     const meta = element.querySelector(".photo-card__meta");
  263 |     if (!image || !row || !meta) throw new Error("Photo card DOM is incomplete");
  264 |     return {
  265 |       cardTransform: getComputedStyle(element).transform,
  266 |       imageTransform: getComputedStyle(image).transform,
  267 |       gap: getComputedStyle(row).gap,
  268 |       borderRadius: getComputedStyle(element).borderRadius,
  269 |       aspectRatio: getComputedStyle(element).aspectRatio,
  270 |       metaOpacity: getComputedStyle(meta).opacity,
  271 |     };
  272 |   });
  273 | 
  274 |   await card.hover();
  275 |   await page.waitForTimeout(260);
  276 | 
  277 |   const afterBox = await card.boundingBox();
  278 |   const after = await card.evaluate((element) => {
  279 |     const image = element.querySelector("img");
  280 |     const row = element.closest(".virtual-grid__row");
  281 |     const meta = element.querySelector(".photo-card__meta");
  282 |     if (!image || !row || !meta) throw new Error("Photo card DOM is incomplete");
  283 |     return {
  284 |       cardTransform: getComputedStyle(element).transform,
  285 |       imageTransform: getComputedStyle(image).transform,
  286 |       gap: getComputedStyle(row).gap,
  287 |       borderRadius: getComputedStyle(element).borderRadius,
  288 |       aspectRatio: getComputedStyle(element).aspectRatio,
  289 |       metaOpacity: getComputedStyle(meta).opacity,
  290 |     };
  291 |   });
  292 | 
  293 |   expect(after.cardTransform).toBe(before.cardTransform);
  294 |   expect(after.imageTransform).toBe(before.imageTransform);
  295 |   expect(afterBox?.width).toBe(beforeBox?.width);
  296 |   expect(afterBox?.height).toBe(beforeBox?.height);
  297 |   expect(Number.parseFloat(after.gap)).toBeLessThanOrEqual(12);
  298 |   expect(after.borderRadius).toBe("0px");
  299 |   expect(after.aspectRatio).toContain("1");
  300 |   expect(Number.parseFloat(before.metaOpacity)).toBeLessThan(0.05);
  301 |   expect(Number.parseFloat(after.metaOpacity)).toBeGreaterThan(0.95);
  302 | });
  303 | 
```