// Feature: mmmred-streaming-dashboard, Property 14: Neplatný vstup profilu zachová původní stav
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, ModelProfile } from "@prisma/client";
import { createModelService } from "./model-service";
import { isOk, isErr } from "@/lib/result";
import { validateModelName, validateBio } from "@/lib/validation";

/**
 * Property 14: Neplatný vstup profilu zachová původní stav.
 *
 * Pro libovolné jméno délky 0 nebo > 100 znaků nebo bio délky > 1000 znaků platí:
 *  - operace vytvoření je odmítnuta (nevznikne žádný profil), a
 *  - operace editace existujícího profilu zachová původní hodnoty beze změny
 *    (vrátí chybu a `getProfile` stále vrací nezměněné hodnoty).
 *
 * Test pohání službu `createModelService(prisma)` přes minimální in-memory fake
 * PrismaClient (modelProfile.create/findUnique/update). Fake navíc počítá volání
 * `create`/`update`, takže lze ověřit, že při neplatném vstupu nedojde k žádnému
 * zápisu do perzistence.
 *
 * **Validates: Requirements 4.2, 4.3, 4.5**
 */

// ─── Minimal in-memory fake PrismaClient ─────────────────────────────────────

interface FakePrisma extends PrismaClient {
  /** Aktuální obsah úložiště profilů. */
  __profiles: ModelProfile[];
  /** Počet volání modelProfile.create — pro ověření „žádný zápis". */
  __createCalls: number;
  /** Počet volání modelProfile.update — pro ověření „žádná změna". */
  __updateCalls: number;
}

function makeFakePrisma(seed: ModelProfile[] = []): FakePrisma {
  const store: ModelProfile[] = seed.map((p) => ({ ...p }));
  const state = { createCalls: 0, updateCalls: 0 };
  let nextId = store.length + 1;

  const fake = {
    modelProfile: {
      async create({ data }: { data: { name: string; bio: string } }) {
        state.createCalls += 1;
        const created: ModelProfile = {
          id: `gen-${nextId++}`,
          name: data.name,
          bio: data.bio,
          driveFolderId: null,
          coverMediaId: null,
          coverFocusY: null,
          profileMediaId: null,
          avatarCropX: null,
          avatarCropY: null,
          avatarZoom: null,
          createdAt: new Date("2025-01-01T00:00:00Z"),
        };
        store.push(created);
        return { ...created };
      },
      async findUnique({ where: { id } }: { where: { id: string } }) {
        const found = store.find((p) => p.id === id);
        return found ? { ...found } : null;
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: { name: string; bio: string };
      }) {
        state.updateCalls += 1;
        const idx = store.findIndex((p) => p.id === id);
        store[idx] = { ...store[idx], name: data.name, bio: data.bio };
        return { ...store[idx] };
      },
    },
  } as unknown as FakePrisma;

  Object.defineProperty(fake, "__profiles", { get: () => store });
  Object.defineProperty(fake, "__createCalls", { get: () => state.createCalls });
  Object.defineProperty(fake, "__updateCalls", { get: () => state.updateCalls });
  return fake;
}

// ─── Generátory ──────────────────────────────────────────────────────────────

/** Platné jméno (délka 1–100). */
const validNameArb = fc.string({ minLength: 1, maxLength: 100 });
/** Platné bio (délka 0–1000). */
const validBioArb = fc.string({ minLength: 0, maxLength: 1000 });
/** Neplatné jméno: délka 0 (prázdné) nebo > 100. */
const invalidNameArb = fc.oneof(
  fc.constant(""),
  fc.string({ minLength: 101, maxLength: 200 }),
);
/** Neplatné bio: délka > 1000. */
const invalidBioArb = fc.string({ minLength: 1001, maxLength: 1100 });

/** Vstup profilu, kde je neplatné alespoň jedno pole (jméno nebo bio). */
const invalidInputArb = fc.oneof(
  fc.record({ name: invalidNameArb, bio: validBioArb }),
  fc.record({ name: validNameArb, bio: invalidBioArb }),
  fc.record({ name: invalidNameArb, bio: invalidBioArb }),
);

describe("Property 14: Neplatný vstup profilu zachová původní stav", () => {
  it("createProfile s neplatným vstupem je odmítnut a nevznikne žádný profil (R4.2, R4.3)", async () => {
    await fc.assert(
      fc.asyncProperty(invalidInputArb, async (input) => {
        // Předpoklad generátoru: vstup je skutečně neplatný.
        expect(validateModelName(input.name) && validateBio(input.bio)).toBe(false);

        const prisma = makeFakePrisma();
        const svc = createModelService(prisma);

        const r = await svc.createProfile(input);

        expect(isErr(r)).toBe(true);
        if (isErr(r)) expect(r.error.code).toBe("validation");
        // Žádný profil nevznikl a create se nikdy nezavolal.
        expect(prisma.__profiles).toHaveLength(0);
        expect(prisma.__createCalls).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("updateProfile s neplatným vstupem zachová původní hodnoty beze změny (R4.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validNameArb,
        validBioArb,
        invalidInputArb,
        async (origName, origBio, patch) => {
          const original: ModelProfile = {
            id: "p-1",
            name: origName,
            bio: origBio,
            driveFolderId: null,
            coverMediaId: null,
            coverFocusY: null,
            profileMediaId: null,
            avatarCropX: null,
            avatarCropY: null,
            avatarZoom: null,
            createdAt: new Date("2025-01-01T00:00:00Z"),
          };
          const prisma = makeFakePrisma([original]);
          const svc = createModelService(prisma);

          const r = await svc.updateProfile(original.id, patch);

          expect(isErr(r)).toBe(true);
          if (isErr(r)) expect(r.error.code).toBe("validation");
          // Žádný zápis: update se nikdy nezavolal.
          expect(prisma.__updateCalls).toBe(0);

          // Opětovné načtení vrací původní, nezměněné hodnoty.
          const got = await svc.getProfile(original.id);
          expect(isOk(got)).toBe(true);
          if (isOk(got)) {
            expect(got.value.name).toBe(origName);
            expect(got.value.bio).toBe(origBio);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
