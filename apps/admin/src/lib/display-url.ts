const adminThumbnailDisplayTransform = "imageMogr2/thumbnail/100x";
const adminPreviewDisplayTransform = "imageMogr2/quality/25";

const shouldSkipDisplayTransform = (value: string): boolean =>
  !value || /^(data|blob):/i.test(value) || /imageMogr2/i.test(value);

const withAdminDisplayTransform = (
  value: string | undefined,
  transform: string,
): string | undefined => {
  const raw = value?.trim();
  if (!raw || shouldSkipDisplayTransform(raw)) return value;

  const hashIndex = raw.indexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const separator = withoutHash.includes("?")
    ? withoutHash.endsWith("?") || withoutHash.endsWith("&")
      ? ""
      : "&"
    : "?";

  return `${withoutHash}${separator}${transform}${hash}`;
};

export const withAdminThumbnailDisplayUrl = (
  value: string | undefined,
): string | undefined =>
  withAdminDisplayTransform(value, adminThumbnailDisplayTransform);

export const withAdminPreviewDisplayUrl = (
  value: string | undefined,
): string | undefined =>
  withAdminDisplayTransform(value, adminPreviewDisplayTransform);
