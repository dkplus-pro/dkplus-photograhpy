export type ExifMetadata = {
  cameraBrand?: string;
  cameraModel?: string;
  lens?: string;
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  capturedAt?: string;
};

export type PhotoImage = {
  url: string;
  key?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storage?: 'local' | 'cos' | 'remote';
};

export type PhotoRecord = {
  id: string;
  title: string;
  description?: string;
  topicId?: string;
  tags?: string[];
  takenAt?: string;
  createdAt: string;
  updatedAt: string;
  image: PhotoImage;
  exif?: ExifMetadata;
};

export type TopicRecord = {
  id: string;
  title: string;
  description?: string;
  coverPhotoId?: string;
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
  tags?: string[];
  takenAt?: string;
  image?: Partial<PhotoImage>;
  exif?: ExifMetadata;
};
