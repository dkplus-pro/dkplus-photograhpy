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

export interface PhotoImage {
  url: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storage?: "local" | "cos" | "remote";
}

export interface PhotoRecord {
  id: string;
  title?: string;
  description?: string;
  topicId?: string;
  topicTitle?: string;
  topicIds?: string[];
  tags?: string[];
  location?: string;
  status?: PhotoStatus;
  imageUrl: string;
  image?: PhotoImage;
  thumbnailUrl?: string;
  takenAt?: string;
  createdAt?: string;
  updatedAt?: string;
  exif?: PhotoExif;
}

export interface PhotoPayload {
  title?: string;
  description?: string;
  topicId?: string;
  topicTitle?: string;
  topicIds?: string[];
  status?: PhotoStatus;
  imageUrl?: string;
  exif?: PhotoExif;
}

export interface BrandLogoRecord {
  id?: string;
  url: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storage?: "local" | "cos" | "remote";
  label?: string;
  alt?: string;
  createdAt?: string;
}

export interface BrandRecord {
  id: string;
  name: string;
  title?: string;
  displayName?: string;
  aliases?: string[];
  logos: BrandLogoRecord[];
  logoUrls?: string[];
  photoCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandPayload {
  id?: string;
  name: string;
  title?: string;
  aliases?: string[];
  logoUrls?: string[];
  logos: BrandLogoRecord[];
}

export interface UploadPreview {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  topicId: string;
  topicIds: string[];
  description: string;
  exif: PhotoExif;
  error?: string;
}

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  text: string;
}
