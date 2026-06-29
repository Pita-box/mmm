// Feature: mmmred-streaming-dashboard, Property 34: Guardy členství v kolekci
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, Collection, MediaItem } from "@prisma/client";
import { createCollectionService } from "./collection-service";
import { isApproved } from "./media-service";
import { isErr } from "@/lib/result";

/**
 * Property 34: Guardy členství v kolekci.
 *
 * Pro libovolnou (vlastněnou) kolekci platí:
 *  - přidání média, které NENÍ Approved_Media (scheduled / hidden / publikováno
 *    s časem v budoucnu / neexistující), je odmítnuto chybou `media_not_approved`
 *    a členství v kolekci zůstane beze změny (R14.7), a
 *  - odebrání média, které v kolekci NENÍ přítomné, kolekci nezmění a vrátí
 *    chybu `item_not_in_collection` (R14.8).
 *
 * Test pohání službu `createCollectionService(prisma)` přes minimální in-memory
 * fake PrismaClient (collection.findUnique, mediaItem.findUnique,
 * collectionItem.findUnique/create/delete). Fake počítá volání create/delete,
 * takže lze ověřit, že při odmítnutí nedojde k žádné mutaci členství.
 *
 * **Validates: Requirements 14.7, 14.8**
 */

// ─── Fixní čas a pomocné typy ─────────────────────────────────────────────────

const NOW = new Date("2025-06-01T12:00:00Z");

/** Klíč členství collection↔media (M:N). */
interface Membership {
  readonly collectionId: string;
  readonly mediaId: string;
}

// ─── Minimal in-memory fake PrismaClient ─────────────────────────────────────

interface FakePrisma extends PrismaClient {
  /** Aktuální množina členství (snapshot pro ověření „beze změny"). */
  __memberships: Membership[];
  /** Počet volání collectionItem.create — pro ověření „nic nepřibylo". */
  __createCalls: number;
  /** Počet volání collectionItem.delete — pro ověření „nic neubylo". */
  __deleteCalls: number;
}

function makeFakePrisma(
  collection: Collection,
  media: MediaItem | null,
  memberships: Membership[],
): FakePrisma {
  const store: Membership[] = memberships.map((m) => ({ ...m }));
  const state = { createCalls: 0, deleteCalls: 0 };

  const has = (collectionId: string, mediaId: string) =>
    store.some((m) => m.collectionId === collectionId && m.mediaId === mediaId);

  const fake = {
    collection: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return id === collection.id ? { ...collection } : null;
      },
    },
    mediaItem: {
      async findUnique({ where: { id } }: { where: { id: string } }) {
        return media !== null && media.id === id ? { ...media } : null;
      },
    },
    collectionItem: {
      async findUnique({
        where: { collectionId_mediaId },
      }: {
        where: { collectionId_mediaId: { collectionId: string; mediaId: string } };
      }) {
        const { collectionId, mediaId } = collectionId_mediaId;
        return has(collectionId, mediaId) ? { collectionId, mediaId } : null;
      },
      async create({ data }: { data: { collectionId: string; mediaId: string } }) {
        state.createCalls += 1;
        store.push({ ...data });
        return { ...data };
      },
      async delete({
        where: { collectionId_mediaId },
      }: {
        where: { collectionId_mediaId: { collectionId: string; mediaId: string } };
      }) {
        state.deleteCalls += 1;
        const { collectionId, mediaId } = collectionId_mediaId;
        const idx = store.findIndex(
          (m) => m.collectionId === collectionId && m.mediaId === mediaId,
        );
        if (idx >= 0) store.splice(idx, 1);
        return { collectionId, mediaId };
      },
    },
  } as unknown as FakePrisma;

  Object.defineProperty(fake, "__memberships", { get: () => store });
  Object.defineProperty(fake, "__createCalls", { get: () => state.createCalls });
  Object.defineProperty(fake, "__deleteCalls", { get: () => state.deleteCalls });
  return fake;
}

// ─── Generátory ──────────────────────────────────────────────────────────────

const OWNER_ID = "owner-1";

/** Vlastněná kolekce (přístupová kontrola vždy projde). */
const collectionArb: fc.Arbitrary<Collection> = fc
  .uuid()
  .map((id) => ({
    id: `col-${id}`,
    ownerId: OWNER_ID,
    name: "kolekce",
    createdAt: NOW,
  }));

