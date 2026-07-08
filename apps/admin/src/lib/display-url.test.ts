import { describe, expect, it } from "vitest";

import {
  withAdminPreviewDisplayUrl,
  withAdminThumbnailDisplayUrl,
} from "./display-url";

describe("admin display URL transforms", () => {
  it("adds reduced thumbnails to list images while preserving query and hash", () => {
    expect(
      withAdminThumbnailDisplayUrl(
        "https://cdn.example.test/photo.jpg?token=list#thumb",
      ),
    ).toBe(
      "https://cdn.example.test/photo.jpg?token=list&imageMogr2/thumbnail/100x#thumb",
    );
  });

  it("adds low quality previews while preserving query and hash", () => {
    expect(
      withAdminPreviewDisplayUrl(
        "https://cdn.example.test/photo.jpg?token=preview#large",
      ),
    ).toBe(
      "https://cdn.example.test/photo.jpg?token=preview&imageMogr2/quality/25#large",
    );
  });

  it("does not transform data URLs, blob URLs, or existing imageMogr2 URLs", () => {
    expect(withAdminThumbnailDisplayUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(withAdminPreviewDisplayUrl("blob:local-preview")).toBe(
      "blob:local-preview",
    );
    expect(
      withAdminPreviewDisplayUrl(
        "https://cdn.example.test/photo.jpg?imageMogr2/quality/80#large",
      ),
    ).toBe("https://cdn.example.test/photo.jpg?imageMogr2/quality/80#large");
  });
});
