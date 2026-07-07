import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "styles.css"), "utf8");

const cssBlock = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  expect(match, `Expected ${selector} CSS block to exist`).toBeTruthy();
  return match?.[1] ?? "";
};

describe("admin list UI contract", () => {
  it("keeps explicit title, brand, model, and topic filters", () => {
    expect(appSource).toContain('aria-label="按标题筛选"');
    expect(appSource).toContain('aria-label="按品牌筛选"');
    expect(appSource).toContain('aria-label="按机型筛选"');
    expect(appSource).toContain('aria-label="按专题筛选"');
    expect(appSource).toContain("cameraBrands");
    expect(appSource).toContain("cameraModels");
  });

  it("removes list height locking and update-date display", () => {
    expect(appSource).toContain('title: "拍摄日期"');
    expect(appSource).toContain("sorter: (left, right) => takenAtTime(left) - takenAtTime(right)");
    expect(appSource).not.toContain("更新：");
    expect(appSource).not.toContain("y: 560");
    expect(appSource).toContain("scroll={{ x: 1000 }}");
  });

  it("centers dense table content and preserves focus/empty feedback", () => {
    const tableCells = cssBlock(".photos-table .arco-table-th,\\n.photos-table .arco-table-td");
    expect(tableCells).toMatch(/padding-top:\s*6px;/);
    expect(tableCells).toMatch(/text-align:\s*center;/);
    expect(tableCells).toMatch(/vertical-align:\s*middle;/);
    expect(appSource).toContain("暂无匹配图片，可调整标题、品牌、机型或专题筛选");
    expect(styles).toContain(".toolbar :where(.arco-input-inner-wrapper, .arco-select-view):focus-within");
  });
});
