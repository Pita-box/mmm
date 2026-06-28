// Feature: mmmred-streaming-dashboard, Property 24: Množina kategorií je pevná a neměnná
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isValidCategory } from "./tag-service";
import { FIXED_CATEGORIES } from "@/lib/domain";

/**
 * **Validates: Requirements 7.1, 7.7**
 *
 * Property 24: Množina kategorií je pevná a neměnná.
 *
 * Pro libovolné jméno kategorie platí, že je platné právě tehdy, když patří do
 * pevné množiny šesti kategorií (FIXED_CATEGORIES). Jakýkoli pokus o vytvoření
 * kategorie mimo tuto množinu je odmítnut.
 *
 * Generátor produkuje směs:
 *   1) přesně 6 fixních kategorií (musí být přijaty),
 *   2) libovolných dalších řetězců (musí být odmítnuty, ledaže by náhodou
 *      kolidovaly s fixní množinou — invariant se proto testuje vůči členství,
 *      ne vůči předpokladu „není fixní").
 * V obou případech ověřujeme univerzální vztah:
 *   isValidCategory(name) === FIXED_CATEGORIES.includes(name).
 */

// ─── Generátory ─────────────────────────────────────────────────────────────

/** Jedna z 6 fixních kategorií (kanonická podoba). */
const fixedCategoryArb: fc.Arbitrary<string> = fc.constantFrom(
  ...(FIXED_CATEGORIES as readonly string[]),
);

/** Libovolný řetězec — pokrývá prázdné, mezery, jiná velikost písmen, náhodné. */
const arbitraryStringArb: fc.Arbitrary<string> = fc.string({ maxLength: 60 });

/** Směs fixních kategorií a libovolných řetězců. */
const categoryNameArb: fc.Arbitrary<string> = fc.oneof(
  fixedCategoryArb,
  arbitraryStringArb,
);

describe("Property 24: Množina kategorií je pevná a neměnná", () => {
  it("isValidCategory je true právě tehdy, když jméno patří do FIXED_CATEGORIES", () => {
    const fixedSet = new Set<string>(FIXED_CATEGORIES as readonly string[]);

    fc.assert(
      fc.property(categoryNameArb, (name) => {
        expect(isValidCategory(name)).toBe(fixedSet.has(name));
      }),
      { numRuns: 100 },
    );
  });

  it("přijme každou z 6 fixních kategorií a odmítne jména mimo množinu", () => {
    // Každá fixní kategorie je platná.
    for (const category of FIXED_CATEGORIES) {
      expect(isValidCategory(category)).toBe(true);
    }

    // Libovolný řetězec mimo fixní množinu je odmítnut.
    const fixedSet = new Set<string>(FIXED_CATEGORIES as readonly string[]);
    fc.assert(
      fc.property(arbitraryStringArb, (name) => {
        fc.pre(!fixedSet.has(name));
        expect(isValidCategory(name)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
