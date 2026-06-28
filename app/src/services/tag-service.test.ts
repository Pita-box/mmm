import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  normalize,
  isValidCategory,
  validateTagValue,
  checkCategoryLimit,
  createTagService,
  MAX_TAG_VALUE_LENGTH,
  MAX_VALUES_PER_CATEGORY,
} from "./tag-service";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { isOk, isErr } from "@/lib/result";

describe("normalize", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalize("  Blue Eyes  ")).toBe("blue eyes");
    expect(normalize("BLONDE")).toBe("blonde");
  });

  it("produces the same key for case/whitespace variants", () => {
    expect(normalize("  RedHead ")).toBe(normalize("redhead"));
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalize("   ")).toBe("");
  });
});

describe("isValidCategory", () => {
  it("accepts each of the 6 fixed categories", () => {
    for (const category of FIXED_CATEGORIES) {
      expect(isValidCategory(category)).toBe(true);
    }
  });

  it("rejects any name outside the fixed set", () => {
    expect(isValidCategory("category")).toBe(false); // case-sensitive
    expect(isValidCategory("Mood")).toBe(false);
    expect(isValidCategory("")).toBe(false);
  });
});

describe("validateTagValue", () => {
  it("accepts a value of length 1..100 after trim and returns trimmed + normalized", () => {
    const r = validateTagValue("  Blue Eyes  ");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.value).toBe("Blue Eyes"); // trimmed, original case
      expect(r.value.normalizedValue).toBe("blue eyes"); // comparison key
    }
  });

  it("accepts the exact boundary length of 100 chars after trim", () => {
    const r = validateTagValue(`  ${"x".repeat(MAX_TAG_VALUE_LENGTH)}  `);
    expect(isOk(r)).toBe(true);
  });

  it("rejects a value that is empty after trim", () => {
    const r = validateTagValue("    ");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("validation");
      if (r.error.code === "validation") expect(r.error.field).toBe("value");
    }
  });

  it("rejects a value longer than 100 chars after trim", () => {
    const r = validateTagValue("x".repeat(MAX_TAG_VALUE_LENGTH + 1));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("validation");
  });
});

describe("checkCategoryLimit", () => {
  it("allows a resulting count within 1..50", () => {
    expect(isOk(checkCategoryLimit(1))).toBe(true);
    expect(isOk(checkCategoryLimit(MAX_VALUES_PER_CATEGORY))).toBe(true);
  });

  it("rejects a resulting count above 50", () => {
    const r = checkCategoryLimit(MAX_VALUES_PER_CATEGORY + 1);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("category_limit_exceeded");
      if (r.error.code === "category_limit_exceeded") {
        expect(r.error.limit).toBe(MAX_VALUES_PER_CATEGORY);
      }
    }
  });
});

describe("removeValueFromMedia (plán 011)", () => {
  it("smaže vazbu a je idempotentní (neexistující vazba není chyba)", async () => {
    let deleteCount = 0;
    const db = {
      mediaTag: {
        deleteMany: async () => {
          deleteCount += 1;
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;
    const service = createTagService(db);

    const r1 = await service.removeValueFromMedia("m1", "t1");
    expect(isOk(r1)).toBe(true);
    expect(deleteCount).toBe(1);

    // Druhé volání (vazba už neexistuje) stále vrací ok (idempotence).
    const r2 = await service.removeValueFromMedia("m1", "t1");
    expect(isOk(r2)).toBe(true);
  });
});
