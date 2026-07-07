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

  it("keeps the redesigned editor modal as upload preview plus metadata panes", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-upload-card"');
    expect(appSource).toContain('className="editor-metadata-card"');
    expect(appSource).toContain('aria-label="图片资料表单"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("选择新文件后会刷新 EXIF");
    expect(appSource).toContain("专题会同步写入主专题字段");
    expect(styles).toContain(".editor-modal .arco-modal");
    expect(styles).toContain(".editor-hero");
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*0\.92fr\)\s*minmax\(340px,\s*1\.08fr\);/,
    );
  });

  it("centers dense table content and keeps unified neutral hover and focus tones", () => {
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?text-align:\s*center;/,
    );
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?vertical-align:\s*middle;/,
    );
    expect(styles).toContain("--hover-wash: #e8e1d4;");
    expect(styles).toContain("--focus: #332f29;");
    expect(styles).toContain("--focus-ring: rgba(20, 20, 20, 0.32);");
    expect(styles).toContain("--color-primary-6: var(--ink);");
    expect(styles).toContain(".photos-table .arco-empty");
    expect(styles).toContain(
      ".toolbar :where(.arco-input-inner-wrapper, .arco-select-view):focus-within",
    );
    expect(styles).toContain("outline: 3px solid var(--focus-ring);");
    expect(styles).toContain(".photo-cell__thumb:hover img");
    expect(styles).toMatch(
      /\.photos-table \.arco-table-tr:hover \.arco-table-td\s*\{[\s\S]*?background:\s*var\(--hover-wash\);/,
    );
    expect(styles).toContain(".admin-shell :where(.arco-alert-info)");
    expect(styles).toContain(
      ":where(.arco-select-popup) .arco-select-option:hover",
    );
    expect(styles).not.toContain("#1b63ff");
    expect(styles).not.toMatch(/rgba?\(\s*27,\s*99,\s*255/);
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
