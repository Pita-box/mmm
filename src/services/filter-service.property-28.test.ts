// Feature: mmmred-streaming-dashboard, Property 28: Nabídka filtrů odpovídá dostupným hodnotám
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildFilterMenu, type TagValueView } from "./filter-service";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";

/**
 * Property 28: Nabídka filtrů odpovídá dostupným hodnotám.
 *
 * Pro libovolnou množinu Tag_Value platí, že na stránce Search se zobrazí právě
 * ty kategorie, které mají alespoň jednu hodnotu, a každá zobrazená kategorie
 * nabízí všechny své aktuální hodnoty (case-insensitive deduplikované);
 * kategorie bez hodnot se nezobrazí.
 *
 * **Validates: Requirements 11.1, 11.2**
 *
 * Testuje čistou funkci `buildFilterMenu` bez I/O. Invarianty se ověřují
 * strukturálně (množiny kategorií a normalizovaných hodnot, pořadí), nikoli
 * znovuimplementací stejné logiky.
 */

// ─── Generátory ─────────────────────────────────────────────────────────────

const categoryArb: fc.Arbitrary<TagCategory> = fc.constantFrom(
  ...(FIXED_CATEGORIES as readonly TagCategory[]),
);

/**
 * Hodnota štítku z malého slovníku slov s náhodnou velikostí písmen a okolními
 * mezerami. Tím se cíleně vynucují case-insensitive duplicity (např. "blue" vs
 * " BLUE "), které musí `buildFilterMenu` sloučit (normalizace trim+lower).
 */
const valueArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("blue", "green", "red", "tall", "slim", "curly", "short"),
    fc.constantFrom<"lower" | "upper" | "title">("lower", "upper", "title"),
    fc.constantFrom("", " ", "  "),
  )
  .map(([word, casing, pad]) => {
    const cased =
      casing === "upper"
        ? word.toUpperCase()
        : casing === "title"
          ? word[0].toUpperCase() + word.slice(1)
          : word;
    return `${pad}${cased}${pad}`;
  });

const tagValueArb: fc.Arbitrary<TagValueView> = fc.record({
  category: categoryArb,
  value: valueArb,
});

/** Plochá množina Tag_Value — některé kategorie přirozeně zůstanou prázdné. */
const tagValuesArb: fc.Arbitrary<TagValueView[]> = fc.array(tagValueArb, {
  maxLength: 40,
});

const normalize = (raw: string): string => raw.trim().toLowerCase();

describe("Property 28: Nabídka filtrů odpovídá dostupným hodnotám", () => {
  it("zobrazí právě kategorie s ≥1 hodnotou, v pořadí FIXED_CATEGORIES, se všemi (case-insensitive deduplikovanými) hodnotami", () => {
    fc.assert(
      fc.property(tagValuesArb, (tagValues) => {
        const menu = buildFilterMenu(tagValues);

        // Kategorie, které mají v vstupu alespoň jednu hodnotu.
        const categoriesWithValues = new Set<TagCategory>(
          tagValues.map((tv) => tv.category),
        );

        // 1) Menu obsahuje právě kategorie s ≥1 hodnotou (prázdné se vynechají).
        const menuCategories = menu.map((m) => m.category);
        expect(new Set(menuCategories)).toEqual(categoriesWithValues);

        // 2) Žádná kategorie se v menu neopakuje.
        expect(menuCategories).toHaveLength(new Set(menuCategories).size);

        // 3) Kategorie jsou v kanonickém pořadí FIXED_CATEGORIES.
        const expectedOrder = FIXED_CATEGORIES.filter((c) =>
          categoriesWithValues.has(c),
        );
        expect(menuCategories).toEqual(expectedOrder);

        for (const entry of menu) {
          // 4) Každá zobrazená kategorie má neprázdný seznam hodnot.
          expect(entry.values.length).toBeGreaterThan(0);

          const normalizedInput = tagValues
            .filter((tv) => tv.category === entry.category)
            .map((tv) => normalize(tv.value));

          // 5) Hodnoty jsou case-insensitive deduplikované (žádné dvě nesdílí klíč).
          const normalizedMenu = entry.values.map(normalize);
          expect(normalizedMenu).toHaveLength(new Set(normalizedMenu).size);

          // 6) Nabízí všechny aktuální hodnoty kategorie (množinová úplnost).
          expect(new Set(normalizedMenu)).toEqual(new Set(normalizedInput));

          // 7) Pořadí hodnot odpovídá prvnímu výskytu ve vstupu.
          const firstOccurrenceOrder: string[] = [];
          const seen = new Set<string>();
          for (const key of normalizedInput) {
            if (seen.has(key)) continue;
            seen.add(key);
            firstOccurrenceOrder.push(key);
          }
          expect(normalizedMenu).toEqual(firstOccurrenceOrder);
        }
      }),
      { numRuns: 100 },
    );
  });
});
