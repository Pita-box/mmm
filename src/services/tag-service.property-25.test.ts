// Feature: mmmred-streaming-dashboard, Property 25: Upsert hodnoty štítku normalizuje a deduplikuje
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, TagValue } from "@prisma/client";
import {
  createTagService,
  normalize,
  validateTagValue,
  MIN_TAG_VALUE_LENGTH,
  MAX_TAG_VALUE_LENGTH,
} from "./tag-service";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 25: Upsert hodnoty štítku normalizuje a deduplikuje.
 *
 * Pro libovolnou hodnotu a kategorii platí:
 *  - hodnota o délce 1–100 znaků po odstranění okrajových mezer, která dosud
 *    v kategorii neexistuje (case-insensitive), se uloží a zpřístupní (uloží se
 *    trimovaná podoba + normalizovaný klíč),
 *  - hodnota po trim prázdná nebo > 100 znaků se odmítne (nevznikne Tag_Value),
 *  - hodnota, která se v kategorii již vyskytuje (case/whitespace varianta),
 *    nevytvoří duplikát a přiřadí se existující Tag_Value — počet hodnot
 *    v kategorii nevzroste.
 *
 * **Validates: Requirements 7.2, 7.3, 7.4**
 *
 * Test cílí na `createTagService(prisma).upsertValue` a čisté `normalize` /
 * `validateTagValue`. Používá minimální ručně psaný in-memory fake `PrismaClient`
 * implementující jen to, co `upsertValue` potřebuje:
 *   - `tagValue.findUnique({ where: { category_normalizedValue } })`
 *   - `tagValue.create`
 * Žádná skutečná DB ani Prisma engine.
 */

// ─── Minimální in-memory fake PrismaClient ─────────────────────────────────────

function makeFakePrisma() {
  const rows: TagValue[] = [];
  let seq = 0;

  const key = (category: string, normalizedValue: string) => `${category}\u0000${normalizedValue}`;

  const prisma = {
    tagValue: {
      findUnique: async ({
        where: { category_normalizedValue },
      }: {
        where: { category_normalizedValue: { category: string; normalizedValue: string } };
      }) => {
        const { category, normalizedValue } = category_normalizedValue;
        const wanted = key(category, normalizedValue);
        return rows.find((r) => key(r.category, r.normalizedValue) === wanted) ?? null;
      },
      create: async ({
        data: { category, value, normalizedValue },
      }: {
        data: { category: string; value: string; normalizedValue: string };
      }) => {
        const row: TagValue = { id: `tag-${seq++}`, category, value, normalizedValue };
        rows.push(row);
        return row;
      },
    },
    // introspekce pro asserce (není součástí Prisma API):
    _rows: () => rows,
    _countInCategory: (category: string) => rows.filter((r) => r.category === category).length,
  };

  return prisma;
}

// ─── Generátory ────────────────────────────────────────────────────────────────

const categoryArb = fc.constantFrom(...FIXED_CATEGORIES);

/** Okrajové mezery (mohou být i prázdné) — pro test trim chování. */
const padArb = fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { maxLength: 4 });

/**
 * Platná hodnota: po trim 1–100 znaků. Vnitřní obsah generujeme z viditelných
 * znaků a vnitřních mezer, ale zajistíme, že po trim je neprázdný a ≤ 100.
 */
const validCoreArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .map((s) => s.trim())
  .filter((s) => s.length >= MIN_TAG_VALUE_LENGTH && s.length <= MAX_TAG_VALUE_LENGTH);

/** Hodnota s okrajovými mezerami kolem platného jádra. */
const validRawArb = fc
  .record({ pre: padArb, core: validCoreArb, post: padArb })
  .map(({ pre, core, post }) => ({ raw: `${pre}${core}${post}`, core }));

/** Neplatná hodnota: po trim prázdná, nebo po trim > 100 znaků. */
const invalidRawArb = fc.oneof(
  // prázdná po trim (jen whitespace nebo úplně prázdná)
  fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { maxLength: 8 }),
  // > 100 znaků po trim
  fc.string({ minLength: 101, maxLength: 160 }).filter((s) => s.trim().length > MAX_TAG_VALUE_LENGTH),
);

/** Vytvoří case/whitespace varianty řetězce, které normalizují na stejný klíč. */
function caseWhitespaceVariants(core: string): string[] {
  return [core, core.toUpperCase(), core.toLowerCase(), `  ${core}\t`, `\n${core}  `];
}

// ─── Vlastnosti ──────────────────────────────────────────────────────────────

describe("Property 25: Upsert hodnoty štítku normalizuje a deduplikuje", () => {
  it("platná nová hodnota se uloží trimovaná s normalizovaným klíčem a zpřístupní", async () => {
    await fc.assert(
      fc.asyncProperty(categoryArb, validRawArb, async (category, { raw, core }) => {
        const prisma = makeFakePrisma();
        const svc = createTagService(prisma as unknown as PrismaClient);

        const result = await svc.upsertValue(category, raw);

        expect(isOk(result)).toBe(true);
        if (!isOk(result)) return;

        // Uloží se trimovaná podoba a normalizovaný klíč (trim + lower).
        expect(result.value.value).toBe(core);
        expect(result.value.normalizedValue).toBe(normalize(raw));
        expect(result.value.category).toBe(category);

        // Hodnota je zpřístupněna (právě jeden řádek v kategorii).
        expect(prisma._countInCategory(category)).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("hodnota prázdná po trim nebo > 100 znaků se odmítne a nevznikne Tag_Value", async () => {
    await fc.assert(
      fc.asyncProperty(categoryArb, invalidRawArb, async (category, raw) => {
        const prisma = makeFakePrisma();
        const svc = createTagService(prisma as unknown as PrismaClient);

        // Čisté jádro i perzistentní cesta se shodnou na odmítnutí.
        expect(isErr(validateTagValue(raw))).toBe(true);

        const result = await svc.upsertValue(category, raw);

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.code).toBe("validation");
        }
        // Žádná hodnota nevznikla.
        expect(prisma._rows()).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("opakovaný upsert case/whitespace varianty vrací existující Tag_Value bez duplikace", async () => {
    await fc.assert(
      fc.asyncProperty(categoryArb, validCoreArb, async (category, core) => {
        const prisma = makeFakePrisma();
        const svc = createTagService(prisma as unknown as PrismaClient);

        // První upsert vytvoří hodnotu.
        const first = await svc.upsertValue(category, core);
        expect(isOk(first)).toBe(true);
        if (!isOk(first)) return;
        const originalId = first.value.id;

        const countAfterFirst = prisma._countInCategory(category);
        expect(countAfterFirst).toBe(1);

        // Každá varianta lišící se jen velikostí/okrajovými mezerami musí vrátit
        // tutéž Tag_Value a NEzvýšit počet hodnot v kategorii (R7.4).
        for (const variant of caseWhitespaceVariants(core)) {
          const again = await svc.upsertValue(category, variant);
          expect(isOk(again)).toBe(true);
          if (!isOk(again)) return;

          expect(again.value.id).toBe(originalId);
          expect(prisma._countInCategory(category)).toBe(countAfterFirst);
        }
      }),
      { numRuns: 100 },
    );
  });
});
