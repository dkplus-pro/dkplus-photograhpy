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
const apiSource = readFileSync(join(currentDir, "lib/api.ts"), "utf8");
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("const topicColumns"),
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
    expect(appSource).toContain("const adminPageSizeOptions = [10, 20, 50]");
    expect(appSource).toContain(
      "const [photoPageSize, setPhotoPageSize] = useState(10)",
    );
    expect(appSource).toContain(
      "const [topicPageSize, setTopicPageSize] = useState(10)",
    );
    expect(appSource).toContain("pageSize: photoPageSize");
    expect(appSource).toContain("pageSize: topicPageSize");
    expect(appSource).toContain("showSizeChanger: true");
    expect(appSource).toContain("pageSizeOpts: adminPageSizeOptions");
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setPhotoPageSize(size)",
    );
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setTopicPageSize(size)",
    );
    expect(appSource).toContain("setPreviewPhoto(photo)");
    expect(appSource).toContain("isEditorOpen");
    expect(appSource).toContain("isUploadOpen");
    expect(appSource).toContain("api.uploadPhotos(previews)");
    expect(apiSource).toContain('baseUrl, "/uploads/bulk"');
  });

  it("documents the compact stacked editor and upload modal contract", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-shell"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("等待选择本地图片后读取。");
    expect(appSource).toContain("visible={isUploadOpen}");
    expect(appSource).toContain('className="preview-card"');
    expect(appSource).not.toContain("上方确认图片与 EXIF");
    expect(appSource).not.toContain("保存时继续沿用现有上传与持久化流程");
    expect(appSource).not.toContain("新增记录必须选择本地图片");
    expect(appSource).not.toContain("先选择文件并在本地读取 EXIF");
    expect(styles).not.toContain(".editor-hero");
    expect(styles).not.toContain(".upload-hint");
    expect(styles).toContain(".editor-upload-card");
    expect(styles).toContain(".editor-metadata-card");
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toContain("min-height: 220px;");
    expect(styles).toContain("max-height: 220px;");
    expect(styles).toContain("grid-template-columns: 56px minmax(0, 1fr);");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?align-items:\s*stretch;/,
    );
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(280px/);
  });

  it("allows relevant modals to close with mask clicks and Escape", () => {
    const modalProps = appSource.match(/maskClosable/g) ?? [];
    const escapeProps = appSource.match(/closeOnEsc/g) ?? [];

    expect(modalProps.length).toBeGreaterThanOrEqual(5);
    expect(escapeProps.length).toBeGreaterThanOrEqual(5);
    expect(appSource).not.toContain("maskClosable={false}");
  });

  it("keeps table centering and layout-only styling without component reskinning", () => {
    expect(appSource).toContain('tableLayout="fixed"');
    expect(appSource).toContain('align: "center"');
    expect(appSource).toContain("locale={zh_CN}");
    expect(styles).toContain(".admin-sidebar");
    expect(styles).toContain(".admin-menu");
    expect(styles).toContain(".table-card");
    expect(styles).toContain(".photo-cell__thumb:focus-visible");
    expect(styles).toContain(".photo-cell__thumb:hover img");
    expect(styles).toContain("@media (max-width: 920px)");
    expect(styles).not.toContain("--hover-wash");
    expect(styles).not.toContain("--focus-ring");
    expect(styles).not.toContain("border-radius: 0");
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
    expect(displayUrlSource).toContain("imageMogr2/quality/10");
    expect(displayUrlSource).toContain("/^(data|blob):/i");
  });

  it("keeps admin photo flows limited to existing optional topics", () => {
    expect(appSource).toContain("selectTopics");
    expect(appSource).toContain('placeholder="选择一个或多个专题（可选）"');
    expect(appSource).toContain("请先选择至少一个专题，再按当前专题选择图片。");
    expect(appSource).not.toContain("topicDraft");
    expect(appSource).toContain("multiple");
    expect(appSource).not.toContain('aria-label="新增专题"');
    expect(appSource).not.toContain('placeholder="专题名称，如：编辑精选"');
    expect(appSource).not.toContain('placeholder="专题 ID（可选，自动生成）"');
    expect(appSource).not.toContain("setTopicFilter(created.id)");
    expect(appSource).not.toContain("untitled-topic");
  });

  it("adds a left sidebar and persisted topic management CRUD page", () => {
    expect(appSource).toContain('className="admin-sidebar"');
    expect(appSource).toContain('aria-label="后台导航"');
    expect(appSource).toContain(
      '<Nav.Item itemKey="photos" text="图片管理" />',
    );
    expect(appSource).toContain(
      '<Nav.Item itemKey="topics" text="专题管理" />',
    );
    expect(appSource).toContain('title="专题列表"');
    expect(appSource).toContain("isTopicEditorOpen");
    expect(appSource).toContain("api.listTopics");
    expect(appSource).toContain("api.updateTopic");
    expect(appSource).toContain("api.deleteTopic");
    expect(appSource).toContain("先移除该专题下的图片关联后再删除");
    expect(appSource).toContain(
      "const sectionRoutes: Record<AdminSection, string>",
    );
    expect(appSource).toContain('photos: "#/photos"');
    expect(appSource).toContain('topics: "#/topics"');
    expect(appSource).toContain(
      'window.addEventListener("hashchange", syncSectionFromRoute)',
    );
    expect(appSource).toMatch(
      /onSelect=\{\(\{ itemKey \}\) =>\s*navigateToSection\(itemKey as AdminSection\)\s*\}/,
    );
    expect(styles).toContain(".admin-layout");
    expect(styles).toContain(".admin-sidebar");
    expect(styles).toContain(".admin-menu .semi-navigation-list");
    expect(styles).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(styles).toContain(".topic-form");
  });

  it("adds brand management navigation and editable multiple logos", () => {
    expect(appSource).toContain(
      '<Nav.Item itemKey="brands" text="品牌管理" />',
    );
    expect(appSource).toContain('brands: "#/brands"');
    expect(appSource).toContain('title="品牌列表"');
    expect(appSource).toContain('className="brand-toolbar"');
    expect(appSource).toContain('className="brand-logo-strip"');
    expect(appSource).toContain('className="brand-editor-modal"');
    expect(appSource).toContain('aria-label="品牌资料表单"');
    expect(appSource).toContain("品牌与 Logo 配置");
    expect(appSource).toContain("多个 Logo");
    expect(appSource).toContain("添加 Logo");
    expect(appSource).toContain("上传 Logo 文件");
    expect(appSource).toContain("removeBrandLogo");
    expect(appSource).toContain("api.listBrands");
    expect(appSource).toContain("api.createBrand");
    expect(appSource).toContain("api.updateBrand");
    expect(appSource).toContain("isDerivedBrandId");
    expect(appSource).toContain("api.uploadBrandLogos(selectedFiles)");
    expect(appSource).not.toContain("api.uploadBrandLogos(editingBrandId");
    expect(apiSource).toContain("uploadBrandLogos");
    expect(apiSource).toContain('baseUrl, "/uploads/assets"');
    expect(apiSource).not.toContain("appendBrandLogosViaPatch");
    expect(apiSource).not.toContain("/brands/${encodeURIComponent(id)}/logos");
    expect(apiSource).toContain("logoUrls");
    expect(appSource).toContain("api.deleteBrand");
    expect(appSource).toContain("deriveBrandsFromPhotos");
    expect(appSource).toContain("刷新并同步照片品牌");
    expect(appSource).toContain("EXIF 自动同步");
    expect(apiSource).toContain('baseUrl, "/brands"');
    expect(styles).toContain(".brand-toolbar");
    expect(styles).toContain(".brand-logo-row");
    expect(styles).toContain(".brand-form__hero");
    expect(styles).toContain(".brand-editor-modal .semi-modal");
    expect(styles).toContain("max-height: calc(100vh - 40px);");
    expect(styles).toContain(".brand-editor-modal .semi-modal-body");
    expect(styles).toContain("overflow-y: auto;");
  });
});
