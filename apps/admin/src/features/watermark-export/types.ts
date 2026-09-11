export type ExportQuality = "low" | "medium" | "high";

export type WatermarkPosition =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type WatermarkBlendMode = "normal" | "overlay";

export interface WatermarkConfig {
  /** null 表示不加水印，仅按质量导出。 */
  logoSource: string | null;
  logoLabel: string;
  opacity: number;
  blendMode: WatermarkBlendMode;
  position: WatermarkPosition;
  /** 水印宽度占图片宽度的百分比（2–40）。 */
  scalePercent: number;
}

export type ExportSettings = {
  quality: ExportQuality;
  watermark: WatermarkConfig;
};

export interface ExportJob {
  id: string;
  /** 已解析为绝对地址的图片 URL（按导出质量可能已拼接 imageMogr2 参数）。 */
  url: string;
  /** zip 内的基础文件名，不含扩展名。 */
  fileName: string;
}

export interface ExportTaskResult {
  id: string;
  fileName: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  usedWorker: boolean;
}

export interface ExportTaskFailure {
  id: string;
  fileName: string;
  message: string;
}

export interface ExportProgress {
  completed: number;
  total: number;
  currentFileName?: string;
}

export interface ExportOutcome {
  results: ExportTaskResult[];
  failures: ExportTaskFailure[];
  fallbackCount: number;
  concurrency: number;
  cancelled: boolean;
}

export interface DrawWatermarkPayload {
  opacity: number;
  blendMode: WatermarkBlendMode;
  position: WatermarkPosition;
  scalePercent: number;
}
