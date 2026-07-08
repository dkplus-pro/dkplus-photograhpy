import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(currentDir, "App.tsx"), "utf8");
const styles = readFileSync(join(currentDir, "styles.css"), "utf8");
const displayUrlSource = readFileSync(
  join(currentDir, "lib/display-url.ts"),
  "utf8",
);
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("return ("),
);

describe("admin gallery list contract", () => {
  it("exposes title, brand, model, and topic filters", () => {
    expect(appSource).toContain('placeholder="按标题筛选"');
    expect(appSource).toContain('aria-label="按品牌筛选"');
    expect(appSource).toContain('aria-label="按机型筛选"');
    expect(appSource).toContain('aria-label="按专题筛选"');
  });

  it("replaces file-info and EXIF summary columns with model and lens columns", () => {
    expect(columnsSource).toContain('title: "型号"');
    expect(columnsSource).toContain('title: "镜头"');
    expect(columnsSource).not.toContain('title: "文件信息"');
    expect(columnsSource).not.toContain('title: "EXIF"');
    expect(columnsSource).not.toContain("imageSummary(");
    expect(columnsSource).not.toContain("formatFileSize(");
    expect(columnsSource).not.toMatch(/mimeType|未知格式|未知大小/);
    expect(columnsSource).not.toMatch(/aperture|shutter|iso|ISO|光圈|快门/);
  });

  it("keeps capture date independent, sortable, centered, and free of update-date text", () => {
    expect(columnsSource).toContain('title: "拍摄日期"');
    expect(columnsSource).toContain("sorter: (left, right) =>");
    expect(columnsSource).toContain('align: "center"');
    expect(appSource).not.toContain("更新：");
  });

  it("keeps pagination, preview, and add/edit/upload modal affordances", () => {
    expect(appSource).toContain("scroll={{ x: 1260 }}");
    expect(appSource).not.toContain("y: 560");
    expect(appSource).toContain("pagination={{");
    expect(appSource).toContain("setPreviewPhoto(photo)");
    expect(appSource).toContain("isEditorOpen");
    expect(appSource).toContain("isUploadOpen");
  });

  it("documents the redesigned stacked editor modal contract", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-shell"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("等待选择本地图片后读取。");
    expect(appSource).toContain("上方确认图片与 EXIF");
    expect(appSource).toContain("保存时继续沿用现有上传与持久化流程");
    expect(styles).toContain(".editor-upload-card");
    expect(styles).toContain(".editor-metadata-card");
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?align-items:\s*stretch;/,
    );
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(280px/);
  });

  it("centers dense table cells and keeps unified neutral hover and focus tones", () => {
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?text-align:\s*center;/,
    );
    expect(styles).toMatch(
      /\.photos-table \.arco-table-cell\s*\{[\s\S]*?justify-content:\s*center;/,
    );
    expect(styles).toContain("--hover-wash: #e8e1d4;");
    expect(styles).toContain("--focus: #332f29;");
    expect(styles).toContain("--focus-ring: rgba(20, 20, 20, 0.32);");
    expect(appSource).toContain("const arcoTheme");
    expect(appSource).toContain('primaryColor: "#141414"');
    expect(appSource).toContain("theme={arcoTheme}");
    expect(styles).toContain("--arcoblue-6: 20, 20, 20;");
    expect(styles).toContain("--color-primary-6: var(--ink);");
    expect(styles).toContain(
      ".toolbar :where(.arco-input-inner-wrapper, .arco-select-view):focus-within",
    );
    expect(styles).toContain("outline: 3px solid var(--focus-ring);");
    expect(styles).toContain(".photo-cell__thumb:focus-visible");
    expect(styles).toMatch(
      /\.photos-table \.arco-table-tr:hover \.arco-table-td\s*\{[\s\S]*?background:\s*var\(--hover-wash\);/,
    );
    expect(styles).toContain(".admin-shell :where(.arco-alert-info)");
    expect(styles).toContain(
      ":where(.arco-select-popup) .arco-select-option:hover",
    );
    expect(styles).toContain("@media (max-width: 920px)");
    expect(styles).not.toContain("#1b63ff");
    expect(styles).not.toMatch(/rgba?\(\s*27,\s*99,\s*255/);
    expect(styles).not.toMatch(/linear-gradient\(135deg,\s*rgba\(22, 93, 255/);
    expect(styles).not.toMatch(/radial-gradient\([\s\S]*rgba\(20, 201, 201/);
  });

  it("uses display-only image transforms for admin thumbnails and previews", () => {
    expect(appSource).toContain("withAdminThumbnailDisplayUrl");
    expect(appSource).toContain("withAdminPreviewDisplayUrl");
    expect(columnsSource).toMatch(
      /src=\{withAdminThumbnailDisplayUrl\([\s\S]*?photo\.thumbnailUrl \|\| photo\.imageUrl/,
    );
    expect(appSource).toMatch(
      /src=\{withAdminPreviewDisplayUrl\([\s\S]*?previewPhoto\.imageUrl \|\|[\s\S]*?previewPhoto\.image\?\.url \|\|[\s\S]*?previewPhoto\.thumbnailUrl/,
    );
    expect(displayUrlSource).toContain("imageMogr2/thumbnail/100x");
    expect(displayUrlSource).toContain("imageMogr2/quality/25");
    expect(displayUrlSource).toContain("/^(data|blob):/i");
  });

  it("supports creating a new topic from admin photo flows", () => {
    expect(appSource).toContain("api.createTopic");
    expect(appSource).toContain("topicDraft");
    expect(appSource).toContain("normalizeTopicId");
    expect(appSource).toContain('aria-label="新增专题"');
    expect(appSource).toContain('placeholder="专题名称，如：编辑精选"');
    expect(appSource).toContain('placeholder="专题 ID（可选，自动生成）"');
    expect(appSource).toContain("setTopicFilter(created.id)");
    expect(appSource).toContain("请先选择或新增专题，再按当前专题选择图片。");
    expect(appSource).not.toContain("untitled-topic");
  });

  it("adds a left sidebar and persisted topic management CRUD page", () => {
    expect(appSource).toContain('className="admin-sidebar"');
    expect(appSource).toContain('aria-label="后台导航"');
    expect(appSource).toContain("<MenuItem key=\"photos\">图片管理</MenuItem>");
    expect(appSource).toContain("<MenuItem key=\"topics\">专题管理</MenuItem>");
    expect(appSource).toContain('title="专题列表"');
    expect(appSource).toContain("isTopicEditorOpen");
    expect(appSource).toContain("api.listTopics");
    expect(appSource).toContain("api.updateTopic");
    expect(appSource).toContain("api.deleteTopic");
    expect(appSource).toContain("先移除该专题下的图片关联后再删除");
    expect(styles).toContain(".admin-layout");
    expect(styles).toContain(".admin-sidebar");
    expect(styles).toContain(".topic-form");
  });
});
