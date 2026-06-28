/**
 * Collection_Service — privátní uživatelské kolekce / playlisty (task 14.1).
 *
 * Soubor odděluje **čisté jádro** (validace názvu, rozhodnutí o vlastnictví)
 * od **perzistentní vrstvy** (Prisma). Čisté funkce jsou bez I/O a přímo
 * testovatelné generátory (PBT tasky 14.2–14.5); perzistentní operace jsou
 * vystaveny přes `createCollectionService(prisma)` a vracejí
 * `Result<…, CollectionError>` — nikdy nevyhazují výjimku přes svou hranici.
 *
 * Klíčová pravidla (R14):
 *  - vytvoření kolekce s názvem délky 1–100; jinak odmítnuto a nevznikne
 *    žádná kolekce (R14.1, R14.6),
 *  - přidat lze pouze Approved_Media a idempotentně — opakované přidání téhož
 *    média kolekci nezmění (R14.2, R14.7), sdílí invariant `isApproved`
 *    s Media_Service,
 *  - odebrat lze pouze médium v kolekci přítomné; odebrání nepřítomného média
 *    kolekci nezmění a vrátí chybu (R14.3, R14.8),
 *  - kolekce je přístupná výhradně vlastníkovi; cizí přístup → 403/forbidden,
 *    neexistující kolekce → not_found (R14.4, R14.5).
 */
import type { PrismaClient, Collection, MediaItem } from "@prisma/client";
import type { CollectionError } from "@/lib/errors";
import { ok, err, isErr, type Result } from "@/lib/result";
import { validateCollectionName } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { isApproved } from "./media-service";

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Validace názvu kolekce (R14.6). Vrací typovanou `ValidationError` s názvem
 * pole, aby volající (a UI) mohlo zvýraznit neplatné pole; při chybě se nikdy
 * nic neperzistuje.
 */
export function validateCollectionNameInput(name: string): Result<void, CollectionError> {
  if (!validateCollectionName(name)) {
    return err({
      code: "validation",
      field: "name",
      message: "Název kolekce musí mít délku 1–100 znaků.",
    });
  }
  return ok();
}

/**
 * Rozhodnutí o přístupu ke kolekci (R14.4, R14.5). Kolekce je přístupná
 * výhradně vlastníkovi: neexistující kolekce → `not_found`, kolekce jiného
 * uživatele → `forbidden` (route handler mapuje na HTTP 403).
 */
export function checkOwnership(
  collection: { readonly ownerId: string } | null,
  userId: string,
): Result<void, CollectionError> {
  if (collection === null) {
    return err({ code: "not_found", message: "Kolekce nebyla nalezena." });
  }
  if (collection.ownerId !== userId) {
    return err({ code: "forbidden", message: "Ke kolekci má přístup pouze její vlastník." });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

export interface CollectionService {
  /** Vytvoření kolekce vlastněné `ownerId` s validací názvu (R14.1, R14.6). */
  createCollection(
    ownerId: string,
    name: string,
  ): Promise<Result<Collection, CollectionError>>;
  /** Načtení kolekce s kontrolou vlastnictví (R14.4, R14.5). */
  getCollection(id: string, userId: string): Promise<Result<Collection, CollectionError>>;
  /** Seznam kolekcí daného vlastníka. */
  listCollections(ownerId: string): Promise<Collection[]>;
  /** Položky kolekce (média) s kontrolou vlastnictví. */
  getItems(id: string, userId: string): Promise<Result<MediaItem[], CollectionError>>;
  /** Idempotentní přidání pouze Approved_Media do vlastní kolekce (R14.2, R14.7). */
  addMedia(
    collectionId: string,
    userId: string,
    mediaId: string,
    now?: Date,
  ): Promise<Result<void, CollectionError>>;
  /** Odebrání přítomného média z vlastní kolekce (R14.3, R14.8). */
  removeMedia(
    collectionId: string,
    userId: string,
    mediaId: string,
  ): Promise<Result<void, CollectionError>>;
  /** Smazání vlastní kolekce (kaskádově odstraní členství). */
  deleteCollection(id: string, userId: string): Promise<Result<void, CollectionError>>;
}

/**
 * Vytvoří instanci Collection_Service nad daným Prisma klientem.
 * Čisté funkce jsou vystaveny i jako samostatné exporty (pro PBT bez I/O).
 */
export function createCollectionService(prisma: PrismaClient): CollectionService {
  return {
    async createCollection(ownerId, name) {
      const v = validateCollectionNameInput(name);
      if (isErr(v)) return v; // neplatný název → žádná kolekce (R14.6)

      const created = await prisma.collection.create({
        data: { ownerId, name },
      });
      return ok(created);
    },

    async getCollection(id, userId) {
      const collection = await prisma.collection.findUnique({ where: { id } });
      const access = checkOwnership(collection, userId);
      if (isErr(access)) return access; // R14.4, R14.5
      return ok(collection!);
    },

    listCollections(ownerId) {
      return prisma.collection.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      });
    },

    async getItems(id, userId) {
      const collection = await prisma.collection.findUnique({
        where: { id },
        include: { items: { include: { media: true } } },
      });
      const access = checkOwnership(collection, userId);
      if (isErr(access)) return access; // R14.4, R14.5
      return ok(collection!.items.map((item) => item.media));
    },

    async addMedia(collectionId, userId, mediaId, now = new Date()) {
      const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
      const access = checkOwnership(collection, userId);
      if (isErr(access)) return access; // R14.4, R14.5

      // Přidat lze pouze Approved_Media; neexistující i neschválené médium je
      // nedostupné (R14.7).
      const media = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
      if (media === null || !isApproved(media, now)) {
        return err({
          code: "media_not_approved",
          message: "Médium není dostupné a nelze ho přidat do kolekce.",
        });
      }

      // Idempotence (R14.2): opakované přidání téhož média kolekci nezmění.
      const existing = await prisma.collectionItem.findUnique({
        where: { collectionId_mediaId: { collectionId, mediaId } },
      });
      if (existing === null) {
        await prisma.collectionItem.create({ data: { collectionId, mediaId } });
      }
      return ok();
    },

    async removeMedia(collectionId, userId, mediaId) {
      const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
      const access = checkOwnership(collection, userId);
      if (isErr(access)) return access; // R14.4, R14.5

      // Odebrat lze pouze médium v kolekci přítomné; jinak beze změny + chyba (R14.8).
      const existing = await prisma.collectionItem.findUnique({
        where: { collectionId_mediaId: { collectionId, mediaId } },
      });
      if (existing === null) {
        return err({
          code: "item_not_in_collection",
          message: "Médium v kolekci není přítomné.",
        });
      }

      await prisma.collectionItem.delete({
        where: { collectionId_mediaId: { collectionId, mediaId } },
      });
      return ok();
    },

    async deleteCollection(id, userId) {
      const collection = await prisma.collection.findUnique({ where: { id } });
      const access = checkOwnership(collection, userId);
      if (isErr(access)) return access; // R14.4, R14.5

      await prisma.collection.delete({ where: { id } });
      return ok();
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient. */
export const collectionService: CollectionService = createCollectionService(prisma);
