// Feature: mmmred-streaming-dashboard, Property 21: Trvalé smazání odstraní záznam média
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient } from "@prisma/client";
import { createMediaService } from "./media-service";
import { isOk } from "@/lib/result";

/**
 * Property 21: Trvalé smazání odstraní záznam média.
 *
 * Pro libovolné existující médium platí, že po jeho trvalém smazání záznam
 * média neexistuje a ostatní média zůstávají nedotčená.
 *
 * **Validates: Requirements 9.2, 9.3**
 *
 * Test cílí na perzistentní operaci `createMediaService(prisma).delete`, která
 * provádí hard-delete jediného záznamu média.
 *
 * Použijeme minimální ručně psaný in-memory fake `PrismaClient`, který drží řádky
 * `mediaItem` a implementuje pouze to, co `delete` potřebuje:
 *   - `mediaItem.findUnique`  (čte řádek; null ⇒ not_found)
 *   - `mediaItem.delete`
 * Žádná skutečná DB ani Prisma engine.
 */

// ─── Minimální in-memory fake PrismaClient ─────────────────────────────────────

interface MediaRow {
  readonly id: string;
}

function makeFakePrisma(mediaRows: readonly MediaRow[]) {
  const mediaMap = new Map<string, MediaRow>(mediaRows.map((m) => [m.id, m]));

  const prisma = {
    mediaItem: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => mediaMap.get(id) ?? null,
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        const row = mediaMap.get(id) ?? null;
        mediaMap.delete(id);
        return row;
      },
    },
    _mediaExists: (id: string) => mediaMap.has(id),
  };

  return prisma;
}

// ─── Smart generátor scénáře ───────────────────────────────────────────────────

/**
 * Vygeneruje:
 *  - neprázdnou množinu unikátních médií,
 *  - cílové médium k smazání (vždy existující).
 */
const scenarioArb = fc
  .uniqueArray(fc.nat({ max: 40 }), { minLength: 1, maxLength: 8 })
  .map((ns) => ns.map((n) => `media-${n}`))
  .chain((mediaIds) =>
    fc.record({
      mediaIds: fc.constant(mediaIds),
      target: fc.constantFrom(...mediaIds),
    }),
  );

describe("Property 21: Trvalé smazání odstraní záznam média", () => {
  it("po delete(mediaId) záznam média neexistuje a ostatní média zůstávají", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ mediaIds, target }) => {
        const mediaRows: MediaRow[] = mediaIds.map((id) => ({ id }));
        const fake = makeFakePrisma(mediaRows);
        const service = createMediaService(fake as unknown as PrismaClient);

        const result = await service.delete(target);

        expect(isOk(result)).toBe(true);
        expect(fake._mediaExists(target)).toBe(false);
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
