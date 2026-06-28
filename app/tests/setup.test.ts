import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Smoke test for the toolchain: confirms vitest runs and fast-check is wired up
 * with the project convention of >= 100 iterations per property.
 */
describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs fast-check property checks (>= 100 runs)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
