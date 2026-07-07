// Feature: mmmred-streaming-dashboard, Property 37: Round-trip uložení profilu a validace polí
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, User } from "@prisma/client";
import { createSettingsService } from "./settings-service";
import { isOk, isErr } from "@/lib/result";
import { validateProfileField } from "@/lib/validation";

/**
 * Property 37: Round-trip uložení profilu a validace polí.
 *
 * Pro libovolné hodnoty profilu platí, že uložení s platnými hodnotami je
 * perzistuje a opětovné načtení je vrátí (R18.1); uložení s neplatným polem
 * (prázdné povinné pole nebo hodnota > 255 znaků) je odmítnuto, původní
 * hodnoty zůstanou beze změny a nedojde k žádnému zápisu (R18.2).
 *
 * Test pohání `createSettingsService(prisma)` (getProfile/saveProfile) přes
 * minimální in-memory fake PrismaClient (user.findUnique/update). Fake počítá
 * volání `update`, takže lze ověřit „žádný zápis" při neplatném vstupu.
 *
 * **Validates: Requirements 18.1, 18.2**
 */

// ─── Minimal in-memory fake PrismaClient ─────────────────────────────────────

interface FakePrisma extends PrismaClient {
  /** Počet volání user.update — pro ověření „žádný zápis" při neplatném vstupu. */
  __updateCalls: number;
}

const USER_ID = "u-1";

/** Vytvoří fake Prisma s jedním uživatelem, jehož displayName je `initial`. */
function makeFakePrisma(initial: string): FakePrisma {
  const user: User = {
    id: USER_ID,
    displayName: initial,
  } as unknown as User;
  const state = { updateCalls: 0 };

  const fake = {
    user: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return id === user.id ? ({ ...user } as User) : null;
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: { displayName: string };
      }) {
        state.updateCalls += 1;
        if (id !== user.id) throw new Error("not found");
        user.displayName = data.displayName;
        return { ...user } as User;
      },
    },
  } as unknown as FakePrisma;

  Object.defineProperty(fake, "__updateCalls", { get: () => state.updateCalls });
  return fake;
}

// ─── Generátory ──────────────────────────────────────────────────────────────

/** displayName přes celé spektrum délek 0..300 (pokrývá platné i neplatné). */
const displayNameArb = fc.string({ minLength: 0, maxLength: 300 });
/** Platná počáteční hodnota profilu (délka 1–255). */
const validInitialArb = fc
  .string({ minLength: 1, maxLength: 255 })
  .filter(validateProfileField);

describe("Property 37: round-trip uložení profilu a validace polí", () => {
  it("platná hodnota se perzistuje a načtení ji vrátí; neplatná je odmítnuta beze změny", async () => {
    await fc.assert(
      fc.asyncProperty(
        validInitialArb,
        displayNameArb,
        async (initial, candidate) => {
          const prisma = makeFakePrisma(initial);
          const svc = createSettingsService(prisma);

          const valid = validateProfileField(candidate);
          const result = await svc.saveProfile(USER_ID, { displayName: candidate });

          if (valid) {
            // R18.1: platná hodnota je perzistována…
            expect(isOk(result)).toBe(true);
            if (!isOk(result)) return;
            expect(result.value.displayName).toBe(candidate);
            // …a opětovné načtení ji vrátí.
            const reloaded = await svc.getProfile(USER_ID);
            expect(isOk(reloaded)).toBe(true);
            if (!isOk(reloaded)) return;
            expect(reloaded.value.displayName).toBe(candidate);
          } else {
            // R18.2: neplatné pole odmítnuto, žádný zápis…
            expect(isErr(result)).toBe(true);
            if (isErr(result)) {
              expect(result.error.code).toBe("validation");
            }
            expect(prisma.__updateCalls).toBe(0);
            // …a původní hodnoty zůstanou beze změny.
            const reloaded = await svc.getProfile(USER_ID);
            expect(isOk(reloaded)).toBe(true);
            if (!isOk(reloaded)) return;
            expect(reloaded.value.displayName).toBe(initial);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
