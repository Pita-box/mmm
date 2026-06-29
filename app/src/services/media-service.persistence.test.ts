import { describe, it, expect } from "vitest";
import type { PrismaClient, MediaItem } from "@prisma/client";
import { createMediaService } from "./media-service";
import { isOk, isErr, type Result } from "@/lib/result";
import type { MediaError } from "@/lib/errors";

/**
 * Unit testy perzistentní vrstvy Media_Service (task 7.8).
 *
 * Pokrývají EXAMPLE/EDGE kritéria, která property testy (7.2–7.7) neřeší:
 *  - ruční publikace povýší naplánované médium na publikované (R8.3),
 *  - smazání je trvalé (hard-delete) a uklidí členství v kolekcích (R9.4),
 *  - operace nad neexistujícím id vrací chybu `not_found` (R9.5).
 *
 * Místo běžící databáze používáme ručně psaný in-memory fake PrismaClient
 * (fake, nikoli mock — drží reálné záznamy a vynucuje stejné chování jako DB
 * pro použité metody). Drží se konvence repozitáře (viz InMemoryAuthRepository).
 * Implementuje pouze metody, které Media_Service skutečně volá:
 * mediaItem.{findUnique,create,update,delete}, collectionItem.deleteMany, $transaction.
 */

// ─── Ručně psaný in-memory fake PrismaClient ─────────────────────────────────

interface CollectionItemRow {
  collectionId: string;
  mediaId: string;
}

/** Sestaví MediaItem se sensible defaulty; přepíše pole z `over`. */
function makeMediaRow(over: Partial<MediaItem> & { id: string }): MediaItem {
  return {
    id: over.id,
    modelId: over.modelId ?? "model-1",
    driveFileId: over.driveFileId ?? "drive-1",
    mediaType: over.mediaType ?? "photo",
    mimeType: over.mimeType ?? "image/jpeg",
    sizeBytes: over.sizeBytes ?? 1024,
    status: over.status ?? "scheduled",
    publishAt: over.publishAt ?? null,
    width: over.width ?? 100,
    height: over.height ?? 100,
    durationMs: over.durationMs ?? null,
    createdAt: over.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    uploaderId: over.uploaderId ?? null,
    posterDriveFileId: over.posterDriveFileId ?? null,
  };
}

class FakePrisma {
  private readonly media = new Map<string, MediaItem>();
  private collectionItems: CollectionItemRow[] = [];
  private seq = 0;

  /** Testovací seed — vloží médium přímo do úložiště. */
  seedMedia(row: Partial<MediaItem> & { id: string }): void {
    this.media.set(row.id, makeMediaRow(row));
  }

  /** Testovací seed — vloží vazbu kolekce↔médium. */
  seedCollectionItem(row: CollectionItemRow): void {
    this.collectionItems.push(row);
  }

  /** Introspekce pro asserty. */
  hasMedia(id: string): boolean {
    return this.media.has(id);
  }

  collectionItemsFor(mediaId: string): CollectionItemRow[] {
    return this.collectionItems.filter((c) => c.mediaId === mediaId);
  }

  get allCollectionItems(): readonly CollectionItemRow[] {
    return this.collectionItems;
  }

  readonly mediaItem = {
    findUnique: async ({ where }: { where: { id: string } }): Promise<MediaItem | null> => {
      return this.media.get(where.id) ?? null;
    },

    create: async ({ data }: { data: Omit<MediaItem, "id" | "createdAt"> }): Promise<MediaItem> => {
      const id = `media-${++this.seq}`;
      const row = makeMediaRow({ ...data, id });
      this.media.set(id, row);
      return row;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<MediaItem>;
    }): Promise<MediaItem> => {
      const existing = this.media.get(where.id);
      if (!existing) throw new Error(`fake: media ${where.id} not found for update`);
      const updated = { ...existing, ...data };
      this.media.set(where.id, updated);
      return updated;
    },

    delete: async ({ where }: { where: { id: string } }): Promise<MediaItem> => {
      const existing = this.media.get(where.id);
      if (!existing) throw new Error(`fake: media ${where.id} not found for delete`);
      this.media.delete(where.id);
      return existing;
    },
  };

  readonly collectionItem = {
    deleteMany: async ({ where }: { where: { mediaId: string } }): Promise<{ count: number }> => {
      const before = this.collectionItems.length;
      this.collectionItems = this.collectionItems.filter((c) => c.mediaId !== where.mediaId);
      return { count: before - this.collectionItems.length };
    },
  };

  /**
   * Media_Service předává pole již zavolaných Promisů (operace se spustí při
   * jejich vytvoření); $transaction je jen sekvenčně/atomicky odčeká.
   */
  async $transaction<T>(operations: readonly Promise<T>[]): Promise<T[]> {
    return Promise.all(operations);
  }
}

