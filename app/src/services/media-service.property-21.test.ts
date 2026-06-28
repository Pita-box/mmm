// Feature: mmmred-streaming-dashboard, Property 21: Trvalé smazání odstraní záznam i z kolekcí
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient } from "@prisma/client";
import { createMediaService } from "./media-service";
import { isOk } from "@/lib/result";

/**
 * Property 21: Trvalé smazání odstraní záznam i z kolekcí.
 *
 * Pro libovolné médium přítomné v libovolných kolekcích platí, že po jeho
 * trvalém smazání záznam média neexistuje a žádná uživatelská kolekce ho již
 * neobsahuje.
 *
 * **Validates: Requirements 9.2, 9.3**
 *
 * Test cílí na perzistentní operaci `createMediaService(prisma).delete`, která
 * provádí hard-delete + úklid kolekcí v jediné transakci:
 *   $transaction([ collectionItem.deleteMany({ mediaId }), mediaItem.delete({ id }) ])
 *
 * Použijeme minimální ručně psaný in-memory fake `PrismaClient`, který drží řádky
 * `mediaItem` a `collectionItem` a implementuje pouze to, co `delete` potřebuje:
 *   - `mediaItem.findUnique`  (čte řádek; null ⇒ not_found)
 *   - `mediaItem.delete`      (vrací "prepared op" — thunk spuštěný v transakci)
 *   - `collectionItem.deleteMany`
 *   - `$transaction`          (spustí pole připravených operací v pořadí)
 * Žádná skutečná DB ani Prisma engine.
 */

// ─── Minimální in-memory fake PrismaClient ─────────────────────────────────────

interface MediaRow {
  readonly id: string;
}

interface CollectionItemRow {
  readonly collectionId: string;
  readonly mediaId: string;
}

/** "Prepared op" — odložená operace, kterou spustí až `$transaction`. */
interface PreparedOp {
  readonly __run: () => unknown;
}

function makeFakePrisma(mediaRows: readonly MediaRow[], collectionItems: readonly CollectionItemRow[]) {
  const mediaMap = new Map<string, MediaRow>(mediaRows.map((m) => [m.id, m]));
  let items: CollectionItemRow[] = [...collectionItems];

  const prisma = {
    mediaItem: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => mediaMap.get(id) ?? null,
      delete: ({ where: { id } }: { where: { id: string } }): PreparedOp => ({
        __run: () => {
          const row = mediaMap.get(id) ?? null;
          mediaMap.delete(id);
          return row;
        },
      }),
    },
    collectionItem: {
      deleteMany: ({ where: { mediaId } }: { where: { mediaId: string } }): PreparedOp => ({
        __run: () => {
          const before = items.length;
          items = items.filter((ci) => ci.mediaId !== mediaId);
          return { count: before - items.length };
        },
      }),
    },
    $transaction: async (ops: readonly PreparedOp[]) => ops.map((op) => op.__run()),
    // pomocné introspekce pro asserce (nejsou součástí Prisma API):
    _mediaExists: (id: string) => mediaMap.has(id),
    _collectionItems: () => items,
  };

  return prisma;
}

// ─── Smart generátor scénáře ───────────────────────────────────────────────────

/**
 * Vygeneruje:
 *  - neprázdnou množinu unikátních médií,
 *  - libovolné členství těchto médií v kolekcích (jedno médium může být ve více
 *    kolekcích a v téže kolekci se může objevit cílové i necílové médium),
 *  - cílové médium k smazání (vždy existující).
 */
const scenarioArb = fc
  .uniqueArray(fc.nat({ max: 40 }), { minLength: 1, maxLength: 8 })
  .map((ns) => ns.map((n) => `media-${n}`))
  .chain((mediaIds) =>
    fc.record({
      mediaIds: fc.constant(mediaIds),
      items: fc.array(
        fc.record({
          collectionId: fc.constantFrom("col-a", "col-b", "col-c"),
          mediaId: fc.constantFrom(...mediaIds),
        }),
        { maxLength: 30 },
      ),
      target: fc.constantFrom(...mediaIds),
    }),
  );

describe("Property 21: Trvalé smazání odstraní záznam i z kolekcí", () => {
  it("po delete(mediaId) záznam média neexistuje a žádná kolekce ho neobsahuje", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ mediaIds, items, target }) => {
        const mediaRows: MediaRow[] = mediaIds.map((id) => ({ id }));
        const fake = makeFakePrisma(mediaRows, items);
        const service = createMediaService(fake as unknown as PrismaClient);

        // Kolik členství NEpatří cílovému médiu — musí zůstat zachováno.
        const survivingItems = items.filter((ci) => ci.mediaId !== target);

        const result = await service.delete(target);

        // Operace uspěje (cílové médium existuje).
        expect(isOk(result)).toBe(true);

        // 1) Záznam média po trvalém smazání neexistuje (R9.2).
        expect(fake._mediaExists(target)).toBe(false);

        // 2) Žádná uživatelská kolekce už cílové médium neobsahuje (R9.3).
        const remaining = fake._collectionItems();
        expect(remaining.some((ci) => ci.mediaId === target)).toBe(false);

        // 3) Úklid je cílený: členství ostatních médií zůstává beze změny.
        expect(remaining).toEqual(survivingItems);

        // 4) Ostatní mediální záznamy se nesmazaly.
        for (const id of mediaIds) {
          if (id !== target) {
            expect(fake._mediaExists(id)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
