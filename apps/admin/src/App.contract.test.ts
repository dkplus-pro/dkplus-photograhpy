import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "App.tsx"), "utf8");
const styles = readFileSync(join(currentDir, "styles.css"), "utf8");

describe("admin gallery list contract", () => {
  it("exposes title, brand, model, and topic filters", () => {
    expect(appSource).toContain('placeholder="按标题筛选"');
    expect(appSource).toContain('aria-label="按品牌筛选"');
    expect(appSource).toContain('aria-label="按机型筛选"');
    expect(appSource).toContain('aria-label="按专题筛选"');
  });

  it("keeps capture date independent, sortable, and free of update-date text", () => {
    expect(appSource).toContain('title: "拍摄日期"');
    expect(appSource).toContain("sorter: (left, right) =>");
    expect(appSource).not.toContain("更新：");
  });

  it("removes the vertical table cap and centers dense table cells", () => {
    expect(appSource).toContain("scroll={{ x: 1260 }}");
    expect(appSource).not.toContain("y: 560");
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?text-align:\s*center;/,
    );
    expect(styles).toMatch(
      /\.photos-table \.arco-table-cell\s*\{[\s\S]*?justify-content:\s*center;/,
    );
  });
});
