import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "../App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "../styles.css"), "utf8");
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("return ("),
);

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

  it("documents the optimized list columns in source", () => {
    expect(columnsSource).toContain('title: "图片"');
    expect(columnsSource).toContain('title: "专题"');
    expect(columnsSource).toContain('title: "型号"');
    expect(columnsSource).toContain('title: "镜头"');
    expect(columnsSource).toContain('title: "拍摄日期"');
    expect(columnsSource).not.toContain('title: "文件信息"');
    expect(columnsSource).not.toContain('title: "EXIF"');
    expect(columnsSource).not.toMatch(
      /imageSummary|formatFileSize|mimeType|未知格式|未知大小/,
    );
    expect(columnsSource).not.toMatch(/aperture|shutter|iso|ISO|光圈|快门/);
  });

  it("keeps shooting date sortable and removes update-date table copy", () => {
    expect(columnsSource).toContain('title: "拍摄日期"');
    expect(columnsSource).toContain("sorter: (left, right)");
    expect(appSource).not.toContain("更新：");
    expect(appSource).not.toMatch(/scroll=\{\{\s*x:\s*\d+,\s*y:/);
    expect(appSource).toMatch(/scroll=\{\{\s*x:\s*1260\s*\}\}/);
  });

  it("centers dense table content and exposes accessible gallery feedback", () => {
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
    expect(styles).toContain(".photo-cell__thumb:hover img");
    expect(styles).not.toMatch(/linear-gradient\(135deg,\s*rgba\(22, 93, 255/);
    expect(styles).not.toMatch(/radial-gradient\([\s\S]*rgba\(20, 201, 201/);
  });

  it("supports creating a new topic from admin photo flows", () => {
    expect(appSource).toContain("customTopics");
    expect(appSource).toContain("topicDraft");
    expect(appSource).toContain("normalizeTopicId");
    expect(appSource).toContain('aria-label="新增专题"');
    expect(appSource).toContain('placeholder="专题名称，如：编辑精选"');
    expect(appSource).toContain('placeholder="专题 ID（可选，自动生成）"');
    expect(appSource).toContain("setTopicFilter(topicId)");
    expect(appSource).toContain("请先选择或新增专题，再按当前专题选择图片。");
    expect(appSource).not.toContain("untitled-topic");
  });
});
