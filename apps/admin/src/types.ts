export type PhotoStatus = "draft" | "published" | "archived";

export interface PhotoExif {
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  iso?: number;
  aperture?: string;
  shutter?: string;
  focalLength?: string;
  capturedAt?: string;
}

export interface PhotoRecord {
  id: string;
  title?: string;
  description?: string;
  topicId?: string;
  topicTitle?: string;
  status?: PhotoStatus;
  imageUrl: string;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  exif?: PhotoExif;
}

export interface PhotoPayload {
  title?: string;
  description?: string;
  topicId?: string;
  topicTitle?: string;
  status?: PhotoStatus;
  imageUrl?: string;
  exif?: PhotoExif;
}

export interface UploadPreview {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  topicId: string;
  description: string;
  exif: PhotoExif;
  error?: string;
}

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  text: string;
}
