import { describe, expect, it } from "vitest";

import {
  exifLine,
  formatAperture,
  formatExposure,
  formatFileSize,
  imageSummary,
  summarizeUpload,
} from "./format";
import type { UploadPreview } from "../types";

const file = new File(["jpeg"], "sample.jpg", { type: "image/jpeg" });

describe("format helpers", () => {
  it("formats sub-second exposure as a reciprocal shutter speed", () => {
    expect(formatExposure(0.005)).toBe("1/200s");
  });

  it("formats aperture values with f prefix", () => {
    expect(formatAperture(2.8)).toBe("f/2.8");
    expect(formatAperture("4")).toBe("f/4");
  });

  it("summarizes staged uploads and unique topics", () => {
    const previews: UploadPreview[] = [
      {
        id: "a",
        file,
        previewUrl: "blob:a",
        title: "A",
        topicId: "portraits",
        topicIds: ["portraits", "editorial"],
        description: "",
        exif: {},
      },
      {
        id: "b",
        file,
        previewUrl: "blob:b",
        title: "B",
        topicId: "travel",
        topicIds: ["travel"],
        description: "",
        exif: {},
      },
    ];

    expect(summarizeUpload(previews)).toBe("2 个文件已暂存，覆盖 3 个专题");
  });

  it("builds a concise EXIF line", () => {
    expect(
      exifLine({
        cameraMake: "Nikon",
        cameraModel: "Z 8",
        lens: "50mm f/1.8",
        aperture: "f/2",
        shutter: "1/500s",
        iso: 100,
      }),
    ).toBe("Nikon Z 8 · 50mm f/1.8 · f/2 · 1/500s · ISO 100");
  });

  it("formats compact file metadata for table cells", () => {
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
    expect(
      imageSummary({
        id: "p1",
        title: "Frame",
        imageUrl: "https://cdn.example.com/fallback.jpg",
        image: {
          url: "https://cdn.example.com/photos/frame.jpg",
          fileName: "frame.jpg",
          storage: "cos",
        },
      }),
    ).toBe("frame.jpg · cos");
  });
});
