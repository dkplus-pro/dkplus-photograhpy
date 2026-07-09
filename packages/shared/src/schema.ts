export type JsonSchemaPrimitive =
  "array" | "boolean" | "integer" | "number" | "object" | "string";

export interface JsonSchemaLike {
  readonly type: JsonSchemaPrimitive;
  readonly description?: string;
  readonly format?: string;
  readonly minimum?: number;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly items?: JsonSchemaLike;
  readonly additionalProperties?: boolean;
}

const stringSchema = (
  description: string,
  format?: string,
): JsonSchemaLike => ({
  type: "string",
  description,
  ...(format ? { format } : {}),
});

const positiveNumberSchema = (description: string): JsonSchemaLike => ({
  type: "number",
  description,
  minimum: 0,
});

export const exifDataSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cameraBrand: stringSchema("Camera manufacturer"),
    cameraModel: stringSchema("Camera model"),
    lensModel: stringSchema("Lens model"),
    iso: { type: "integer", description: "ISO sensitivity", minimum: 1 },
    aperture: positiveNumberSchema("Aperture f-number"),
    shutterSpeed: stringSchema("Human-readable shutter speed, e.g. 1/250"),
    focalLengthMm: positiveNumberSchema("Focal length in millimeters"),
    width: { type: "integer", description: "Pixel width", minimum: 1 },
    height: { type: "integer", description: "Pixel height", minimum: 1 },
    capturedAt: stringSchema("Capture timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;

export const photoAssetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["original"],
  properties: {
    original: stringSchema(
      "Original object key, relative path, or absolute URL",
    ),
    thumbnail: stringSchema(
      "Thumbnail object key, relative path, or absolute URL",
    ),
    preview: stringSchema("Preview object key, relative path, or absolute URL"),
    alt: stringSchema("Image alt text"),
    width: { type: "integer", description: "Pixel width", minimum: 1 },
    height: { type: "integer", description: "Pixel height", minimum: 1 },
  },
} as const satisfies JsonSchemaLike;

export const brandLogoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url"],
  properties: {
    url: stringSchema("Brand logo URL"),
    key: stringSchema("Storage key"),
    fileName: stringSchema("Original uploaded file name"),
    mimeType: stringSchema("Uploaded file MIME type"),
    size: { type: "integer", description: "File size in bytes", minimum: 0 },
    storage: stringSchema("Storage provider: local, cos, or remote"),
    alt: stringSchema("Logo alt text"),
    createdAt: stringSchema("Logo creation timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;

export const cameraBrandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "logos", "logoUrls"],
  properties: {
    id: stringSchema("Stable camera brand id"),
    name: stringSchema("Camera brand display name"),
    title: stringSchema("Optional UI title"),
    aliases: {
      type: "array",
      description: "Alternative EXIF/display names matched to this brand",
      items: stringSchema("Brand alias"),
    },
    logos: {
      type: "array",
      description: "Editable brand logo objects",
      items: brandLogoSchema,
    },
    logoUrls: {
      type: "array",
      description: "Convenience projection of logos[].url",
      items: stringSchema("Brand logo URL"),
    },
    createdAt: stringSchema("Record creation timestamp", "date-time"),
    updatedAt: stringSchema("Record update timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;

export const photoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "topicIds", "takenAt", "asset"],
  properties: {
    id: stringSchema("Stable photo id"),
    title: stringSchema("Display title"),
    description: stringSchema("Optional display description"),
    topicIds: {
      type: "array",
      description: "Topic ids assigned to the photo",
      items: stringSchema("Topic id"),
    },
    takenAt: stringSchema("Capture/display date", "date-time"),
    location: stringSchema("Optional location label"),
    tags: {
      type: "array",
      description: "Search/filter tags",
      items: stringSchema("Tag"),
    },
    asset: photoAssetSchema,
    exif: exifDataSchema,
    createdAt: stringSchema("Record creation timestamp", "date-time"),
    updatedAt: stringSchema("Record update timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;

export const topicSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title"],
  properties: {
    id: stringSchema("Stable topic id"),
    title: stringSchema("Topic display title"),
    description: stringSchema("Optional topic description"),
    slug: stringSchema("URL-safe topic slug"),
    coverPhotoId: stringSchema("Photo id used as topic cover"),
    sortOrder: { type: "integer", description: "Ascending manual sort order" },
    createdAt: stringSchema("Record creation timestamp", "date-time"),
    updatedAt: stringSchema("Record update timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;

export const galleryDataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["photos", "topics"],
  properties: {
    photos: { type: "array", description: "Photo records", items: photoSchema },
    topics: { type: "array", description: "Topic records", items: topicSchema },
    generatedAt: stringSchema("Static data generation timestamp", "date-time"),
  },
} as const satisfies JsonSchemaLike;
