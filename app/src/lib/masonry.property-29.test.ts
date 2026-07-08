// Feature: mmmred-streaming-dashboard, Property 29: Počet sloupců masonry podle šířky viewportu
import { describe, it } from "vitest";
import fc from "fast-check";
import { columnsForWidth, SMALL_BREAKPOINT, LARGE_BREAKPOINT } from "./masonry";

/**
 * Property 29: Počet sloupců masonry podle šířky viewportu.
 *
 * Pro libovolnou šířku viewportu platí, že počet sloupců je:
 *   - 2 pro šířku do 800 px (width <= 800),
 *   - 3 až 4 pro šířku 800–1200 px (800 < width <= 1200),
 *   - 5 pro šířku nad 1200 px (width > 1200).
 *
 * Hranice: SMALL = 800, LARGE = 1200.
 *
 * Validates: Requirements 12.1
 */

/**
 * Generátor šířek pokrývající celý vstupní prostor:
 *   - libovolná celá čísla (včetně záporných),
 *   - přesně hraniční hodnoty 600 a 1200 a jejich okolí (±1),
 *   - zlomkové hodnoty v okolí hranic.
 */
const widthArb = fc.oneof(
  fc.integer({ min: -2000, max: 4000 }),
  fc.constantFrom(
    SMALL_BREAKPOINT - 1,
    SMALL_BREAKPOINT,
    SMALL_BREAKPOINT + 1,
    LARGE_BREAKPOINT - 1,
    LARGE_BREAKPOINT,
    LARGE_BREAKPOINT + 1,
    0,
    -1,
  ),
  fc.double({ min: -100, max: 2000, noNaN: true }),
);

describe("Property 29: Počet sloupců masonry podle šířky viewportu", () => {
  it("počet sloupců odpovídá pásmu šířky viewportu", () => {
    fc.assert(
      fc.property(widthArb, (width) => {
        const cols = columnsForWidth(width);

        if (width <= SMALL_BREAKPOINT) {
          // Do 800 px (včetně záporných / nulových) → právě 2 sloupce.
          return cols === 2;
        }

        if (width > LARGE_BREAKPOINT) {
          // Nad 1200 px → právě 5 sloupců.
          return cols === 5;
        }

        // Prostřední pásmo (800, 1200] → 3 až 4 sloupce.
        return cols === 3 || cols === 4;
      }),
      { numRuns: 100 },
    );
  });
});
