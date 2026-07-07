import type { Photo, TimelineMonthGroup } from "./types.js";

const assertDate = (value: string | Date): Date => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }
  return date;
};

export const formatMonthKey = (value: string | Date): string => {
  const date = assertDate(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const formatMonthLabel = (
  monthKey: string,
  locale = "zh-CN",
): string => {
  const [yearValue, monthValue] = monthKey.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

export const comparePhotosNewestFirst = (left: Photo, right: Photo): number => {
  const byDate =
    assertDate(right.takenAt).getTime() - assertDate(left.takenAt).getTime();
  return byDate === 0
    ? String(left.id).localeCompare(String(right.id))
    : byDate;
};

export const groupPhotosByMonth = (
  photos: readonly Photo[],
  locale = "zh-CN",
): TimelineMonthGroup[] => {
  const groups = new Map<string, Photo[]>();

  [...photos].sort(comparePhotosNewestFirst).forEach((photo) => {
    const month = formatMonthKey(photo.takenAt);
    const group = groups.get(month);
    if (group) {
      group.push(photo);
    } else {
      groups.set(month, [photo]);
    }
  });

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, groupedPhotos]) => ({
      month,
      label: formatMonthLabel(month, locale),
      photos: groupedPhotos,
    }));
};
