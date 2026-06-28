// Feature: mmmred-streaming-dashboard, Property 30: Stránkování donačítá bez překryvů a korektně končí
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { paginate, MAX_BATCH_SIZE } from "./masonry";

/**
 * Property 30: Stránkování donačítá bez překryvů a korektně končí.
 *
 * Pro libovolnou množinu Approved_Media platí, že postupné donačítání po
 * dávkách o velikosti nejvýše 24 pokryje celou množinu bez duplicit a bez
 * mezer, a po vyčerpání dat se donačítání ukončí (indikace konce).
 *
 * Validates: Requirements 12.2, 12.6
 */
describe("Property 30: stránkování donačítá bez překryvů a korektně končí", () => {
  it("postupné donačítání pokryje celou množinu přesně, dávky ≤ 24 a korektně skončí", () => {
    fc.assert(
      fc.property(
        // Libovolné pole položek (unikátní hodnoty, aby šlo přesně ověřit pořadí/duplicity).
        fc.uniqueArray(fc.integer(), { maxLength: 200 }),
        // Velikost dávky — i mimo rozsah; paginate ji sevře do 1..24.
        fc.integer({ min: -5, max: 60 }),
        (items, batchSize) => {
          const collected: number[] = [];
          let cursor = 0;
          let result = paginate(items, batchSize, cursor);
          let steps = 0;
          const maxSteps = items.length + 5; // pojistka proti nekonečné smyčce

          // Iteruj, dokud nedojdeme na konec (done === true).
          // Vždy ověř, že každá dávka má nejvýše 24 položek.
          // eslint-disable-next-line no-constant-condition
          while (true) {
            expect(result.items.length).toBeLessThanOrEqual(MAX_BATCH_SIZE);
            collected.push(...result.items);

            if (result.done) {
              // Po vyčerpání dat: indikace konce a žádný další kurzor.
              expect(result.nextCursor).toBeNull();
              break;
            }

            // Pokud nejsme hotovi, musí existovat platný posunutý kurzor.
            expect(result.nextCursor).not.toBeNull();
            expect(result.nextCursor as number).toBeGreaterThan(cursor);

            cursor = result.nextCursor as number;
            result = paginate(items, batchSize, cursor);

            steps += 1;
            expect(steps).toBeLessThanOrEqual(maxSteps);
          }

          // Posbíraná sekvence je přesně vstup — bez duplicit, bez mezer, pořadí zachováno.
          expect(collected).toEqual([...items]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
