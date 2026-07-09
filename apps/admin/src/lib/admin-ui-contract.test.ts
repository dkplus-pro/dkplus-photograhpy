import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(dirname, "../App.tsx"), "utf8");
const styles = readFileSync(path.join(dirname, "../styles.css"), "utf8");
const displayUrlSource = readFileSync(
  path.join(dirname, "display-url.ts"),
  "utf8",
);
const apiSource = readFileSync(path.join(dirname, "api.ts"), "utf8");
const columnsSource = appSource.slice(
  appSource.indexOf("const columns"),
  appSource.indexOf("const topicColumns"),
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
    expect(appSource).toContain("const adminPageSizeOptions = [10, 20, 50]");
    expect(appSource).toContain("pageSize: photoPageSize");
    expect(appSource).toContain("pageSize: topicPageSize");
    expect(appSource).toContain("sizeOptions: adminPageSizeOptions");
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setPhotoPageSize(size)",
    );
    expect(appSource).toContain(
      "onPageSizeChange: (size) => setTopicPageSize(size)",
    );
    expect(appSource).toContain("api.uploadPhotos(previews)");
    expect(apiSource).toContain('baseUrl, "/uploads/bulk"');
  });

  it("keeps the redesigned editor modal compact with stacked upload preview plus metadata sections", () => {
    expect(appSource).toContain('className="editor-modal"');
    expect(appSource).toContain('className="editor-upload-card"');
    expect(appSource).toContain('className="editor-metadata-card"');
    expect(appSource).toContain('aria-label="图片资料表单"');
    expect(appSource).toContain('aria-label="图片上传与预览"');
    expect(appSource).toContain('aria-label="图片元数据"');
    expect(appSource).toContain("EXIF 状态");
    expect(appSource).toContain("选择新文件后会刷新 EXIF");
    expect(appSource).toContain("可同时关联多个专题");
    expect(appSource).not.toContain("新增记录必须选择本地图片");
    expect(appSource).not.toContain("先选择文件并在本地读取 EXIF");
    expect(styles).toContain(".editor-modal .arco-modal");
    expect(styles).not.toContain(".editor-hero");
    expect(styles).not.toContain(".upload-hint");
    expect(styles).toContain(".editor-exif-status");
    expect(styles).toContain("min-height: 220px;");
    expect(styles).toContain("max-height: 220px;");
    expect(styles).toContain("grid-template-columns: 56px minmax(0, 1fr);");
    expect(styles).toMatch(
      /\.editor-form\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?align-items:\s*stretch;/,
    );
    expect(styles).not.toMatch(/grid-template-columns:\s*minmax\(280px/);
  });

  it("lets relevant modals close by Escape and mask click", () => {
    const modalProps = appSource.match(/maskClosable/g) ?? [];
    const escapeProps = appSource.match(/escToExit/g) ?? [];

    expect(modalProps.length).toBeGreaterThanOrEqual(5);
    expect(escapeProps.length).toBeGreaterThanOrEqual(5);
    expect(appSource).not.toContain("maskClosable={false}");
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
    expect(appSource).toContain("const arcoTheme");
    expect(appSource).toContain('primaryColor: "#141414"');
    expect(appSource).toContain("theme={arcoTheme}");
    expect(styles).toContain("--arcoblue-6: 20, 20, 20;");
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

  it("adds brand management navigation and editable multiple logos", () => {
    expect(appSource).toContain('<MenuItem key="brands">品牌管理</MenuItem>');
    expect(appSource).toContain('brands: "#/brands"');
    expect(appSource).toContain('title="品牌列表"');
    expect(appSource).toContain('className="brand-toolbar"');
    expect(appSource).toContain('className="brand-logo-strip"');
    expect(appSource).toContain('className="brand-editor-modal"');
    expect(appSource).toContain('aria-label="品牌资料表单"');
    expect(appSource).toContain('品牌与 Logo 配置');
    expect(appSource).toContain('多个 Logo');
    expect(appSource).toContain('添加 Logo');
    expect(appSource).toContain('上传 Logo 文件');
    expect(appSource).toContain('removeBrandLogo');
    expect(appSource).toContain('api.listBrands');
    expect(appSource).toContain('api.createBrand');
    expect(appSource).toContain('api.updateBrand');
    expect(apiSource).toContain('uploadBrandLogos');
    expect(apiSource).toContain('baseUrl, "/uploads"');
    expect(apiSource).toContain('body.append("mode", "asset")');
    expect(apiSource).not.toMatch(/brands\/\$\{encodeURIComponent\(id\)\}\/logos/);
    expect(apiSource).toContain('logoUrls');
    expect(appSource).toContain('api.deleteBrand');
    expect(appSource).toContain('deriveBrandsFromPhotos');
    expect(appSource).toContain('刷新并同步照片品牌');
    expect(appSource).toContain('EXIF 自动同步');
    expect(apiSource).toContain('baseUrl, "/brands"');
    expect(styles).toContain('.brand-toolbar');
    expect(styles).toContain('.brand-logo-row');
    expect(styles).toContain('.brand-form__hero');
    expect(styles).toContain('.brand-editor-modal .arco-modal');
  });

});
