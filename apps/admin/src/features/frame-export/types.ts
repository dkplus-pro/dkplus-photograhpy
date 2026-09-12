import type { FrameFields } from "./frame-drawing";
import type { ExportQuality } from "../watermark-export/types";

export type { ExportQuality };

/** 导出画框的一张任务：源 URL + 该图专属的 EXIF 文字字段。 */
export interface FrameJob {
  id: string;
  url: string;
  fileName: string;
  fields: FrameFields;
}

/** 全局画框配置（对所有选中图生效）。 */
export interface FrameSettings {
  quality: ExportQuality;
  logo: {
    /** 品牌 logo 图片 URL；无图时回退 mark 文字块。 */
    source: string | null;
    name: string;
    mark: string;
  };
}

export interface FrameTaskResult {
  id: string;
  fileName: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  usedWorker: boolean;
}

export interface FrameTaskFailure {
  id: string;
  fileName: string;
  message: string;
}

export interface FrameOutcome {
  results: FrameTaskResult[];
  failures: FrameTaskFailure[];
  fallbackCount: number;
  concurrency: number;
  cancelled: boolean;
}