/** Základ Media_Item; status/publishAt přepisují konkrétní scénáře. */
function baseMedia(id: string, status: MediaItem["status"], publishAt: Date | null): MediaItem {
  return {
    id,
    modelId: "model-1",
    driveFileId: "drive-1",
    mediaType: "photo",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    status,
    publishAt,
    width: 100,
    height: 100,
    durationMs: null,
    createdAt: NOW,
    uploaderId: null,
    posterDriveFileId: null,
  };
}

const futureDateArb = fc
  .integer({ min: 1, max: 1_000_000_000 })
  .map((ms) => new Date(NOW.getTime() + ms));

/**
 * Médium, které NENÍ Approved_Media (vrácené prisma.mediaItem.findUnique):
 *  - scheduled (publishAt budoucí nebo null),
 *  - hidden (libovolné publishAt),
 *  - published, ale publishAt v budoucnu (ještě nezveřejněno),
 *  - published s publishAt = null.
 */
const nonApprovedMediaArb: fc.Arbitrary<MediaItem> = fc
  .uuid()
  .chain((uid) => {
    const id = `media-${uid}`;
    return fc.oneof(
      fc
        .option(futureDateArb, { nil: null })
        .map((p) => baseMedia(id, "scheduled", p)),
      fc
        .option(
          fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).map((ms) => new Date(NOW.getTime() + ms)),
          { nil: null },
        )
        .map((p) => baseMedia(id, "hidden", p)),
      futureDateArb.map((p) => baseMedia(id, "published", p)),
      fc.constant(baseMedia(id, "published", null)),
    );
  });

/** Scénář média pro addMedia: buď konkrétní neschválené médium, nebo „neexistuje". */
const addScenarioArb = fc.oneof(
  nonApprovedMediaArb.map((media) => ({ media, mediaId: media.id })),
  fc.uuid().map((uid) => ({ media: null as MediaItem | null, mediaId: `missing-${uid}` })),
);

describe("Property 34: Guardy členství v kolekci", () => {
  it("přidání média, které není Approved_Media, je odmítnuto a členství zůstane beze změny (R14.7)", async () => {
    await fc.assert(
      fc.asyncProperty(collectionArb, addScenarioArb, async (collection, scenario) => {
        // Předpoklad scénáře: médium buď neexistuje, nebo není Approved_Media.
        if (scenario.media !== null) {
          expect(isApproved(scenario.media, NOW)).toBe(false);
        }

        const prisma = makeFakePrisma(collection, scenario.media, []);
        const svc = createCollectionService(prisma);

        const r = await svc.addMedia(collection.id, OWNER_ID, scenario.mediaId, NOW);

        expect(isErr(r)).toBe(true);
        if (isErr(r)) expect(r.error.code).toBe("media_not_approved");
        // Žádné členství nepřibylo a create se nikdy nezavolal.
        expect(prisma.__memberships).toHaveLength(0);
        expect(prisma.__createCalls).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("odebrání média, které v kolekci není přítomné, vrátí chybu a kolekci nezmění (R14.8)", async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionArb,
        fc.uuid().map((uid) => `media-${uid}`),
        // Předem přítomná, ODLIŠNÁ členství — musí zůstat nedotčená.
        fc.uniqueArray(fc.uuid().map((uid) => `other-${uid}`), { maxLength: 5 }),
        async (collection, mediaId, otherIds) => {
          const existing: Membership[] = otherIds
            .filter((id) => id !== mediaId)
            .map((id) => ({ collectionId: collection.id, mediaId: id }));
          const before = existing.map((m) => ({ ...m }));

          const prisma = makeFakePrisma(collection, null, existing);
          const svc = createCollectionService(prisma);

          const r = await svc.removeMedia(collection.id, OWNER_ID, mediaId);

          expect(isErr(r)).toBe(true);
          if (isErr(r)) expect(r.error.code).toBe("item_not_in_collection");
          // Žádné členství neubylo a delete se nikdy nezavolal.
          expect(prisma.__deleteCalls).toBe(0);
          expect(prisma.__memberships).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
