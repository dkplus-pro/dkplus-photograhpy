import type {
  ExifData,
  GalleryData,
  ISODateString,
  Photo,
  PhotoAsset,
  PhotoId,
  Topic,
  TopicId,
} from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export type ValidationResult<T> =
  { ok: true; data: T; issues: [] } | { ok: false; issues: ValidationIssue[] };

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isIsoDateString = (value: unknown): value is ISODateString => {
  if (!isNonEmptyString(value) || !ISO_DATE_RE.test(value.trim())) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const issue = (
  path: string,
  message: string,
  code: string,
): ValidationIssue => ({ path, message, code });

const requiredString = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string => {
  const value = input[key];
  if (!isNonEmptyString(value)) {
    issues.push(
      issue(`${path}.${key}`, "Expected a non-empty string.", "invalid_string"),
    );
    return "";
  }

  return value.trim();
};

const optionalString = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined => {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    issues.push(
      issue(
        `${path}.${key}`,
        "Expected a string when provided.",
        "invalid_string",
      ),
    );
    return undefined;
  }

  return value.trim();
};

const optionalPositiveNumber = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  integer = false,
): number | undefined => {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    issues.push(
      issue(
        `${path}.${key}`,
        `Expected a positive ${integer ? "integer" : "number"}.`,
        "invalid_number",
      ),
    );
    return undefined;
  }

  return value;
};

const optionalInteger = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined => {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    issues.push(
      issue(
        `${path}.${key}`,
        "Expected an integer when provided.",
        "invalid_integer",
      ),
    );
    return undefined;
  }

  return value;
};

const optionalIsoDate = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): ISODateString | undefined => {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!isIsoDateString(value)) {
    issues.push(
      issue(
        `${path}.${key}`,
        "Expected an ISO-like date string.",
        "invalid_date",
      ),
    );
    return undefined;
  }

  return value.trim() as ISODateString;
};

const optionalStringArray = (
  input: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string[] | undefined => {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    issues.push(
      issue(`${path}.${key}`, "Expected an array of strings.", "invalid_array"),
    );
    return undefined;
  }

  const values: string[] = [];
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      issues.push(
        issue(
          `${path}.${key}[${index}]`,
          "Expected a non-empty string.",
          "invalid_string",
        ),
      );
      return;
    }
    values.push(entry.trim());
  });

  return values;
};

const assign = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

export const validateExifData = (
  input: unknown,
  path = "$.exif",
): ValidationResult<ExifData> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue(path, "Expected an EXIF object.", "invalid_object")],
    };
  }

  const exif: ExifData = {};
  assign(
    exif,
    "cameraBrand",
    optionalString(input, "cameraBrand", path, issues),
  );
  assign(
    exif,
    "cameraModel",
    optionalString(input, "cameraModel", path, issues),
  );
  assign(exif, "lensModel", optionalString(input, "lensModel", path, issues));
  assign(exif, "iso", optionalPositiveNumber(input, "iso", path, issues, true));
  assign(
    exif,
    "aperture",
    optionalPositiveNumber(input, "aperture", path, issues),
  );
  assign(
    exif,
    "shutterSpeed",
    optionalString(input, "shutterSpeed", path, issues),
  );
  assign(
    exif,
    "focalLengthMm",
    optionalPositiveNumber(input, "focalLengthMm", path, issues),
  );
  assign(
    exif,
    "width",
    optionalPositiveNumber(input, "width", path, issues, true),
  );
  assign(
    exif,
    "height",
    optionalPositiveNumber(input, "height", path, issues, true),
  );
  assign(
    exif,
    "capturedAt",
    optionalIsoDate(input, "capturedAt", path, issues),
  );

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, data: exif, issues: [] };
};

export const validatePhotoAsset = (
  input: unknown,
  path = "$.asset",
): ValidationResult<PhotoAsset> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue(path, "Expected a photo asset object.", "invalid_object")],
    };
  }

  const original = requiredString(input, "original", path, issues);
  const asset: PhotoAsset = { original };
  assign(asset, "thumbnail", optionalString(input, "thumbnail", path, issues));
  assign(asset, "preview", optionalString(input, "preview", path, issues));
  assign(asset, "alt", optionalString(input, "alt", path, issues));
  assign(
    asset,
    "width",
    optionalPositiveNumber(input, "width", path, issues, true),
  );
  assign(
    asset,
    "height",
    optionalPositiveNumber(input, "height", path, issues, true),
  );

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, data: asset, issues: [] };
};

export const validateTopic = (
  input: unknown,
  path = "$.topics[0]",
): ValidationResult<Topic> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue(path, "Expected a topic object.", "invalid_object")],
    };
  }

  const id = requiredString(input, "id", path, issues) as TopicId;
  const title = requiredString(input, "title", path, issues);
  const topic: Topic = { id, title };
  assign(
    topic,
    "description",
    optionalString(input, "description", path, issues),
  );
  assign(topic, "slug", optionalString(input, "slug", path, issues));
  assign(
    topic,
    "coverPhotoId",
    optionalString(input, "coverPhotoId", path, issues) as PhotoId | undefined,
  );
  assign(topic, "sortOrder", optionalInteger(input, "sortOrder", path, issues));
  assign(topic, "createdAt", optionalIsoDate(input, "createdAt", path, issues));
  assign(topic, "updatedAt", optionalIsoDate(input, "updatedAt", path, issues));

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, data: topic, issues: [] };
};

