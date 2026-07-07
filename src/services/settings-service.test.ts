import { describe, it, expect } from "vitest";
import { validateProfileSave } from "./settings-service";
import { isOk, isErr } from "@/lib/result";

const FIELD_MAX = "x".repeat(255);
const FIELD_TOO_LONG = "x".repeat(256);

describe("validateProfileSave", () => {
  it("accepts a non-empty displayName of length 1–255 (R18.1)", () => {
    expect(isOk(validateProfileSave({ displayName: "A" }))).toBe(true);
    expect(isOk(validateProfileSave({ displayName: "Jana" }))).toBe(true);
    expect(isOk(validateProfileSave({ displayName: FIELD_MAX }))).toBe(true);
  });

  it("rejects an empty required field with a displayName field error (R18.2)", () => {
    const r = validateProfileSave({ displayName: "" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("validation");
      if (r.error.code === "validation") expect(r.error.field).toBe("displayName");
    }
  });

  it("rejects a value longer than 255 chars (R18.2)", () => {
    const r = validateProfileSave({ displayName: FIELD_TOO_LONG });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.code === "validation") {
      expect(r.error.field).toBe("displayName");
    }
  });
});