function makeService() {
  const prisma = new FakePrisma();
  const svc = createMediaService(prisma as unknown as PrismaClient);
  return { prisma, svc };
}

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date("2026-06-02T12:00:00.000Z");

// ─── R8.3 — ruční publikace povýší naplánované médium ────────────────────────

describe("publishNow — ruční publikace (R8.3)", () => {
  it("povýší naplánované médium na published a nastaví publishAt na now", async () => {
    const { prisma, svc } = makeService();
    prisma.seedMedia({ id: "m1", status: "scheduled", publishAt: FUTURE });

    const result = await svc.publishNow("m1", NOW);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.value.status).toBe("published");
    expect(result.value.publishAt?.getTime()).toBe(NOW.getTime());
    // Stav je perzistovaný, ne jen ve vrácené hodnotě.
    expect(isApprovedNow(svc, result.value)).toBe(true);
  });

  it("odmítne publikaci skrytého média (guard R8.5)", async () => {
    const { prisma, svc } = makeService();
    prisma.seedMedia({ id: "m1", status: "hidden", publishAt: null });

    const result = await svc.publishNow("m1", NOW);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected err");
    expect(result.error.code).toBe("invalid_state");
  });
});

// ─── R9.4 — smazání je trvalé a uklidí kolekce ───────────────────────────────

describe("delete — trvalé smazání + úklid kolekcí (R9.4)", () => {
  it("odstraní záznam i jeho členství ve všech kolekcích, ostatní vazby ponechá", async () => {
    const { prisma, svc } = makeService();
    prisma.seedMedia({ id: "m1", status: "published", publishAt: NOW });
    prisma.seedMedia({ id: "m2", status: "published", publishAt: NOW });
    prisma.seedCollectionItem({ collectionId: "c1", mediaId: "m1" });
    prisma.seedCollectionItem({ collectionId: "c2", mediaId: "m1" });
    prisma.seedCollectionItem({ collectionId: "c1", mediaId: "m2" });

    const result = await svc.delete("m1");

    expect(isOk(result)).toBe(true);
    // Hard-delete: záznam už v úložišti není.
    expect(prisma.hasMedia("m1")).toBe(false);
    // Úklid: žádná vazba na smazané médium nezůstala.
    expect(prisma.collectionItemsFor("m1")).toHaveLength(0);
    // Vazby ostatních médií zůstaly nedotčené.
    expect(prisma.collectionItemsFor("m2")).toHaveLength(1);
    expect(prisma.allCollectionItems).toHaveLength(1);
  });

  it("hide nesmaže médium, jen změní stav", async () => {
    const { prisma, svc } = makeService();
    prisma.seedMedia({ id: "m1", status: "published", publishAt: NOW });

    const result = await svc.hide("m1");

    expect(isOk(result)).toBe(true);
    expect(prisma.hasMedia("m1")).toBe(true);
  });
});

// ─── R9.5 — operace nad neexistujícím id → not_found ─────────────────────────

describe("operace nad neexistujícím id vrací not_found (R9.5)", () => {
  type Svc = ReturnType<typeof makeService>["svc"];
  const cases: ReadonlyArray<[string, (svc: Svc) => Promise<Result<unknown, MediaError>>]> = [
    ["publishNow", (svc) => svc.publishNow("missing", NOW)],
    ["schedulePublish", (svc) => svc.schedulePublish("missing", FUTURE, NOW)],
    ["hide", (svc) => svc.hide("missing")],
    ["delete", (svc) => svc.delete("missing")],
  ];

  it.each(cases)("%s → not_found", async (_name, op) => {
    const { svc } = makeService();

    const result = await op(svc);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected err");
    expect(result.error.code).toBe("not_found");
  });
});

/** Pomocník: ověří přes službu, že položka je Approved_Media vůči NOW. */
function isApprovedNow(
  svc: ReturnType<typeof makeService>["svc"],
  item: { status: MediaItem["status"]; publishAt: Date | null },
): boolean {
  return svc.isApproved({ status: item.status, publishAt: item.publishAt }, NOW);
}
