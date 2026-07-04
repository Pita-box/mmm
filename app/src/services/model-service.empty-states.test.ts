/**
 * Unit testy prázdných / hraničních stavů stránky Models (task 13.4).
 *
 * Pokrývají EXAMPLE/EDGE kritéria, která doplňují property testy round-tripu
 * (13.2/13.3): prázdný seznam modelů, model bez Approved_Media (prázdná galerie),
 * karta bez profilové fotky (placeholder) a neexistující model (not_found).
 *
 * Použit je minimální ručně psaný in-memory fake PrismaClient — testuje se
 * skutečná logika `createModelService`, žádné mocky knihovních volání ani
 * skutečná databáze. Galerie sdílí invariant viditelnosti s Media_Service,
 * takže stačí média v různých stavech a ověřit, co projde filtrem.
 *
 * _Requirements: 13.2, 13.3, 13.5_ (+ hranice 13.6 not_found)
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient, MediaItem, ModelProfile } from "@prisma/client";
import { createModelService } from "./model-service";
import { isOk, isErr } from "@/lib/result";

// ─── Minimální in-memory fake PrismaClient ────────────────────────────────────

/** Profil s volitelně připojenými médii (pro `include: { media: true }`). */
type StoredProfile = ModelProfile & { media: MediaItem[] };

/**
 * Postaví fake klienta nad pevně daným seznamem profilů. Implementuje pouze
 * metody, které Model_Service skutečně volá: modelProfile.findMany/findUnique/
 * create; média se vrací přes `include` na profilu.
 */
function makePrisma(profiles: StoredProfile[]): PrismaClient {
  const fake = {
    modelProfile: {
      findMany: async (_args?: unknown) =>
        // Vrací mělkou kopii bez připojených médií (jako reálný findMany bez include).
        profiles.map(({ media: _m, ...rest }) => rest as ModelProfile),

      findUnique: async (args: {
        where: { id: string };
        include?: { media?: boolean };
      }) => {
        const found = profiles.find((p) => p.id === args.where.id);
        if (found === undefined) return null;
        if (args.include?.media) return found; // s galerií
        const { media: _m, ...rest } = found;
        return rest as ModelProfile;
      },

      create: async (args: { data: { name: string; bio: string } }) => {
        const created: StoredProfile = {
          id: `m-${profiles.length + 1}`,
          name: args.data.name,
          bio: args.data.bio,
          coverMediaId: null,
          coverFocusY: null,
          profileMediaId: null,
          avatarCropX: null,
          avatarCropY: null,
          avatarZoom: null,
          createdAt: new Date(),
          media: [],
        };
        profiles.push(created);
        const { media: _m, ...rest } = created;
        return rest as ModelProfile;
      },
    },
  };
  return fake as unknown as PrismaClient;
}

/** Pomocník: vytvoří mediální položku v daném stavu (jen pole nutná pro invariant). */
function media(
  id: string,
  status: MediaItem["status"],
  publishAt: Date | null,
): MediaItem {
  return {
    id,
    modelId: "m-1",
    driveFileId: `drive-${id}`,
    mediaType: "photo",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    status,
    publishAt,
    width: 800,
    height: 600,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  } as MediaItem;
}

const NOW = new Date("2024-06-01T12:00:00Z");
const PAST = new Date("2024-05-01T00:00:00Z");
const FUTURE = new Date("2024-12-01T00:00:00Z");

// ─── R13.3: prázdný seznam modelů ──────────────────────────────────────────────

describe("Models page — prázdný seznam modelů (R13.3)", () => {
  it("listProfiles vrací prázdné pole, když žádný model neexistuje", async () => {
    const service = createModelService(makePrisma([]));
    const profiles = await service.listProfiles();
    expect(profiles).toEqual([]);
  });
});

// ─── R13.2: karta bez profilové fotky → placeholder ───────────────────────────

describe("Models page — model bez profilové fotky (R13.2)", () => {
  it("getProfile vrátí profil s profileMediaId = null (UI zobrazí placeholder)", async () => {
    const profile: StoredProfile = {
      id: "m-1",
      name: "Bez fotky",
      bio: "",
      coverMediaId: null,
      coverFocusY: null,
      profileMediaId: null,
      avatarCropX: null,
      avatarCropY: null,
      avatarZoom: null,
      createdAt: NOW,
      media: [],
    };
    const service = createModelService(makePrisma([profile]));

    const result = await service.getProfile("m-1");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.profileMediaId).toBeNull();
      expect(result.value.name).toBe("Bez fotky");
    }
  });
});

// ─── R13.5: model bez Approved_Media → prázdná galerie ─────────────────────────

describe("Models page — prázdná galerie (R13.5)", () => {
  it("getGallery vrací [] pro model, který nemá žádné médium", async () => {
    const profile: StoredProfile = {
      id: "m-1",
      name: "Nový model",
      bio: "bio",
      coverMediaId: null,
      coverFocusY: null,
      profileMediaId: null,
      avatarCropX: null,
      avatarCropY: null,
      avatarZoom: null,
      createdAt: NOW,
      media: [],
    };
    const service = createModelService(makePrisma([profile]));

    const result = await service.getGallery("m-1", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual([]);
  });

  it("getGallery vrací [], když má model jen ne-Approved média (scheduled/hidden/budoucí)", async () => {
    const profile: StoredProfile = {
      id: "m-1",
      name: "Jen koncepty",
      bio: "",
      coverMediaId: null,
      coverFocusY: null,
      profileMediaId: null,
      avatarCropX: null,
      avatarCropY: null,
      avatarZoom: null,
      createdAt: NOW,
      media: [
        media("a", "scheduled", FUTURE), // naplánováno do budoucna
        media("b", "hidden", PAST), // skryto
        media("c", "published", FUTURE), // publikováno, ale publishAt > now
      ],
    };
    const service = createModelService(makePrisma([profile]));

    const result = await service.getGallery("m-1", NOW);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual([]);
  });
});

// ─── R13.6: neexistující model → not_found ─────────────────────────────────────

describe("Models page — neexistující model (R13.6 hranice)", () => {
  it("getProfile neexistujícího modelu vrací chybu not_found", async () => {
    const service = createModelService(makePrisma([]));
    const result = await service.getProfile("missing");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("not_found");
  });

  it("getGallery neexistujícího modelu vrací chybu not_found (ne prázdné pole)", async () => {
    const service = createModelService(makePrisma([]));
    const result = await service.getGallery("missing", NOW);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("not_found");
  });
});
