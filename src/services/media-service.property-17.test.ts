// Feature: mmmred-streaming-dashboard, Property 17: Viditelná jsou výhradně Approved_Media
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { visibleMedia, isApproved, type MediaItemView } from "./media-service";
import type { MediaStatus } from "@/lib/domain";

/**
 * Property 17: Viditelná jsou výhradně Approved_Media.
 *
 * Pro libovolnou množinu médií v různých stavech a libovolný čas `now` platí, že
 * každý seznam médií dostupný koncovému uživateli (Preview, galerie modelu,
 * výsledky filtrů) obsahuje pouze média ve stavu published s `publishAt <= now`;
 * média naplánovaná do budoucna, skrytá nebo smazaná se nikdy nezobrazí, přičemž
 * skrytá média zůstávají zachována v úložišti (vstupní pole se nemutuje).
 *
 * **Validates: Requirements 8.1, 8.4, 9.1, 10.2, 13.4**
 *
 * Test pokrývá sdílený invariant viditelnosti `visibleMedia` (přímo používaný
 * Preview, galerií modelu i Filter_Service) a jeho elementární predikát
 * `isApproved`. Pracuje s čistými funkcemi bez I/O — žádná DB ani Prisma.
 */

const STATUSES: readonly MediaStatus[] = ["scheduled", "published", "hidden"];

/**
 * Smart generátor jedné položky média.
 *
 * `now` je pevně 0 (epocha); `publishAt` se generuje jako offset v širokém okolí
 * `now` (minulost i budoucnost), plus varianta `null`. Tím se cíleně pokrývají
 * hraniční případy: `publishAt < now`, `== now`, `> now` i chybějící čas.
 */
function mediaItemArb(): fc.Arbitrary<MediaItemView> {
  return fc.record({
    status: fc.constantFrom(...STATUSES),
    publishAt: fc.option(
      // offset v ms vůči now=0: záběr přes minulost (≤ -1), přesně now (0) i budoucnost.
      fc.integer({ min: -1_000_000, max: 1_000_000 }).map((ms) => new Date(ms)),
      { nil: null, freq: 4 },
    ),
  });
}

describe("Property 17: Viditelná jsou výhradně Approved_Media", () => {
  it("vrací výhradně published média s publishAt<=now a nemutuje vstup", () => {
    fc.assert(
      fc.property(fc.array(mediaItemArb(), { maxLength: 50 }), (items) => {
        const now = new Date(0);

        // Hluboká kopie pro pozdější kontrolu nemutace zdroje.
        const snapshot = items.map((it) => ({
          status: it.status,
          publishAt: it.publishAt === null ? null : it.publishAt.getTime(),
        }));

        const visible = visibleMedia(items, now);

        // 1) Každá vrácená položka je Approved_Media: published && publishAt!=null && publishAt<=now.
        for (const item of visible) {
          expect(item.status).toBe("published");
          expect(item.publishAt).not.toBeNull();
          expect(item.publishAt!.getTime()).toBeLessThanOrEqual(now.getTime());
          expect(isApproved(item, now)).toBe(true);
        }

        // 2) Úplnost: žádné Approved_Media se neztratí (výstup == přesně schválené položky).
        const approvedCount = items.filter((it) => isApproved(it, now)).length;
        expect(visible).toHaveLength(approvedCount);

        // 3) Naplánovaná (budoucnost), skrytá ani null-publishAt média se nikdy nevrátí.
        for (const item of visible) {
          expect(item.status).not.toBe("scheduled");
          expect(item.status).not.toBe("hidden");
        }

        // 4) Zdrojové pole se nemutuje — skrytá média v něm zůstávají zachována.
        expect(
          items.map((it) => ({
            status: it.status,
            publishAt: it.publishAt === null ? null : it.publishAt.getTime(),
          })),
        ).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
