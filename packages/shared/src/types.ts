export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand?: TBrand;
};

export type ISODateString = Brand<string, "ISODateString">;
export type PhotoId = Brand<string, "PhotoId">;
export type TopicId = Brand<string, "TopicId">;
export type BrandId = Brand<string, "BrandId">;

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
  capturedAt?: ISODateString;
}

export interface PhotoAsset {
  /** Original object key, relative path, or absolute URL. */
  original: string;
  /** Optional smaller display image key/path/URL. Falls back to original. */
  thumbnail?: string;
  /** Optional modal/preview image key/path/URL. Falls back to thumbnail/original. */
  preview?: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface BrandLogo {
  url: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storage?: "local" | "cos" | "remote";
  alt?: string;
  createdAt?: ISODateString;
}

export interface CameraBrand {
  id: BrandId;
  name: string;
  title?: string;
  aliases?: string[];
  logos: BrandLogo[];
  /** Convenience projection of `logos[].url` for simple selectors. */
  logoUrls: string[];
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export interface Photo {
  id: PhotoId;
  title: string;
  description?: string;
  topicIds: TopicId[];
  takenAt: ISODateString;
  location?: string;
  tags?: string[];
  asset: PhotoAsset;
  exif?: ExifData;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export interface Topic {
  id: TopicId;
  title: string;
  description?: string;
  slug?: string;
  coverPhotoId?: PhotoId;
  sortOrder?: number;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export interface GalleryData {
  photos: Photo[];
  topics: Topic[];
  generatedAt?: ISODateString;
}

export interface ResolvedPhotoUrls {
  original: string;
  thumbnail: string;
  preview: string;
}

export interface ResolvedPhoto extends Photo {
  urls: ResolvedPhotoUrls;
}

export interface TimelineMonthGroup {
  month: string;
  label: string;
  photos: Photo[];
}
