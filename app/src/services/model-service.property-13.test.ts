// Feature: mmmred-streaming-dashboard, Property 13: Round-trip uložení a editace profilu modelu
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, ModelProfile } from "@prisma/client";
import { createModelService } from "./model-service";
import { isOk } from "@/lib/result";
import { validateModelName, validateBio } from "@/lib/validation";

/**
 * Property 13: Round-trip uložení a editace profilu modelu.
 *
 * Pro libovolné jméno o délce 1–100 znaků a bio o délce 0–1000 znaků platí, že
 * vytvoření i editace profilu uloží přesně tyto hodnoty a jejich opětovné
 * načtení vrátí stejné hodnoty.
 *
 * **Validates: Requirements 4.1, 4.4**
 */

/**
 * Minimální ruční in-memory fake PrismaClient.
 *
 * Implementuje pouze `modelProfile.create / findUnique / update` — přesně to,
 * co Model_Service při round-tripu profilu volá. Žádná DB, žádný I/O, takže
 * test ověřuje čistě logiku služby (uloží přesně vstup, načtení vrátí totéž).
 */
function createFakePrisma(): PrismaClient {
  const store = new Map<string, ModelProfile>();
  let seq = 0;

  const modelProfile = {
    async create({ data }: { data: { name: string; bio: string } }): Promise<ModelProfile> {
      const profile: ModelProfile = {
        id: `m${++seq}`,
        name: data.name,
        bio: data.bio,
        coverMediaId: null,
        coverFocusY: null,
        profileMediaId: null,
        avatarCropX: null,
        avatarCropY: null,
        avatarZoom: null,
        createdAt: new Date(),
      };
      store.set(profile.id, { ...profile });
      return { ...profile };
    },
    async findUnique({ where }: { where: { id: string } }): Promise<ModelProfile | null> {
      const found = store.get(where.id);
      return found ? { ...found } : null;
    },
    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: { name: string; bio: string };
    }): Promise<ModelProfile> {
      const existing = store.get(where.id);
      if (!existing) throw new Error("not found");
      const updated: ModelProfile = { ...existing, name: data.name, bio: data.bio };
      store.set(where.id, { ...updated });
      return { ...updated };
    },
  };

  return { modelProfile } as unknown as PrismaClient;
}

/** Platné jméno modelu: délka 1–100 (R4.1). */
const validName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter(validateModelName);

/** Platné bio: délka 0–1000, prázdné povolené (R4.1). */
const validBio = fc.string({ maxLength: 1000 }).filter(validateBio);

describe("Property 13: round-trip uložení a editace profilu modelu", () => {
  it("vytvoření i editace uloží přesně zadané hodnoty a načtení je vrátí", async () => {
    await fc.assert(
      fc.asyncProperty(
        validName,
        validBio,
        validName,
        validBio,
        async (name, bio, newName, newBio) => {
          const svc = createModelService(createFakePrisma());

          // Vytvoření profilu uloží přesně zadané hodnoty (R4.1).
          const created = await svc.createProfile({ name, bio });
          expect(isOk(created)).toBe(true);
          if (!isOk(created)) return;
          expect(created.value.name).toBe(name);
          expect(created.value.bio).toBe(bio);

          const id = created.value.id;

          // Opětovné načtení vrátí stejné hodnoty.
          const fetched = await svc.getProfile(id);
          expect(isOk(fetched)).toBe(true);
          if (!isOk(fetched)) return;
          expect(fetched.value.name).toBe(name);
          expect(fetched.value.bio).toBe(bio);

          // Editace uloží přesně nové hodnoty (R4.4).
          const updated = await svc.updateProfile(id, { name: newName, bio: newBio });
          expect(isOk(updated)).toBe(true);
          if (!isOk(updated)) return;
          expect(updated.value.name).toBe(newName);
          expect(updated.value.bio).toBe(newBio);

          // Načtení po editaci vrátí nové hodnoty.
          const refetched = await svc.getProfile(id);
          expect(isOk(refetched)).toBe(true);
          if (!isOk(refetched)) return;
          expect(refetched.value.name).toBe(newName);
          expect(refetched.value.bio).toBe(newBio);
        },
      ),
      { numRuns: 100 },
    );
  });
});
