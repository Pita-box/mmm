import { describe, it, expect } from "vitest";
import { resolveTelegramRedirect } from "./telegram-service";
import { isOk, isErr } from "@/lib/result";

describe("resolveTelegramRedirect", () => {
  it("redirects to a valid URL, opening in a new tab (R19.1, R19.2)", () => {
    const result = resolveTelegramRedirect("https://t.me/+abc123");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        url: "https://t.me/+abc123",
        target: "_blank",
      });
    }
  });

  it.each([
    ["missing (undefined)", undefined],
    ["missing (null)", null],
    ["empty string", ""],
    ["bare string without scheme", "t.me/group"],
    ["whitespace", "   "],
  ])("reports destination unavailable for %s (R19.3)", (_label, input) => {
    const result = resolveTelegramRedirect(input as string | null | undefined);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("destination_unavailable");
    }
  });
});
