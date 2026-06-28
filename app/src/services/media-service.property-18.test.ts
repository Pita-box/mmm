// Feature: mmmred-streaming-dashboard, Property 18: Preview řadí Approved_Media sestupně dle času zveřejnění
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { previewOrder, isApproved, type MediaItemView } from "./media-service";

/**
 * **Validates: Requirements 10.1**
 *
 * Property 18: Pro libovolnou množinu Approved_Media platí, že výstup stránky
 * Preview je seřazen sestupně podle času zveřejnění.
 *
 * Generujeme smíšenou množinu médií (Approved_Media i ne-Approved: naplánovaná,
 * skrytá, publikovaná do budoucna, s null publishAt) a libovolný čas `now`.
 * Ověřujeme, že `previewOrder`:
 *   1) vrací výhradně Approved_Media vůči danému `now`, a
 *   2) je seřazené sestupně dle `publishAt` (každý prvek má publishAt >= následující).
 */

// ─── Generátory ───────────────────────────────────────────────────────────────

/** Datum v širokém rozsahu kolem epochy (ms), aby pokrylo minulost i budoucnost. */
const dateArb: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 4_000_000_000_000 })
  .map((ms) => new Date(ms));

/** Stav média napříč celým stavovým modelem. */
const statusArb: fc.Arbitrary<MediaItemView["status"]> = fc.constantFrom(
  "scheduled",
  "published",
  "hidden",
);

/** Libovolné médium: mix stavů a publishAt (včetně null). */
const mediaArb: fc.Arbitrary<MediaItemView> = fc.record({
  status: statusArb,
  publishAt: fc.option(dateArb, { nil: null }),
});

describe("Property 18: Preview řadí Approved_Media sestupně dle času zveřejnění", () => {
  it("vrací výhradně Approved_Media seřazená sestupně dle času zveřejnění", () => {
    fc.assert(
      fc.property(fc.array(mediaArb, { maxLength: 30 }), dateArb, (items, now) => {
        const ordered = previewOrder(items, now);

        // 1) Výstup obsahuje pouze Approved_Media a právě tolik, kolik jich je.
        const approvedCount = items.filter((i) => isApproved(i, now)).length;
        expect(ordered).toHaveLength(approvedCount);
        for (const m of ordered) {
          expect(isApproved(m, now)).toBe(true);
        }

        // 2) Sestupné řazení: každý prvek má publishAt >= následující.
        for (let k = 0; k + 1 < ordered.length; k++) {
          expect(ordered[k].publishAt!.getTime()).toBeGreaterThanOrEqual(
            ordered[k + 1].publishAt!.getTime(),
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
