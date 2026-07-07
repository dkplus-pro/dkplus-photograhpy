import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "../App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "../styles.css"), "utf8");

describe("admin gallery list contract", () => {
  it("uses explicit title, brand, model, and topic filters", () => {
    expect(appSource).toContain("titleFilter");
    expect(appSource).toContain("brandFilter");
    expect(appSource).toContain("modelFilter");
    expect(appSource).toContain("topicFilter");
    expect(appSource).toContain("按标题筛选");
    expect(appSource).toContain("全部品牌");
    expect(appSource).toContain("全部机型");
    expect(appSource).toContain("全部专题");
  });

  it("keeps shooting date sortable and removes update-date table copy", () => {
    expect(appSource).toContain('title: "拍摄日期"');
    expect(appSource).toContain("sorter: (left, right)");
    expect(appSource).not.toContain("更新：");
    expect(appSource).not.toMatch(/scroll=\{\{\s*x:\s*\d+,\s*y:/);
    expect(appSource).toMatch(/scroll=\{\{\s*x:\s*1260\s*\}\}/);
  });

  it("centers dense table content and exposes focus/empty feedback", () => {
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?text-align:\s*center;/,
    );
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?vertical-align:\s*middle;/,
    );
    expect(styles).toContain(".photos-table .arco-empty");
    expect(styles).toContain(
      ".toolbar :where(.arco-input-inner-wrapper, .arco-select-view):focus-within",
    );
  });
});
