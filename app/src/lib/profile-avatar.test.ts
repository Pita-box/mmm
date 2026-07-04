import { describe, expect, it } from "vitest";
import {
  defaultProfileAvatarPercentCrop,
  normalizeProfileAvatarPercentCrop,
  normalizeStoredProfileAvatarCrop,
  profileAvatarPercentCropFromStored,
  profileAvatarPreviewImageStyle,
  profileAvatarStoredFromPercentCrop,
} from "./profile-avatar";

const LANDSCAPE = { width: 2000, height: 1000 };
const PORTRAIT = { width: 1200, height: 1800 };

describe("defaultProfileAvatarPercentCrop", () => {
  it("centers a square crop inside a portrait image", () => {
    expect(defaultProfileAvatarPercentCrop(PORTRAIT)).toEqual({
      unit: "%",
      x: 10,
      y: 23.333333333333336,
      width: 80,
      height: 53.33333333333333,
    });
  });
});

describe("profileAvatarPercentCropFromStored", () => {
  it("restores the new stored format as a square percent crop", () => {
    expect(
      profileAvatarPercentCropFromStored(
        { avatarCropX: 12, avatarCropY: 8, avatarZoom: 60 },
        LANDSCAPE,
      ),
    ).toEqual({
      unit: "%",
      x: 12,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it("keeps backward compatibility with the old center+zoom format", () => {
    expect(
      profileAvatarPercentCropFromStored(
        { avatarCropX: 50, avatarCropY: 35, avatarZoom: 1 },
        PORTRAIT,
      ),
    ).toEqual({
      unit: "%",
      x: 0,
      y: 1.6666666666666714,
      width: 100,
      height: 66.66666666666666,
    });
  });
});

describe("normalizeStoredProfileAvatarCrop", () => {
  it("clamps a stored crop so it stays inside the image", () => {
    expect(
      normalizeStoredProfileAvatarCrop(
        { avatarCropX: 70, avatarCropY: 40, avatarZoom: 90 },
        LANDSCAPE,
      ),
    ).toEqual({
      avatarCropX: 50,
      avatarCropY: 0,
      avatarZoom: 50,
    });
  });
});

describe("profileAvatarStoredFromPercentCrop", () => {
  it("converts a percent crop back to the compact stored format", () => {
    expect(
      profileAvatarStoredFromPercentCrop(
        { x: 5, y: 10, width: 40 },
        PORTRAIT,
      ),
    ).toEqual({
      avatarCropX: 5,
      avatarCropY: 10,
      avatarZoom: 40,
    });
  });
});

describe("normalizeProfileAvatarPercentCrop", () => {
  it("rebuilds a square crop from x/y/width without stretching", () => {
    expect(
      normalizeProfileAvatarPercentCrop(
        { x: 20, y: 12, width: 30, height: 10 },
        PORTRAIT,
      ),
    ).toEqual({
      unit: "%",
      x: 20,
      y: 12,
      width: 30,
      height: 20,
    });
  });
});

describe("profileAvatarPreviewImageStyle", () => {
  it("scales and offsets the preview image from the selected crop", () => {
    expect(
      profileAvatarPreviewImageStyle({
        unit: "%",
        x: 10,
        y: 20,
        width: 50,
        height: 25,
      }),
    ).toEqual({
      left: "-20%",
      top: "-80%",
      width: "200%",
      height: "400%",
    });
  });
});
