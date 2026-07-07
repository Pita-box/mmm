import { describe, it, expect } from "vitest";
import { validateNotificationInput } from "./notification-service";
import { isOk, isErr } from "@/lib/result";

const TEXT_MIN = "x";
const TEXT_MAX = "x".repeat(500);
const TEXT_TOO_LONG = "x".repeat(501);

describe("validateNotificationInput", () => {
  it("accepts a text of length 1–500 (R17.1)", () => {
    expect(isOk(validateNotificationInput(TEXT_MIN))).toBe(true);
    expect(isOk(validateNotificationInput(TEXT_MAX))).toBe(true);
    expect(isOk(validateNotificationInput("Vítejte v MMMRED"))).toBe(true);
  });

  it("rejects an empty text with a text field error (R17.3)", () => {
    const r = validateNotificationInput("");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe("validation");
      expect(r.error.field).toBe("text");
    }
  });

  it("rejects a text longer than 500 chars with a text field error (R17.3)", () => {
    const r = validateNotificationInput(TEXT_TOO_LONG);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.field).toBe("text");
  });
});
