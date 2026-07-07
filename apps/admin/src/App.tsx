import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import zhCN from "@arco-design/web-react/es/locale/zh-CN";

import { createApiClient } from "./lib/api";
import { extractExif } from "./lib/exif";
import {
  exifLine,
  formatDate,
  formatFileSize,
  imageSummary,
  photoTitle,
  summarizeUpload,
} from "./lib/format";
import type {
  PhotoPayload,
  PhotoRecord,
  UploadPreview,
} from "./types";

const api = createApiClient();
const TextArea = Input.TextArea;
const { Text } = Typography;

const demoPhotos: PhotoRecord[] = [
  {
    id: "demo-01",
    title: "雨后港口",
    description: "API 未连接时用于预览后台列表的反光街景样片。",
    topicId: "street",
    topicTitle: "街头",
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-02-18T08:00:00.000Z",
    updatedAt: "2026-02-18T08:00:00.000Z",
    image: {
      url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
      fileName: "harbor-after-rain.jpg",
      mimeType: "image/jpeg",
      size: 924_000,
      storage: "remote",
    },
    exif: {
      cameraMake: "Sony",
      cameraModel: "A7 IV",
      lens: "35mm f/1.8",
      aperture: "f/4",
      shutter: "1/250s",
      iso: 200,
    },
  },
  {
    id: "demo-02",
    title: "几何影棚",
    description: "用于检查专题与 EXIF 展示的黑白样片。",
    topicId: "studio",
    topicTitle: "影棚",
    imageUrl:
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-01-04T08:00:00.000Z",
    updatedAt: "2026-01-04T08:00:00.000Z",
    image: {
      url: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=900&q=80",
      fileName: "studio-geometry.jpg",
      mimeType: "image/jpeg",
      size: 1_320_000,
      storage: "remote",
    },
    exif: {
      cameraMake: "Fujifilm",
      cameraModel: "GFX 100S",
      lens: "80mm f/1.7",
      aperture: "f/5.6",
      shutter: "1/125s",
      iso: 100,
    },
  },
];

const emptyPayload: PhotoPayload = {
  title: "",
  description: "",
  topicId: "",
  topicTitle: "",
};

const randomId = () => `${Date.now().toString(36)}-${crypto.randomUUID()}`;

