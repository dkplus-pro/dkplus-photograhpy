import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "styles.css"), "utf8");

const cssBlock = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  expect(match, `Expected ${selector} CSS block to exist`).toBeTruthy();
  return match?.[1] ?? "";
};

describe("admin gallery list UI contract", () => {
  it("offers independent title, brand, model, and topic filters", () => {
    expect(appSource).toContain('aria-label="按标题筛选"');
    expect(appSource).toContain('aria-label="按品牌筛选"');
    expect(appSource).toContain('aria-label="按机型筛选"');
    expect(appSource).toContain('aria-label="按专题筛选"');
    expect(appSource).toContain("cameraBrands");
    expect(appSource).toContain("cameraModels");
    expect(appSource).toMatch(/matchesTopic && matchesBrand && matchesModel && matchesTitle/);
  });

  it("uses a dedicated sortable shooting-date column and omits update-date display", () => {
    expect(appSource).toMatch(/title:\s*"EXIF"/);
    expect(appSource).toMatch(/title:\s*"拍摄日期"[\s\S]*?sorter:/);
    expect(appSource).not.toContain('title: "EXIF / 时间"');
    expect(appSource).not.toContain("更新：");
  });

  it("keeps table content centered, dense, unclamped, and accessible", () => {
    expect(appSource).toMatch(/scroll=\{\{\s*x:\s*1000\s*\}\}/);
    expect(appSource).not.toMatch(/scroll=\{\{[^}]*y:/);
    expect(appSource).toContain('size="mini"');
    expect(appSource).toContain("暂无匹配图片，可调整标题、品牌、机型或专题筛选");

    expect(cssBlock(".photos-table .arco-table-th,\n.photos-table .arco-table-td")).toMatch(/padding-top:\s*6px;/);
    expect(cssBlock(".photos-table .arco-table-th,\n.photos-table .arco-table-td")).toMatch(/text-align:\s*center;/);
    expect(cssBlock(".photos-table .arco-table-th,\n.photos-table .arco-table-td")).toMatch(/vertical-align:\s*middle;/);
    expect(cssBlock(".toolbar :where(.arco-input-inner-wrapper, .arco-select-view):focus-within")).toMatch(/outline:\s*3px solid/);
  });
});
