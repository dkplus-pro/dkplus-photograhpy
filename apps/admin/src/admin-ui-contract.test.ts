import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "styles.css"), "utf8");
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("return ("),
);

describe("admin list UI contract", () => {
  it("keeps explicit title, brand, model, and topic filters", () => {
    expect(appSource).toContain('aria-label="按标题筛选"');
    expect(appSource).toContain('aria-label="按品牌筛选"');
    expect(appSource).toContain('aria-label="按机型筛选"');
    expect(appSource).toContain('aria-label="按专题筛选"');
    expect(appSource).toContain("cameraBrands");
    expect(appSource).toContain("cameraModels");
  });

  it("uses split camera-model and lens columns without file-info or exposure copy", () => {
    expect(columnsSource).toContain('title: "型号"');
    expect(columnsSource).toContain('title: "镜头"');
    expect(columnsSource).not.toContain('title: "文件信息"');
    expect(columnsSource).not.toContain('title: "EXIF"');
    expect(columnsSource).not.toContain("imageSummary(");
    expect(columnsSource).not.toContain("formatFileSize(");
    expect(columnsSource).not.toMatch(/mimeType|未知格式|未知大小/);
    expect(columnsSource).not.toMatch(/aperture|shutter|iso|ISO|光圈|快门/);
  });

  it("keeps shooting date independent, sortable, centered, and paginated", () => {
    expect(columnsSource).toContain('title: "拍摄日期"');
    expect(columnsSource).toContain(
      "sorter: (left, right) => takenAtTime(left) - takenAtTime(right)",
    );
    expect(columnsSource).toContain('align: "center"');
    expect(appSource).not.toContain("更新：");
    expect(appSource).not.toContain("y: 560");
    expect(appSource).toContain("scroll={{ x: 1260 }}");
    expect(appSource).toContain("pagination={{");
    expect(appSource).toContain("pageSize: 12");
  });

  it("preserves preview, add/edit/upload modals, and empty feedback", () => {
    expect(appSource).toContain("setPreviewPhoto(photo)");
    expect(appSource).toContain(
      'title={editingId ? "编辑图片记录" : "新增图片记录"}',
    );
    expect(appSource).toContain("visible={isUploadOpen}");
    expect(appSource).toContain(
      'title={previewPhoto ? photoTitle(previewPhoto) : "图片预览"}',
    );
    expect(appSource).toContain(
      "暂无匹配图片，可调整标题、品牌、机型或专题筛选",
    );
  });

  it("uses a stacked editorial image editor with visible helpers and EXIF status", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-shell"');
    expect(appSource).toContain('className="editor-upload-card"');
    expect(appSource).toContain('className="editor-metadata-card"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("等待选择本地图片后读取。");
    expect(appSource).toContain("新增记录必须选择本地图片");
    expect(appSource).toContain("专题会同步写入主专题字段");
    expect(styles).toContain(".editor-modal .arco-modal");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?align-items:\s*stretch;/,
    );
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toContain(".editor-metadata-card");
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(280px/);
  });

  it("keeps dense accessible gallery styling with unified neutral hover and focus tones", () => {
    expect(styles).toMatch(
      /\.photos-table \.arco-table-th,[\s\S]*?\.photos-table \.arco-table-td\s*\{[\s\S]*?padding-top:\s*6px;[\s\S]*?text-align:\s*center;[\s\S]*?vertical-align:\s*middle;/,
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
    expect(styles).toContain(".photo-cell__thumb:hover img");
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
