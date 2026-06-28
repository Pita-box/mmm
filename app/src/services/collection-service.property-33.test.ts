// Feature: mmmred-streaming-dashboard, Property 33: Validace názvu kolekce
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, Collection } from "@prisma/client";
import { createCollectionService, validateCollectionNameInput } from "./collection-service";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 33: Validace názvu kolekce.
 *
 * Pro libovolný název platí, že vytvoření kolekce uspěje právě tehdy, když má
 * název délku 1–100 znaků; jinak je odmítnuto a nevznikne žádná kolekce.
 *
 * **Validates: Requirements 14.6**
 */

/**
 * Minimální ruční in-memory fake PrismaClient.
 *
 * Implementuje pouze `collection.create` — přesně to, co Collection_Service
 * při vytvoření kolekce volá. Počítá také počet skutečně vytvořených kolekcí,
 * aby šlo ověřit invariant „při neplatném názvu nevznikne žádná kolekce".
 */
function createFakePrisma(): { prisma: PrismaClient; createdCount: () => number } {
  let seq = 0;
  let created = 0;

  const collection = {
    async create({ data }: { data: { ownerId: string; name: string } }): Promise<Collection> {
      created += 1;
      return {
        id: `c${++seq}`,
        ownerId: data.ownerId,
        name: data.name,
        createdAt: new Date(),
      };
    },
  };

  return {
    prisma: { collection } as unknown as PrismaClient,
    createdCount: () => created,
  };
}

const OWNER_ID = "owner-1";

describe("Property 33: validace názvu kolekce", () => {
  it("vytvoření uspěje právě tehdy, když má název délku 1–100; jinak je odmítnuto a nevznikne kolekce", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Názvy délky 0..120 pokrývají platný rozsah i obě strany hranice.
        fc.string({ minLength: 0, maxLength: 120 }),
        async (name) => {
          const { prisma, createdCount } = createFakePrisma();
          const svc = createCollectionService(prisma);

          const valid = name.length >= 1 && name.length <= 100;
          const result = await svc.createCollection(OWNER_ID, name);

          // Čistá validace a perzistentní operace musí být v souladu.
          expect(isOk(validateCollectionNameInput(name))).toBe(valid);

          if (valid) {
            // Platný název → kolekce vznikne a uloží přesně zadaný název.
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) return;
            expect(result.value.name).toBe(name);
            expect(result.value.ownerId).toBe(OWNER_ID);
            expect(createdCount()).toBe(1);
          } else {
            // Neplatný název → odmítnuto validační chybou a nevznikne kolekce.
            expect(isErr(result)).toBe(true);
            if (!isErr(result)) return;
            expect(result.error.code).toBe("validation");
            expect(createdCount()).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
