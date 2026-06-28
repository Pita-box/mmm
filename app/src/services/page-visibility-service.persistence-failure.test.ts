/**
 * Unit test — selhání perzistence Page_Visibility_Service (task 16.3).
 *
 * Ověřuje R16.4: když uložení změny viditelnosti selže, `setHidden`
 *  - nevyhodí výjimku přes svou hranici (vrací `Result`, ne throw),
 *  - vrátí chybu `persist_failed`,
 *  - a předchozí uložený stav zůstane beze změny (prior `isHidden` /
 *    `getHiddenSections` stále odráží původní hodnotu).
 *
 * _Requirements: 16.4_
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createPageVisibilityService } from "./page-visibility-service";
import { isErr, isOk } from "@/lib/result";

interface VisibilityStore {
  [sectionKey: string]: boolean;
}

/**
 * Minimální in-memory fake PrismaClient. `findUnique` a `findMany` čtou z
 * interního úložiště; `upsert` vždy selže (simuluje výpadek perzistence) a
 * úložiště nechá nedotčené, aby šlo ověřit zachování předchozího stavu.
 */
function makeFailingPrisma(initial: VisibilityStore): PrismaClient {
  const store: VisibilityStore = { ...initial };
  return {
    pageVisibility: {
      upsert: async () => {
        throw new Error("DB unavailable");
      },
      findUnique: async ({ where }: { where: { sectionKey: string } }) => {
        const key = where.sectionKey;
        return key in store ? { sectionKey: key, hidden: store[key] } : null;
      },
      findMany: async () =>
        Object.entries(store).map(([sectionKey, hidden]) => ({
          sectionKey,
          hidden,
        })),
    },
  } as unknown as PrismaClient;
}

describe("createPageVisibilityService.setHidden — persistence failure (R16.4)", () => {
  it("returns persist_failed error instead of throwing across the boundary", async () => {
    const service = createPageVisibilityService(makeFailingPrisma({}));

    const result = await service.setHidden("gallery", true);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("persist_failed");
    }
  });

  it("preserves the previously persisted state when the write fails", async () => {
    // Sekce "gallery" je předtím skrytá (true), "about" viditelná (false).
    const service = createPageVisibilityService(
      makeFailingPrisma({ gallery: true, about: false }),
    );

    // Prior stav: gallery skrytá, about viditelná.
    expect(await service.isHidden("gallery")).toBe(true);
    expect(await service.isHidden("about")).toBe(false);

    // Pokus o změnu selže na perzistenci.
    const result = await service.setHidden("gallery", false);
    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);

    // Předchozí stav zůstal beze změny.
    expect(await service.isHidden("gallery")).toBe(true);
    expect(await service.isHidden("about")).toBe(false);
    expect(await service.getHiddenSections()).toEqual({
      gallery: true,
      about: false,
    });
  });

  it("does not create a record when the very first write fails", async () => {
    const service = createPageVisibilityService(makeFailingPrisma({}));

    expect(await service.isHidden("models")).toBe(false);

    const result = await service.setHidden("models", true);
    expect(isErr(result)).toBe(true);

    // Žádný záznam nevznikl — sekce je nadále viditelná.
    expect(await service.isHidden("models")).toBe(false);
    expect(await service.getHiddenSections()).toEqual({});
  });
});
