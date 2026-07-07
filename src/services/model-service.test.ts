import { describe, it, expect } from "vitest";
import { validateProfileInput } from "./model-service";
import { isOk, isErr } from "@/lib/result";

const NAME_MAX = "n".repeat(100);
const NAME_TOO_LONG = "n".repeat(101);
const BIO_MAX = "b".repeat(1000);
const BIO_TOO_LONG = "b".repeat(1001);

describe("validateProfileInput", () => {
  it("accepts a name of length 1–100 and bio of length 0–1000", () => {
    expect(isOk(validateProfileInput({ name: "A", bio: "" }))).toBe(true);
    expect(isOk(validateProfileInput({ name: NAME_MAX, bio: BIO_MAX }))).toBe(true);
    expect(isOk(validateProfileInput({ name: "Model", bio: "krátké bio" }))).toBe(true);
  });

  it("rejects an empty name with a name field error (R4.2)", () => {
    const r = validateProfileInput({ name: "", bio: "" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("validation");
      if (r.error.code === "validation") expect(r.error.field).toBe("name");
    }
  });

  it("rejects a name longer than 100 chars (R4.2)", () => {
    const r = validateProfileInput({ name: NAME_TOO_LONG, bio: "" });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.code === "validation") expect(r.error.field).toBe("name");
  });

  it("rejects a bio longer than 1000 chars with a bio field error (R4.3)", () => {
    const r = validateProfileInput({ name: "Model", bio: BIO_TOO_LONG });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.code === "validation") expect(r.error.field).toBe("bio");
  });

  it("validates the name before the bio", () => {
    // Obě pole neplatná → hlásí se jako první jméno.
    const r = validateProfileInput({ name: "", bio: BIO_TOO_LONG });
    expect(isErr(r)).toBe(true);
    if (isErr(r) && r.error.code === "validation") expect(r.error.field).toBe("name");
  });
});
