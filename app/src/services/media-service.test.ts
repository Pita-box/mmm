import { describe, it, expect } from "vitest";
import {
  classifyType,
  validateUpload,
  isApproved,
  visibleMedia,
  previewOrder,
  canSchedule,
  canPublishNow,
  MAX_UPLOAD_BYTES,
  type MediaItemView,
} from "./media-service";
import { isOk, isErr } from "@/lib/result";

const at = (iso: string): Date => new Date(iso);
const NOW = at("2026-06-01T12:00:00.000Z");

const item = (status: MediaItemView["status"], publishAt: Date | null): MediaItemView => ({
  status,
  publishAt,
});

describe("classifyType", () => {
  it("classifies supported photo MIME types", () => {
    expect(classifyType("image/jpeg")).toBe("photo");
    expect(classifyType("image/png")).toBe("photo");
    expect(classifyType("image/webp")).toBe("photo");
  });

  it("classifies supported video MIME types", () => {
    expect(classifyType("video/mp4")).toBe("video");
    expect(classifyType("video/quicktime")).toBe("video");
    expect(classifyType("video/webm")).toBe("video");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(classifyType("  IMAGE/JPEG  ")).toBe("photo");
    expect(classifyType("Video/MP4")).toBe("video");
  });

  it("returns null for unsupported formats", () => {
    expect(classifyType("image/gif")).toBeNull();
    expect(classifyType("application/pdf")).toBeNull();
    expect(classifyType("")).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a supported format at the size boundary (exactly 500 MB)", () => {
    const r = validateUpload({ mimeType: "image/png", sizeBytes: MAX_UPLOAD_BYTES });
    expect(isOk(r)).toBe(true);
  });

  it("rejects an unsupported format", () => {
    const r = validateUpload({ mimeType: "image/gif", sizeBytes: 10 });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("unsupported_format");
  });

  it("rejects a file that exceeds 500 MB", () => {
    const r = validateUpload({ mimeType: "video/mp4", sizeBytes: MAX_UPLOAD_BYTES + 1 });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("file_too_large");
      if (r.error.code === "file_too_large") expect(r.error.maxBytes).toBe(MAX_UPLOAD_BYTES);
    }
  });
});

describe("isApproved", () => {
  it("is true only for published media whose publishAt has arrived", () => {
    expect(isApproved(item("published", at("2026-06-01T11:00:00.000Z")), NOW)).toBe(true);
    expect(isApproved(item("published", NOW), NOW)).toBe(true); // publishAt == now
  });

  it("is false for future, scheduled, hidden, or null-publishAt media", () => {
    expect(isApproved(item("published", at("2026-06-01T13:00:00.000Z")), NOW)).toBe(false);
    expect(isApproved(item("scheduled", at("2026-06-01T11:00:00.000Z")), NOW)).toBe(false);
    expect(isApproved(item("hidden", at("2026-06-01T11:00:00.000Z")), NOW)).toBe(false);
    expect(isApproved(item("published", null), NOW)).toBe(false);
  });
});

describe("visibleMedia", () => {
  it("returns only Approved_Media and preserves hidden items in the source", () => {
    const items = [
      item("published", at("2026-06-01T11:00:00.000Z")),
      item("scheduled", at("2026-06-01T11:00:00.000Z")),
      item("hidden", at("2026-06-01T11:00:00.000Z")),
      item("published", at("2026-06-01T13:00:00.000Z")),
    ];
    const visible = visibleMedia(items, NOW);
    expect(visible).toHaveLength(1);
    expect(items).toHaveLength(4); // zdroj se nemutuje
  });
});

describe("previewOrder", () => {
  it("sorts Approved_Media descending by publish time", () => {
    const a = item("published", at("2026-06-01T09:00:00.000Z"));
    const b = item("published", at("2026-06-01T11:00:00.000Z"));
    const c = item("published", at("2026-06-01T10:00:00.000Z"));
    const hidden = item("hidden", at("2026-06-01T11:30:00.000Z"));
    const ordered = previewOrder([a, b, c, hidden], NOW);
    expect(ordered).toEqual([b, c, a]);
  });
});

describe("canSchedule", () => {
  it("rejects scheduling of hidden media", () => {
    const r = canSchedule(item("hidden", null), at("2026-06-01T13:00:00.000Z"), NOW);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("invalid_state");
  });

  it("rejects publishAt in the past or equal to now", () => {
    expect(isErr(canSchedule(item("published", null), at("2026-06-01T11:00:00.000Z"), NOW))).toBe(true);
    expect(isErr(canSchedule(item("published", null), NOW, NOW))).toBe(true);
  });

  it("accepts a future publishAt for non-hidden media", () => {
    const r = canSchedule(item("published", null), at("2026-06-01T13:00:00.000Z"), NOW);
    expect(isOk(r)).toBe(true);
  });
});

describe("canPublishNow", () => {
  it("rejects publishing hidden media", () => {
    const r = canPublishNow(item("hidden", null));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("invalid_state");
  });

  it("allows publishing scheduled or published media", () => {
    expect(isOk(canPublishNow(item("scheduled", null)))).toBe(true);
    expect(isOk(canPublishNow(item("published", null)))).toBe(true);
  });
});
