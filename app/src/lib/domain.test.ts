import { describe, it, expect } from "vitest";
import { FIXED_CATEGORIES, PUBLIC_PATHS, type TagCategory } from "./domain";
import type { AuthError, UploadError, MediaError, TagError, DriveError } from "./errors";

describe("domain constants", () => {
  it("has exactly 6 fixed tag categories in canonical order", () => {
    expect(FIXED_CATEGORIES).toEqual([
      "Category",
      "Face type",
      "Body type",
      "Body hair",
      "Hair color",
      "Clothes",
    ]);
    expect(FIXED_CATEGORIES).toHaveLength(6);
  });

  it("has no duplicate categories", () => {
    expect(new Set(FIXED_CATEGORIES).size).toBe(FIXED_CATEGORIES.length);
  });

  it("exposes the public (unauthenticated) paths", () => {
    expect(PUBLIC_PATHS).toEqual([
      "/signin",
      "/signup",
      "/paywall",
      "/api/webhooks/telegram",
<<<<<<< HEAD
      "/api/cron/scheduler",
=======
>>>>>>> 2c944f5 (Edit diaglog of telegram-bot-service.ts)
    ]);
  });
});

describe("error type shapes", () => {
  // These are compile-time assertions exercised at runtime to ensure the
  // discriminated unions are constructible and narrow on `code`.
  it("constructs representative error variants", () => {
    const category: TagCategory = "Category";
    const errors: Array<AuthError | UploadError | MediaError | TagError | DriveError> = [
      { code: "invalid_credentials", message: "no" },
      { code: "validation", field: "email", message: "bad" },
      { code: "unsupported_format", message: "nope" },
      { code: "file_too_large", maxBytes: 500_000_000, message: "too big" },
      { code: "invalid_state", message: "bad transition" },
      { code: "invalid_category", message: `unknown ${category}` },
      { code: "token_expired", message: "expired" },
    ];
    expect(errors.every((e) => typeof e.code === "string")).toBe(true);
  });
});