function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [payload, setPayload] = useState<PhotoPayload>(emptyPayload);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<UploadPreview[]>([]);
  const [editorPreview, setEditorPreview] = useState<UploadPreview | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRecord | null>(null);
  const previewsRef = useRef<UploadPreview[]>([]);
  const editorPreviewRef = useRef<UploadPreview | null>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const topicFileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    body: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const pushMessage = (tone: "success" | "error" | "info", text: string) => {
    Message[tone](text);
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      const records = await api.listPhotos();
      setPhotos(records);
    } catch (error) {
      setPhotos(demoPhotos);
      pushMessage(
        "info",
        `API 暂不可用，正在显示演示数据。${error instanceof Error ? error.message : ""}`.trim(),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(
    () => () => {
      for (const preview of previewsRef.current) {
        URL.revokeObjectURL(preview.previewUrl);
      }
      if (editorPreviewRef.current) {
        URL.revokeObjectURL(editorPreviewRef.current.previewUrl);
      }
    },
    [],
  );

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) {
      if (photo.topicId) {
        map.set(photo.topicId, photo.topicTitle || photo.topicId);
      }
      for (const topicId of photo.topicIds ?? []) {
        if (!map.has(topicId)) {
          map.set(topicId, topicId);
        }
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return photos.filter((photo) => {
      const topicIds = [photo.topicId, ...(photo.topicIds ?? [])].filter(
        Boolean,
      );
      const matchesTopic =
        topicFilter === "all" || topicIds.includes(topicFilter);
      const searchable = [
        photo.title,
        photo.description,
        photo.topicTitle,
        photo.topicId,
        photo.location,
        photo.image?.fileName,
        photo.image?.mimeType,
        photo.image?.storage,
        ...(photo.tags ?? []),
        exifLine(photo.exif),
      ]
        .join(" ")
        .toLowerCase();
      return (
        matchesTopic &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [photos, query, topicFilter]);

  const selectedCount = selectedIds.size;
  const stagedSummary = useMemo(() => summarizeUpload(previews), [previews]);
  const visibleCount = filteredPhotos.length;
  const topicCount = topics.length;
  const editingPhoto = useMemo(
    () => photos.find((photo) => photo.id === editingId) ?? null,
    [editingId, photos],
  );
  const editorImageUrl =
    editorPreview?.previewUrl ||
    editingPhoto?.thumbnailUrl ||
    editingPhoto?.imageUrl ||
    "";

  const replaceEditorPreview = (nextPreview: UploadPreview | null) => {
    if (editorPreviewRef.current) {
      URL.revokeObjectURL(editorPreviewRef.current.previewUrl);
    }
    editorPreviewRef.current = nextPreview;
    setEditorPreview(nextPreview);
  };

  const resetEditor = () => {
    setEditingId(null);
    setPayload(emptyPayload);
    replaceEditorPreview(null);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingId(null);
    setPayload(emptyPayload);
    replaceEditorPreview(null);
    setIsEditorOpen(true);
  };

  const editPhoto = (photo: PhotoRecord) => {
    setEditingId(photo.id);
    setPayload({
      title: photo.title || "",
      description: photo.description || "",
      topicId: photo.topicId || photo.topicIds?.[0] || "",
      topicTitle: photo.topicTitle || "",
      exif: photo.exif,
    });
    replaceEditorPreview(null);
    setIsEditorOpen(true);
  };

  const savePhoto = async () => {
    setIsSaving(true);
    try {
      const cleanPayload: PhotoPayload = {
        ...payload,
        title: payload.title?.trim(),
        description: payload.description?.trim(),
        topicId: payload.topicId?.trim(),
        topicTitle: payload.topicTitle?.trim(),
      };

      if (!editingId && !editorPreview) {
        pushMessage("error", "请选择一张本地图片后再创建记录。");
        return;
      }

      if (editingId) {
        const updated = editorPreview
          ? (
              await api.uploadPhoto(
                {
                  ...editorPreview,
                  title: cleanPayload.title || editorPreview.title,
                  description: cleanPayload.description || "",
                  topicId: cleanPayload.topicId || "",
                },
                editingId,
              )
            ).photo
          : await api.updatePhoto(editingId, cleanPayload);
        if (!updated) throw new Error("图片更新后没有返回记录。");
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === editingId ? updated : photo,
          ),
        );
        pushMessage("success", "图片记录已更新");
      } else if (editorPreview) {
        const result = await api.uploadPhoto({
          ...editorPreview,
          title: cleanPayload.title || editorPreview.title,
          description: cleanPayload.description || "",
          topicId: cleanPayload.topicId || "",
        });
        const created = result.photo;
        if (!created) throw new Error("上传后没有返回图片记录。");
        setPhotos((current) => [created, ...current]);
        pushMessage("success", "图片记录已创建");
      }
      resetEditor();
    } catch (error) {
      pushMessage(
        "error",
        error instanceof Error ? error.message : "保存图片记录失败",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const stageEditorFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const preview: UploadPreview = {
      id: randomId(),
      file,
      previewUrl: URL.createObjectURL(file),
      title:
        payload.title?.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      topicId: payload.topicId?.trim() || "",
      description: payload.description?.trim() || "",
      exif: await extractExif(file),
    };
    replaceEditorPreview(preview);
    pushMessage("info", "已选择本地图片并读取 EXIF 预览");
  };

  const stageFiles = async (
    files: FileList | null,
    mode: "quick" | "topic",
  ) => {
    if (!files?.length) return;
    const staged = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        topicId:
          mode === "topic"
            ? payload.topicId?.trim() || "untitled-topic"
            : payload.topicId?.trim() || "",
        description: payload.description?.trim() || "",
        exif: await extractExif(file),
      })),
    );
    setPreviews((current) => [...current, ...staged]);
    setIsUploadOpen(true);
    pushMessage("info", `已暂存 ${staged.length} 个文件并读取 EXIF 预览`);
  };

  const clearPreviews = () => {
    for (const preview of previewsRef.current) {
      URL.revokeObjectURL(preview.previewUrl);
    }
    previewsRef.current = [];
    setPreviews([]);
  };

  const uploadStaged = async () => {
    if (!previews.length) return;
    setIsSaving(true);
    try {
      const uploaded: PhotoRecord[] = [];
      for (const preview of previews) {
        const result = await api.uploadPhoto(preview);
        if (result.photo) uploaded.push(result.photo);
      }
      if (uploaded.length) setPhotos((current) => [...uploaded, ...current]);
      pushMessage("success", `已上传 ${previews.length} 个文件`);
      clearPreviews();
      setIsUploadOpen(false);
    } catch (error) {
      pushMessage("error", error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeletePhoto = (photo: PhotoRecord) => {
    setConfirmAction({
      title: "删除图片记录",
      body: `确认删除“${photoTitle(photo)}”？此操作会移除后台记录，且无法撤销。`,
      async onConfirm() {
        await api.deletePhoto(photo.id);
        setPhotos((current) =>
          current.filter((record) => record.id !== photo.id),
        );
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(photo.id);
          return next;
        });
        pushMessage("success", "图片已删除");
      },
    });
  };

  const requestBatchDelete = () => {
    const ids = [...selectedIds];
    setConfirmAction({
      title: "批量删除图片记录",
      body: `确认删除已选择的 ${ids.length} 条记录？此操作无法撤销。`,
      async onConfirm() {
        await api.batchDelete(ids);
        setPhotos((current) =>
          current.filter((photo) => !ids.includes(photo.id)),
        );
        setSelectedIds(new Set());
        pushMessage("success", "已删除所选记录");
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setIsSaving(true);
    try {
      await confirmAction.onConfirm();
    } catch (error) {
      pushMessage("error", error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsSaving(false);
      setConfirmAction(null);
    }
  };

  const columns: TableColumnProps<PhotoRecord>[] = [
    {
      title: "图片",
      dataIndex: "title",
      width: 320,
      render: (_value, photo) => (
        <div className="photo-cell">
          {photo.thumbnailUrl || photo.imageUrl ? (
            <button
              className="photo-cell__thumb"
              type="button"
              onClick={() => setPreviewPhoto(photo)}
              aria-label={`放大预览：${photoTitle(photo)}`}
            >
              <img
                src={photo.thumbnailUrl || photo.imageUrl}
                alt={photoTitle(photo)}
                loading="lazy"
              />
            </button>
          ) : (
            <span className="photo-cell__empty">无图</span>
          )}
          <div>
            <strong>{photoTitle(photo)}</strong>
            <Text type="secondary" className="line-clamp">
              {photo.description || "暂无描述"}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "专题",
      dataIndex: "topicTitle",
      width: 140,
      render: (_value, photo) =>
        photo.topicTitle || photo.topicId || photo.topicIds?.[0] || "未分组",
    },
    {
      title: "文件信息",
      dataIndex: "image",
      width: 240,
      render: (_value, photo) => (
        <div className="rich-lines">
          <strong>{imageSummary(photo)}</strong>
          <span>{photo.image?.mimeType || "未知格式"}</span>
          <span>
            {photo.image?.size ? formatFileSize(photo.image.size) : "未知大小"}
          </span>
        </div>
      ),
    },
    {
      title: "EXIF / 时间",
      dataIndex: "exif",
      width: 260,
      render: (_value, photo) => (
        <div className="rich-lines">
          <strong>{exifLine(photo.exif)}</strong>
          <span>
            拍摄：
            {formatDate(
              photo.takenAt ?? photo.exif?.capturedAt ?? photo.createdAt,
            )}
          </span>
          <span>更新：{formatDate(photo.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      align: "right",
      render: (_value, photo) => (
        <Space size="mini">
          <Button size="mini" type="outline" onClick={() => editPhoto(photo)}>
            编辑
          </Button>
          <Button
            size="mini"
            status="danger"
            type="outline"
            onClick={() => requestDeletePhoto(photo)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <ConfigProvider locale={zhCN}>
      <main className="admin-shell">
        <header className="admin-header" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">DKPlus 图库后台</p>
            <h1 id="page-title">图片管理</h1>
          </div>
          <Space wrap>
            <Button onClick={() => void refresh()} loading={isLoading}>
              刷新 API
            </Button>
            <Button type="primary" onClick={openCreateEditor}>
              新增图片
            </Button>
            <Button onClick={() => setIsUploadOpen(true)}>上传图片</Button>
          </Space>
        </header>

        <section className="stats-grid" aria-label="图片统计">
          <Card bordered={false}>
            <Statistic title="图片记录" value={photos.length} />
          </Card>
          <Card bordered={false}>
            <Statistic title="筛选结果" value={visibleCount} />
          </Card>
          <Card bordered={false}>
            <Statistic title="专题数量" value={topicCount} />
          </Card>
          <Card bordered={false}>
            <Statistic title="已选择" value={selectedCount} />
          </Card>
        </section>

        <Card className="toolbar-card" bordered={false}>
          <div className="toolbar">
            <Input
              allowClear
              value={query}
              onChange={setQuery}
              placeholder="搜索标题、专题、文件名、标签或 EXIF"
            />
            <Select
              value={topicFilter}
              onChange={(value) => setTopicFilter(String(value))}
              options={[
                { label: "全部专题", value: "all" },
                ...topics.map(([id, title]) => ({ label: title, value: id })),
              ]}
            />
            <Space wrap>
              <Button type="primary" onClick={openCreateEditor}>
                新增图片
              </Button>
              <Button
                status="danger"
                disabled={selectedCount === 0}
                onClick={requestBatchDelete}
              >
                删除所选
              </Button>
            </Space>
          </div>
        </Card>

        <Card
          className="table-card"
          bordered={false}
          title="图片列表"
          extra={<Tag color="arcoblue">{filteredPhotos.length} 条结果</Tag>}
        >
          <Spin loading={isLoading} style={{ width: "100%" }}>
            <Table<PhotoRecord>
              className="photos-table"
              rowKey="id"
              size="mini"
              border={{ wrapper: true, cell: true }}
              tableLayoutFixed
              stripe
              columns={columns}
              data={filteredPhotos}
              noDataElement={<Empty description="暂无匹配图片" />}
              scroll={{ x: 1110, y: 560 }}
              rowSelection={{
                type: "checkbox",
                checkAll: true,
                preserveSelectedRowKeys: true,
                selectedRowKeys: [...selectedIds],
                onChange: (keys) =>
                  setSelectedIds(new Set(keys.map((key) => String(key)))),
              }}
              pagination={{
                pageSize: 8,
                size: "small",
                sizeCanChange: true,
                sizeOptions: [8, 16, 32],
                showTotal: (total, range) =>
                  `显示 ${range[0]}-${range[1]}，共 ${total} 条`,
              }}
            />
          </Spin>
        </Card>

        <Modal
          title={editingId ? "编辑图片记录" : "新增图片记录"}
          visible={isEditorOpen}
          onCancel={resetEditor}
          onOk={() => void savePhoto()}
          confirmLoading={isSaving}
          okText="保存"
          cancelText="取消"
          maskClosable={false}
          unmountOnExit
        >
          <div className="editor-form">
            <div className="span-2">
              <Alert
                type="info"
                content={
                  editingId
                    ? "如需替换图片，请选择新的本地图片；不选择文件时仅保存文字与专题。"
                    : "新增图片需要先选择本地图片，保存时会上传到 /api/uploads。"
                }
              />
            </div>
            <label>
              <span>标题（可选）</span>
              <Input
                value={payload.title || ""}
                onChange={(value) => setPayload({ ...payload, title: value })}
                placeholder="例如：雨后街角"
              />
            </label>
            <label>
              <span>专题（可选）</span>
              <Select
                allowClear
                showSearch
                value={payload.topicId || undefined}
                placeholder="选择已有专题，或留空"
                onChange={(value) => {
                  const topicId = typeof value === "string" ? value : "";
                  const topicTitle =
                    topics.find(([id]) => id === topicId)?.[1] || "";
                  setPayload({ ...payload, topicId, topicTitle });
                }}
                options={topics.map(([id, title]) => ({
                  label: `${title} (${id})`,
                  value: id,
                }))}
              />
            </label>
            <div className="span-2 editor-upload-card">
              <div className="editor-upload-card__header">
                <div>
                  <strong>本地图片</strong>
                  <span>
                    {editorPreview
                      ? editorPreview.file.name
                      : editingId
                        ? "当前图片；可选择新文件替换"
                        : "请选择一张图片"}
                  </span>
                </div>
                <Space wrap>
                  <Button
                    type={editorPreview || editingId ? "outline" : "primary"}
                    onClick={() => editorFileInputRef.current?.click()}
                  >
                    {editorPreview || editingId ? "更换图片" : "选择图片"}
                  </Button>
                  {editorPreview && (
                    <Button onClick={() => replaceEditorPreview(null)}>
                      清除新文件
                    </Button>
                  )}
                </Space>
              </div>
              <input
                ref={editorFileInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void stageEditorFile(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <div className="editor-image-preview">
                {editorImageUrl ? (
                  <img
                    src={editorImageUrl}
                    alt={editorPreview ? "本地图片预览" : "当前图片预览"}
                  />
                ) : (
                  <Empty description="尚未选择本地图片" />
                )}
              </div>
              {editorPreview && (
                <p className="status-line">{exifLine(editorPreview.exif)}</p>
              )}
            </div>
            <label className="span-2">
              <span>描述（可选）</span>
              <TextArea
                value={payload.description || ""}
                onChange={(value) =>
                  setPayload({ ...payload, description: value })
                }
                placeholder="简短说明这张图片的内容"
                autoSize={{ minRows: 3, maxRows: 5 }}
              />
            </label>
          </div>
        </Modal>

        <Modal
          title="上传图片"
          visible={isUploadOpen}
          onCancel={() => setIsUploadOpen(false)}
          onOk={() => void uploadStaged()}
          confirmLoading={isSaving}
          okText="上传暂存文件"
          cancelText="关闭"
          okButtonProps={{ disabled: previews.length === 0 }}
          maskClosable={false}
        >
          <div className="upload-panel">
            <p className="upload-hint">
              先选择文件并在本地读取 EXIF，确认后统一提交到 /api/uploads。
            </p>
            <Space wrap>
              <Button onClick={() => quickFileInputRef.current?.click()}>
                快速选择
              </Button>
              <Button
                type="primary"
                onClick={() => topicFileInputRef.current?.click()}
              >
                按当前专题选择
              </Button>
              <Button disabled={!previews.length} onClick={clearPreviews}>
                清空暂存
              </Button>
            </Space>
            <input
              ref={quickFileInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                void stageFiles(event.currentTarget.files, "quick");
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={topicFileInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                void stageFiles(event.currentTarget.files, "topic");
                event.currentTarget.value = "";
              }}
            />
            <p className="status-line">{stagedSummary}</p>
            <div className="preview-list" aria-live="polite">
              {previews.length ? (
                previews.map((preview) => (
                  <article className="preview-card" key={preview.id}>
                    <img src={preview.previewUrl} alt="" loading="lazy" />
                    <div>
                      <strong>{preview.title}</strong>
                      <span>{preview.topicId || "未指定专题"}</span>
                      <small>{exifLine(preview.exif)}</small>
                    </div>
                  </article>
                ))
              ) : (
                <Empty description="尚未暂存上传文件" />
              )}
            </div>
          </div>
        </Modal>

        <Modal
          title={previewPhoto ? photoTitle(previewPhoto) : "图片预览"}
          visible={Boolean(previewPhoto)}
          onCancel={() => setPreviewPhoto(null)}
          footer={null}
          className="image-preview-modal"
          unmountOnExit
        >
          {previewPhoto && (
            <div className="image-preview-modal__body">
              <img
                src={
                  previewPhoto.imageUrl ||
                  previewPhoto.thumbnailUrl ||
                  previewPhoto.image?.url
                }
                alt={photoTitle(previewPhoto)}
              />
              <div className="rich-lines">
                <strong>{imageSummary(previewPhoto)}</strong>
                <span>{previewPhoto.description || "暂无描述"}</span>
                <span>{exifLine(previewPhoto.exif)}</span>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          title={confirmAction?.title}
          visible={Boolean(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          onOk={() => void runConfirmedAction()}
          confirmLoading={isSaving}
          okText="确认删除"
          cancelText="取消"
          okButtonProps={{ status: "danger" }}
        >
          <p>{confirmAction?.body}</p>
        </Modal>
      </main>
    </ConfigProvider>
  );
}

export default App;
