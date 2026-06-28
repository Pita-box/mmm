// Feature: mmmred-streaming-dashboard, Property 31: Round-trip přidání a odebrání média v kolekci
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, MediaItem } from "@prisma/client";
import { createCollectionService } from "./collection-service";
import { isOk } from "@/lib/result";

/**
 * Property 31: Round-trip přidání a odebrání média v kolekci.
 *
 * Pro libovolnou kolekci a libovolné Approved_Media platí, že přidání dosud
 * nepřítomného média ho do kolekce zařadí a následné odebrání ho odebere, čímž
 * se kolekce vrátí do původního stavu (původní množina členství).
 *
 * **Validates: Requirements 14.2, 14.3**
 *
 * Test cílí na perzistentní operace `createCollectionService(prisma).addMedia`
 * a `.removeMedia`. Použijeme minimální ručně psaný in-memory fake
 * `PrismaClient`, který drží jen to, co tyto operace volají:
 *   - `collection.findUnique`      (kontrola existence + vlastnictví)
 *   - `mediaItem.findUnique`       (kontrola, že jde o Approved_Media)
 *   - `collectionItem.findUnique`  (idempotence / přítomnost členství)
 *   - `collectionItem.create`      (přidání členství)
 *   - `collectionItem.delete`      (odebrání členství)
 * Žádná skutečná DB ani Prisma engine.
 */

// ─── Minimální in-memory fake PrismaClient ─────────────────────────────────────

interface CollectionRow {
  readonly id: string;
  readonly ownerId: string;
}

interface CompositeKeyArg {
  readonly where: {
    readonly collectionId_mediaId: { readonly collectionId: string; readonly mediaId: string };
  };
}

/** Klíč členství jako řetězec pro Set/Map. */
const memberKey = (collectionId: string, mediaId: string) => `${collectionId}\u0000${mediaId}`;

function makeFakePrisma(
  collection: CollectionRow,
  approvedMedia: MediaItem,
  initialMembers: readonly string[],
) {
  const members = new Set<string>(initialMembers.map((mid) => memberKey(collection.id, mid)));

  const prisma = {
    collection: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === collection.id ? { ...collection } : null,
    },
    mediaItem: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === approvedMedia.id ? { ...approvedMedia } : null,
    },
    collectionItem: {
      findUnique: async ({ where: { collectionId_mediaId } }: CompositeKeyArg) =>
        members.has(memberKey(collectionId_mediaId.collectionId, collectionId_mediaId.mediaId))
          ? { ...collectionId_mediaId }
          : null,
      create: async ({
        data: { collectionId, mediaId },
      }: {
        data: { collectionId: string; mediaId: string };
      }) => {
        members.add(memberKey(collectionId, mediaId));
        return { collectionId, mediaId };
      },
      delete: async ({ where: { collectionId_mediaId } }: CompositeKeyArg) => {
        members.delete(
          memberKey(collectionId_mediaId.collectionId, collectionId_mediaId.mediaId),
        );
        return { ...collectionId_mediaId };
      },
    },
    // pomocná introspekce pro asserce (není součástí Prisma API):
    _members: () =>
      new Set(
        [...members].map((k) => k.split("\u0000")[1]),
      ),
  };

  return prisma;
}

// ─── Smart generátor scénáře ───────────────────────────────────────────────────

/** Approved_Media: published + publishAt v minulosti (vůči `now`). */
function approvedMediaRow(id: string): MediaItem {
  const base = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    modelId: "model-1",
    driveFileId: `drive-${id}`,
    mediaType: "photo",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    width: 800,
    height: 600,
    status: "published",
    publishAt: base,
    createdAt: base,
    updatedAt: base,
  } as unknown as MediaItem;
}

/**
 * Vygeneruje:
 *  - vlastníka kolekce a kolekci jím vlastněnou,
 *  - cílové Approved_Media k round-tripu (vždy dosud NEpřítomné),
 *  - libovolnou původní množinu členství jiných médií (cílové v ní není).
 */
const scenarioArb = fc
  .uniqueArray(fc.nat({ max: 60 }), { minLength: 1, maxLength: 10 })
  .map((ns) => ns.map((n) => `media-${n}`))
  .chain((mediaIds) =>
    fc.record({
      ownerId: fc.constantFrom("user-a", "user-b", "user-c"),
      collectionId: fc.constant("col-1"),
      target: fc.constantFrom(...mediaIds),
      mediaIds: fc.constant(mediaIds),
    }),
  )
  .chain(({ ownerId, collectionId, target, mediaIds }) =>
    fc.record({
      ownerId: fc.constant(ownerId),
      collectionId: fc.constant(collectionId),
      target: fc.constant(target),
      // Původní členství: libovolná podmnožina médií KROMĚ cílového.
      initialMembers: fc.subarray(mediaIds.filter((id) => id !== target)),
    }),
  );

describe("Property 31: Round-trip přidání a odebrání média v kolekci", () => {
  it("addMedia(target) ho zařadí a removeMedia(target) vrátí kolekci do původního stavu", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ ownerId, collectionId, target, initialMembers }) => {
        const collection: CollectionRow = { id: collectionId, ownerId };
        const media = approvedMediaRow(target);
        const fake = makeFakePrisma(collection, media, initialMembers);
        const service = createCollectionService(fake as unknown as PrismaClient);

        const now = new Date("2026-06-01T00:00:00.000Z");
        const originalMembers = fake._members();

        // Předpoklad: cílové médium není v kolekci na začátku.
        expect(originalMembers.has(target)).toBe(false);

        // Přidání dosud nepřítomného Approved_Media ho do kolekce zařadí (R14.2).
        const added = await service.addMedia(collectionId, ownerId, target, now);
        expect(isOk(added)).toBe(true);
        expect(fake._members().has(target)).toBe(true);

        // Následné odebrání ho z kolekce odebere (R14.3).
        const removed = await service.removeMedia(collectionId, ownerId, target);
        expect(isOk(removed)).toBe(true);
        expect(fake._members().has(target)).toBe(false);

        // Round-trip: kolekce se vrátila do původního stavu členství.
        expect(fake._members()).toEqual(originalMembers);
      }),
      { numRuns: 100 },
    );
  });
});
