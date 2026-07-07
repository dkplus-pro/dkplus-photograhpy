export type ExifMetadata = {
  cameraBrand?: string;
  cameraModel?: string;
  lens?: string;
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  width?: number;
  height?: number;
  capturedAt?: string;
};

export type PhotoImage = {
  url: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storage?: "local" | "cos" | "remote";
};

export type PhotoAsset = {
  original: string;
  thumbnail?: string;
  preview?: string;
  alt?: string;
  width?: number;
  height?: number;
};

export type PhotoRecord = {
  id: string;
  title: string;
  description?: string;
  topicId?: string;
  topicIds?: string[];
  location?: string;
  tags?: string[];
  takenAt?: string;
  createdAt: string;
  updatedAt: string;
  image: PhotoImage;
  asset?: PhotoAsset;
  exif?: ExifMetadata;
};

export type TopicRecord = {
  id: string;
  title: string;
  description?: string;
  slug?: string;
  coverPhotoId?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type GalleryData = {
  photos: PhotoRecord[];
  topics: TopicRecord[];
  updatedAt?: string;
};

export type PhotoInput = {
  id?: string;
  title?: string;
  description?: string;
  topicId?: string;
  topicIds?: string[];
  location?: string;
  tags?: string[];
  takenAt?: string;
  image?: Partial<PhotoImage>;
  asset?: Partial<PhotoAsset>;
  exif?: ExifMetadata;
};
