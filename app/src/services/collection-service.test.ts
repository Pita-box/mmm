import { describe, it, expect } from "vitest";
import { validateCollectionNameInput, checkOwnership } from "./collection-service";
import { isOk, isErr } from "@/lib/result";

const NAME_MAX = "c".repeat(100);
const NAME_TOO_LONG = "c".repeat(101);

describe("validateCollectionNameInput", () => {
  it("accepts a name of length 1–100 (R14.1)", () => {
    expect(isOk(validateCollectionNameInput("A"))).toBe(true);
    expect(isOk(validateCollectionNameInput(NAME_MAX))).toBe(true);
    expect(isOk(validateCollectionNameInput("Oblíbené"))).toBe(true);
  });

  it("rejects an empty name with a name field error (R14.6)", () => {
    const r = validateCollectionNameInput("");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("validation");
      if (r.error.code === "validation") expect(r.error.field).toBe("name");
    }
  });

  it("rejects a name longer than 100 chars (R14.6)", () => {
    const r = validateCollectionNameInput(NAME_TOO_LONG);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.code === "validation") expect(r.error.field).toBe("name");
  });
});

describe("checkOwnership", () => {
  it("allows the owner to access their collection (R14.4)", () => {
    const r = checkOwnership({ ownerId: "u1" }, "u1");
    expect(isOk(r)).toBe(true);
  });

  it("denies a different user with forbidden (R14.5)", () => {
    const r = checkOwnership({ ownerId: "u1" }, "u2");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("forbidden");
  });

  it("returns not_found for a missing collection", () => {
    const r = checkOwnership(null, "u1");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("not_found");
  });
});
