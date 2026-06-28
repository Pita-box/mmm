// Feature: mmmred-streaming-dashboard, Property 27: Filtr — OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = vše
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  apply,
  type FilterSelection,
  type FilterableMediaView,
  type MediaTagView,
} from "./filter-service";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";

/**
 * Property 27: Filtr — OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = vše.
 *
 * Pro libovolnou množinu Approved_Media a libovolný výběr filtrů platí, že vrácená
 * média jsou právě ta, která pro každou kategorii s neprázdným výběrem odpovídají
 * alespoň jedné zvolené hodnotě (OR) a současně splňují všechny kategorie s
 * neprázdným výběrem (AND); je-li výběr zcela prázdný, vrátí se všechna Approved_Media.
 *
 * **Validates: Requirements 11.3, 11.4, 11.5**
 *
 * Test pracuje s čistou funkcí `apply` bez I/O. Generuje výhradně Approved_Media
 * (status "published", publishAt <= now), aby se izolovala filtrovací logika od
 * invariantu viditelnosti (ten ověřuje Property 17). Očekávaná množina shod se
 * počítá nezávisle, naivní referenční implementací nad normalizovanými hodnotami,
 * a porovnává se s výstupem `apply`.
 */

// Malá doména hodnot, aby výběr i štítky často kolidovaly (smysluplné OR/AND).
const VALUE_POOL = ["a", "b", "c", "d"] as const;

/** Normalizace shodná s Filter_Service: trim + lower (case-insensitive porovnání). */
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Generátor jedné hodnoty štítku — občas s okolními mezerami / velkými písmeny. */
function tagValueArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom(...VALUE_POOL),
    fc.constantFrom(...VALUE_POOL).map((v) => `  ${v.toUpperCase()} `),
  );
}

/** Generátor jednoho štítku: kategorie z pevné množiny + hodnota. */
function tagArb(): fc.Arbitrary<MediaTagView> {
  return fc.record({
    category: fc.constantFrom(...FIXED_CATEGORIES),
    value: tagValueArb(),
  });
}

/**
 * Generátor jednoho Approved_Media: vždy published a publishAt v minulosti vůči
 * now=0, plus náhodná sada štítků napříč 6 kategoriemi (i prázdná).
 */
function approvedMediaArb(): fc.Arbitrary<FilterableMediaView> {
  return fc.record({
    status: fc.constant("published" as const),
    publishAt: fc
      .integer({ min: -1_000_000, max: 0 })
      .map((ms) => new Date(ms)),
    tags: fc.array(tagArb(), { maxLength: 8 }),
  });
}

/** Generátor výběru filtrů: pro náhodnou podmnožinu kategorií pole hodnot. */
function selectionArb(): fc.Arbitrary<FilterSelection> {
  return fc
    .record(
      Object.fromEntries(
        FIXED_CATEGORIES.map((category) => [
          category,
          fc.array(tagValueArb(), { maxLength: 3 }),
        ]),
      ) as Record<TagCategory, fc.Arbitrary<string[]>>,
      { requiredKeys: [] },
    )
    .map((sel) => sel as FilterSelection);
}

/**
 * Nezávislá referenční implementace sémantiky filtru (R11.3–R11.5).
 * Kategorie s neprázdným výběrem jsou aktivní; médium projde, pokud pro každou
 * aktivní kategorii má alespoň jeden štítek mezi vybranými hodnotami (OR uvnitř,
 * AND napříč). Bez aktivní kategorie projdou všechna média.
 */
function expectedMatches(
  selection: FilterSelection,
  pool: readonly FilterableMediaView[],
): FilterableMediaView[] {
  const activeCategories = FIXED_CATEGORIES.filter(
    (category) => (selection[category]?.length ?? 0) > 0,
  );

  return pool.filter((media) =>
    activeCategories.every((category) => {
      const selectedValues = new Set(
        (selection[category] ?? []).map(normalizeTag),
      );
      return media.tags.some(
        (tag) =>
          tag.category === category && selectedValues.has(normalizeTag(tag.value)),
      );
    }),
  );
}

describe("Property 27: Filtr — OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = vše", () => {
  it("vrací právě média odpovídající OR-uvnitř/AND-napříč a u prázdného výběru vše", () => {
    fc.assert(
      fc.property(
        selectionArb(),
        fc.array(approvedMediaArb(), { maxLength: 30 }),
        (selection, pool) => {
          const now = new Date(0);

          const result = apply(selection, pool, now);
          const expected = expectedMatches(selection, pool);

          // Výsledek odpovídá nezávisle spočtené očekávané množině (pořadí dle poolu).
          expect(result).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("prázdný výběr vrátí všechna Approved_Media (R11.5)", () => {
    fc.assert(
      fc.property(fc.array(approvedMediaArb(), { maxLength: 30 }), (pool) => {
        const now = new Date(0);

        // Zcela prázdný výběr: žádné klíče.
        expect(apply({}, pool, now)).toEqual(pool);

        // Výběr s pouze prázdnými poli je rovněž „bez omezení".
        const allEmpty = Object.fromEntries(
          FIXED_CATEGORIES.map((category) => [category, []]),
        ) as FilterSelection;
        expect(apply(allEmpty, pool, now)).toEqual(pool);
      }),
      { numRuns: 100 },
    );
  });
});
