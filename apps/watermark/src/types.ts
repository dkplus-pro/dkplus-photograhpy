export interface PhotoExif {
  model: string;
  lens: string;
  focalLength: string;
  exposure: string;
}

export interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  exif: PhotoExif;
}

export interface BrandLogo {
  id: string;
  name: string;
  source: string;
}

export interface WatermarkOptions {
  text: string;
  opacity: number;
  logoSource: string | null;
  exif: PhotoExif;
}

export interface RenderedPhoto {
  id: string;
  fileName: string;
  blob: Blob;
  usedWorker: boolean;
}