export const validatePhoto = (
  input: unknown,
  path = "$.photos[0]",
): ValidationResult<Photo> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue(path, "Expected a photo object.", "invalid_object")],
    };
  }

  const id = requiredString(input, "id", path, issues) as PhotoId;
  const title = requiredString(input, "title", path, issues);
  const topicIds =
    optionalStringArray(input, "topicIds", path, issues)?.map(
      (topicId) => topicId as TopicId,
    ) ?? [];
  if (!Array.isArray(input.topicIds)) {
    issues.push(
      issue(
        `${path}.topicIds`,
        "Expected topicIds to be present.",
        "missing_required",
      ),
    );
  }

  const takenAt = optionalIsoDate(input, "takenAt", path, issues);
  if (!takenAt) {
    issues.push(
      issue(
        `${path}.takenAt`,
        "Expected takenAt to be present and valid.",
        "missing_required",
      ),
    );
  }

  const assetResult = validatePhotoAsset(input.asset, `${path}.asset`);
  if (!assetResult.ok) {
    issues.push(...assetResult.issues);
  }

  const exifInput = input.exif;
  let exif: ExifData | undefined;
  if (exifInput !== undefined && exifInput !== null) {
    const exifResult = validateExifData(exifInput, `${path}.exif`);
    if (exifResult.ok) {
      exif = exifResult.data;
    } else {
      issues.push(...exifResult.issues);
    }
  }

  const photo: Photo = {
    id,
    title,
    topicIds,
    takenAt: (takenAt ?? "1970-01-01") as ISODateString,
    asset: assetResult.ok ? assetResult.data : { original: "" },
  };

  assign(
    photo,
    "description",
    optionalString(input, "description", path, issues),
  );
  assign(photo, "location", optionalString(input, "location", path, issues));
  assign(photo, "tags", optionalStringArray(input, "tags", path, issues));
  assign(photo, "exif", exif);
  assign(photo, "createdAt", optionalIsoDate(input, "createdAt", path, issues));
  assign(photo, "updatedAt", optionalIsoDate(input, "updatedAt", path, issues));

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, data: photo, issues: [] };
};

export const validateGalleryData = (
  input: unknown,
  path = "$ ".trim(),
): ValidationResult<GalleryData> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        issue(path, "Expected a gallery data object.", "invalid_object"),
      ],
    };
  }

  const photosInput = input.photos;
  const topicsInput = input.topics;
  const photos: Photo[] = [];
  const topics: Topic[] = [];

  if (!Array.isArray(photosInput)) {
    issues.push(
      issue(
        `${path}.photos`,
        "Expected photos to be an array.",
        "invalid_array",
      ),
    );
  } else {
    photosInput.forEach((entry, index) => {
      const result = validatePhoto(entry, `${path}.photos[${index}]`);
      if (result.ok) {
        photos.push(result.data);
      } else {
        issues.push(...result.issues);
      }
    });
  }

  if (!Array.isArray(topicsInput)) {
    issues.push(
      issue(
        `${path}.topics`,
        "Expected topics to be an array.",
        "invalid_array",
      ),
    );
  } else {
    topicsInput.forEach((entry, index) => {
      const result = validateTopic(entry, `${path}.topics[${index}]`);
      if (result.ok) {
        topics.push(result.data);
      } else {
        issues.push(...result.issues);
      }
    });
  }

  const photoIds = new Set<PhotoId>();
  photos.forEach((photo, index) => {
    if (photoIds.has(photo.id)) {
      issues.push(
        issue(
          `${path}.photos[${index}].id`,
          `Duplicate photo id '${photo.id}'.`,
          "duplicate_id",
        ),
      );
    }
    photoIds.add(photo.id);
  });

  const topicIds = new Set<TopicId>();
  topics.forEach((topic, index) => {
    if (topicIds.has(topic.id)) {
      issues.push(
        issue(
          `${path}.topics[${index}].id`,
          `Duplicate topic id '${topic.id}'.`,
          "duplicate_id",
        ),
      );
    }
    topicIds.add(topic.id);
  });

  photos.forEach((photo, photoIndex) => {
    photo.topicIds.forEach((topicId, topicIndex) => {
      if (!topicIds.has(topicId)) {
        issues.push(
          issue(
            `${path}.photos[${photoIndex}].topicIds[${topicIndex}]`,
            `Unknown topic id '${topicId}'.`,
            "unknown_topic",
          ),
        );
      }
    });
  });

  topics.forEach((topic, topicIndex) => {
    if (topic.coverPhotoId && !photoIds.has(topic.coverPhotoId)) {
      issues.push(
        issue(
          `${path}.topics[${topicIndex}].coverPhotoId`,
          `Unknown cover photo id '${topic.coverPhotoId}'.`,
          "unknown_photo",
        ),
      );
    }
  });

  const gallery: GalleryData = { photos, topics };
  assign(
    gallery,
    "generatedAt",
    optionalIsoDate(input, "generatedAt", path, issues),
  );

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, data: gallery, issues: [] };
};

export const assertValidGalleryData = (input: unknown): GalleryData => {
  const result = validateGalleryData(input);
  if (result.ok) {
    return result.data;
  }

  const details = result.issues
    .map((entry) => `${entry.path}: ${entry.message}`)
    .join("; ");
  throw new Error(`Invalid gallery data: ${details}`);
};
