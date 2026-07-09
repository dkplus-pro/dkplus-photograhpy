import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "styles.css"), "utf8");
const displayUrlSource = readFileSync(
  path.join(dirname, "lib/display-url.ts"),
  "utf8",
);
const apiSource = readFileSync(path.join(dirname, "lib/api.ts"), "utf8");
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("const topicColumns"),
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
    expect(appSource).toContain("const adminPageSizeOptions = [10, 20, 50]");
    expect(appSource).toContain("pageSize: photoPageSize");
    expect(appSource).toContain("pageSize: topicPageSize");
    expect(appSource).toContain("sizeCanChange: true");
    expect(appSource).toContain("sizeOptions: adminPageSizeOptions");
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setPhotoPageSize(size)",
    );
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setTopicPageSize(size)",
    );
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
    expect(appSource).toContain("api.uploadPhotos(previews)");
    expect(apiSource).toContain('baseUrl, "/uploads/bulk"');
  });

  it("uses a compact stacked image editor with EXIF status", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-shell"');
    expect(appSource).toContain('className="editor-upload-card"');
    expect(appSource).toContain('className="editor-metadata-card"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("等待选择本地图片后读取。");
    expect(appSource).not.toContain("新增记录必须选择本地图片");
    expect(appSource).not.toContain("先选择文件并在本地读取 EXIF");
    expect(appSource).toContain("可同时关联多个专题");
    expect(styles).toContain(".editor-modal .arco-modal");
    expect(styles).not.toContain(".editor-hero");
    expect(styles).not.toContain(".upload-hint");
    expect(styles).toContain("min-height: 220px;");
    expect(styles).toContain("max-height: 220px;");
    expect(styles).toContain("grid-template-columns: 56px minmax(0, 1fr);");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?align-items:\s*stretch;/,
    );
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toContain(".editor-metadata-card");
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(280px/);
  });

  it("lets relevant modals close by Escape and mask click", () => {
    const modalProps = appSource.match(/maskClosable/g) ?? [];
    const escapeProps = appSource.match(/escToExit/g) ?? [];

    expect(modalProps.length).toBeGreaterThanOrEqual(5);
    expect(escapeProps.length).toBeGreaterThanOrEqual(5);
    expect(appSource).not.toContain("maskClosable={false}");
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
    expect(appSource).toContain('mode="multiple"');
    expect(appSource).not.toContain('aria-label="新增专题"');
    expect(appSource).not.toContain('placeholder="专题名称，如：编辑精选"');
    expect(appSource).not.toContain('placeholder="专题 ID（可选，自动生成）"');
    expect(appSource).not.toContain("setTopicFilter(created.id)");
    expect(appSource).not.toContain("untitled-topic");
  });

  it("adds a left sidebar and persisted topic management CRUD page", () => {
    expect(appSource).toContain('className="admin-sidebar"');
    expect(appSource).toContain('aria-label="后台导航"');
    expect(appSource).toContain('<MenuItem key="photos">图片管理</MenuItem>');
    expect(appSource).toContain('<MenuItem key="topics">专题管理</MenuItem>');
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
    expect(appSource).toContain(
      "onClickMenuItem={(key) => navigateToSection(key as AdminSection)}",
    );
    expect(styles).toContain(".admin-layout");
    expect(styles).toContain(".admin-sidebar");
    expect(styles).toContain(".admin-menu .arco-menu-inner");
    expect(styles).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(styles).toContain("min-height: 44px;");
    expect(styles).toContain(".topic-form");
  });

  it("adds brand management navigation, CRUD UI, and multiple-logo editing", () => {
    expect(appSource).toContain('<MenuItem key="brands">品牌管理</MenuItem>');
    expect(appSource).toContain('brands: "#/brands"');
    expect(appSource).toContain('title="品牌列表"');
    expect(appSource).toContain("isBrandEditorOpen");
    expect(appSource).toContain("api.listBrands");
    expect(appSource).toContain("api.createBrand");
    expect(appSource).toContain("api.updateBrand");
    expect(appSource).toContain("isDerivedBrandId");
    expect(appSource).toContain("api.uploadBrandLogos(selectedFiles)");
    expect(appSource).not.toContain("api.uploadBrandLogos(editingBrandId");
    expect(appSource).toContain("api.deleteBrand");
    expect(apiSource).toContain("uploadBrandLogos");
    expect(apiSource).toContain('baseUrl, "/uploads"');
    expect(apiSource).toContain('body.append("mode", "asset")');
    expect(apiSource).not.toMatch(
      /brands\/\$\{encodeURIComponent\(id\)\}\/logos/,
    );
    expect(appSource).toMatch(/brandLogos|logos|logoDrafts/);
    expect(appSource).toMatch(/添加.*Logo|新增.*Logo|addBrandLogo/i);
    expect(appSource).toMatch(/移除.*Logo|删除.*Logo|removeBrandLogo/i);
    expect(appSource).toContain("上传 Logo 文件");
    expect(appSource).toMatch(/上传图片.*品牌|cameraBrand|auto-sync/i);
    expect(apiSource).toContain('baseUrl, "/uploads/assets"');
    expect(apiSource).not.toContain("appendBrandLogosViaPatch");
    expect(apiSource).not.toContain("/brands/${encodeURIComponent(id)}/logos");
    expect(styles).toContain(".brand-form");
    expect(styles).toMatch(/\.brand-logo|\.brand-card|\.brand-list/);
  });
});
