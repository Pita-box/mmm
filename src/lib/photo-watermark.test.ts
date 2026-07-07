import { describe, expect, it } from "vitest";
import {
  PHOTO_WATERMARK_TEXT,
  buildPhotoWatermarkSvg,
  canApplyPhotoWatermark,
  getPhotoWatermarkLayout,
} from "./photo-watermark";

describe("canApplyPhotoWatermark", () => {
  it("accepts supported photo mime types only", () => {
    expect(canApplyPhotoWatermark("image/jpeg")).toBe(true);
    expect(canApplyPhotoWatermark("image/png")).toBe(true);
    expect(canApplyPhotoWatermark("image/webp")).toBe(true);
    expect(canApplyPhotoWatermark("video/mp4")).toBe(false);
  });
});

describe("getPhotoWatermarkLayout", () => {
  it("places the watermark horizontally centered with its box 4% above the bottom", () => {
    expect(getPhotoWatermarkLayout(2000, 1000)).toEqual({
      centerX: 1000,
      centerY: 936,
      fontSizePx: 24,
      paddingX: 22,
      paddingY: 12,
      radius: 14,
    });
  });
});

describe("buildPhotoWatermarkSvg", () => {
  it("renders the configured text with a semi-transparent black background", () => {
    const svg = buildPhotoWatermarkSvg(1200, 800);

    expect(svg).toContain(PHOTO_WATERMARK_TEXT);
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill-opacity="0.32"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('text-anchor="middle"');
  });
});
