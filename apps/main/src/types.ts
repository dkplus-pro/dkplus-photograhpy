export interface ExifData {
  cameraMake?: string;
  cameraBrand?: string;
  cameraModel?: string;
  lens?: string;
  lensModel?: string;
  iso?: number;
  aperture?: number | string;
  shutter?: string;
  shutterSpeed?: string;
  focalLength?: string;
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
  alt?: string;
  width?: number;
  height?: number;
}

export interface BrandLogo {
  url: string;
  alt?: string;
}

export interface Brand {
  id: string;
  name: string;
  title?: string;
  aliases?: string[];
  logoUrls?: string[];
  logos?: BrandLogo[];
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
  topics: Topic[];
  photos: ResolvedPhoto[];
  brands: Brand[];
}

export type TabKey = "latest" | "topics" | "timeline";
export type GridStyle = "square";
