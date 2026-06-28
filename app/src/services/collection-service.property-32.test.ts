// Feature: mmmred-streaming-dashboard, Property 32: Kolekce je přístupná pouze vlastníkovi
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { checkOwnership } from "./collection-service";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 32: Kolekce je přístupná pouze vlastníkovi.
 *
 * Pro libovolnou kolekci a libovolného uživatele platí, že přístup je povolen
 * právě vlastníkovi (`ownerId === userId`); požadavek jiného uživatele je
 * odepřen se stavem 403 (`forbidden`). Neexistující kolekce (null) → `not_found`.
 *
 * **Validates: Requirements 14.1, 14.4, 14.5**
 *
 * Test pracuje s čistou funkcí `checkOwnership` bez I/O. Generuje náhodné
 * `ownerId` a žádající `userId` z malé domény identifikátorů, aby shoda i
 * neshoda vlastníka nastávaly často, a samostatně ověřuje větev s `null`
 * kolekcí. Vlastnost je biimplikace: výsledek je `ok` právě tehdy, když se
 * identifikátory shodují.
 */

/** Malá doména identifikátorů, aby `ownerId === userId` nastávalo dostatečně často. */
function idArb(): fc.Arbitrary<string> {
  return fc.constantFrom("u1", "u2", "u3", "u4");
}

describe("Property 32: Kolekce je přístupná pouze vlastníkovi", () => {
  it("povolí přístup právě vlastníkovi, jinak forbidden (403)", () => {
    fc.assert(
      fc.property(idArb(), idArb(), (ownerId, userId) => {
        const result = checkOwnership({ ownerId }, userId);

        if (ownerId === userId) {
          // Vlastník → přístup povolen.
          expect(isOk(result)).toBe(true);
        } else {
          // Cizí uživatel → odepřeno se stavem forbidden (HTTP 403).
          expect(isErr(result)).toBe(true);
          if (isErr(result)) {
            expect(result.error.code).toBe("forbidden");
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("neexistující kolekce (null) → not_found nezávisle na uživateli", () => {
    fc.assert(
      fc.property(idArb(), (userId) => {
        const result = checkOwnership(null, userId);

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.code).toBe("not_found");
        }
      }),
      { numRuns: 100 },
    );
  });
});
