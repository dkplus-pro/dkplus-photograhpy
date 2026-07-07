export interface ExifData {
  cameraBrand?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  focalLengthMm?: number;
  width?: number;
  height?: number;
  capturedAt?: string;
}

export interface Topic {
  id: string;
  title: string;
  description?: string;
  slug?: string;
  coverPhotoId?: string;
  sortOrder?: number;
}

export interface PhotoAsset {
  original: string;
  thumbnail?: string;
  preview?: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ResolvedPhoto {
  id: string;
  title: string;
  description?: string;
  topicIds: string[];
  takenAt: string;
  location?: string;
  tags?: string[];
  asset: PhotoAsset;
  urls: {
    original: string;
    thumbnail: string;
    preview: string;
  };
  exif?: ExifData;
}

export interface GalleryPayload {
  generatedAt: string;
  sourceGeneratedAt?: string;
  cdnBaseUrl?: string;
  topics: Topic[];
  photos: ResolvedPhoto[];
}

export type TabKey = "latest" | "topics" | "timeline";
export type GridStyle = "masonry" | "square";
