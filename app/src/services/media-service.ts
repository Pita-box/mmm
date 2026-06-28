/**
 * Media_Service — jádro správy médií (task 7.1).
 *
 * Soubor odděluje **čisté jádro** (klasifikace, validace, invariant viditelnosti,
 * řazení, stavové guardy) od **perzistentní vrstvy** (Prisma). Čisté funkce jsou
 * bez I/O, deterministické a přímo testovatelné generátory (PBT tasky 7.2–7.8).
 * Perzistentní operace jsou vystaveny přes `createMediaService(prisma)` a vracejí
 * `Result<…, MediaError>` — nikdy nevyhazují výjimku přes svou hranici.
 *
 * Stavový model (viz design.md):
 *   [*] --> scheduled         (vytvoření s publishAt v budoucnu)
 *   [*] --> published         (ruční publishNow)
 *   scheduled --> published   (Scheduler / publishNow)
 *   published --> hidden      (hide)
 *   {scheduled|published|hidden} --> [*]  (delete, hard)
 *
 * Approved_Media = status == "published" && publishAt <= now. Pouze taková média
 * jsou vidět koncovým uživatelům (R8.4, R10.2, R13.4).
 *
 * Pozn. ke guardům (R8.5): plánování i publikace skrytého (nebo smazaného →
 * not_found) média je odmítnuto. Toto je striktnější než přechod hidden→published
 * naznačený v diagramu; řídíme se explicitním akceptačním kritériem R8.5 a zadáním
 * tasku 7.1 ("reject scheduling/publishing of hidden/deleted media").
 */
import type { PrismaClient, MediaItem } from "@prisma/client";
import type { MediaType, MediaStatus } from "@/lib/domain";
import type { MediaError, UploadError } from "@/lib/errors";
import type { DriveFileMeta } from "@/services/drive-connector";
import { ok, err, isErr, type Result } from "@/lib/result";

// ─── Konstanty formátů a velikosti ────────────────────────────────────────────

/** Podporované foto MIME typy (R5.2): JPEG, PNG, WebP. */
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Podporované video MIME typy (R5.2): MP4, MOV (quicktime), WebM. */
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Maximální velikost nahrávaného souboru: 10 GB (R5.3; velká videa, plán 007). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

// ─── Vstupní/pomocné typy ─────────────────────────────────────────────────────

/** Metadata souboru potřebná k validaci před uploadem (R5.3). */
export interface UploadMeta {
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** Strukturální minimum pro invariant viditelnosti a guardy — co potřebuje čisté jádro. */
export interface MediaItemView {
  readonly status: MediaStatus;
  readonly publishAt: Date | null;
}

/** Vstup pro vytvoření Media_Item (R5.1). */
export interface CreateMediaInput {
  /** Profil modelu, nebo `null` — médium nemusí být přiřazené k modelu. */
  readonly modelId: string | null;
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  /** Kdo médium nahrál (Distributor/Admin); null = legacy/neznámý. */
  readonly uploaderId?: string | null;
  /** Je-li v budoucnu → scheduled; jinak (null / nyní / minulost) → publikováno ihned. */
  readonly publishAt?: Date | null;
}

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Klasifikace typu média podle MIME typu (R5.2).
 * Foto: JPEG/PNG/WebP, video: MP4/MOV/WebM, jinak `null`.
 * MIME se porovnává bez ohledu na velikost písmen a okolní mezery.
 */
export function classifyType(mime: string): MediaType | null {
  const m = mime.trim().toLowerCase();
  if (PHOTO_MIME_TYPES.has(m)) return "photo";
  if (VIDEO_MIME_TYPES.has(m)) return "video";
  return null;
}

/**
 * Validace nahrávaného souboru: podporovaný formát + velikost ≤ 500 MB (R5.3).
 * Formát se kontroluje jako první; při překročení velikosti se vrací `maxBytes`.
 */
export function validateUpload(file: UploadMeta): Result<void, UploadError> {
  if (classifyType(file.mimeType) === null) {
    return err({
      code: "unsupported_format",
      message: `Nepodporovaný formát souboru: ${file.mimeType}`,
    });
  }
  if (file.sizeBytes > MAX_UPLOAD_BYTES) {
    return err({
      code: "file_too_large",
      maxBytes: MAX_UPLOAD_BYTES,
      message: `Soubor přesahuje maximální velikost ${MAX_UPLOAD_BYTES} B`,
    });
  }
  return ok();
}

/**
 * Je médium Approved_Media vůči času `now`?
 * Pravda právě když je publikované a jeho čas zveřejnění již nastal (R8.4).
 */
export function isApproved(item: MediaItemView, now: Date): boolean {
  return (
    item.status === "published" &&
    item.publishAt !== null &&
    item.publishAt.getTime() <= now.getTime()
  );
}

/**
 * Invariant viditelnosti: z libovolné množiny vrátí výhradně Approved_Media
 * (R8.1, R8.4, R9.1, R10.2, R13.4). Skrytá/naplánovaná/smazaná se nikdy nevrátí;
 * skrytá přitom zůstávají v úložišti (zde se jen nevypisují).
 */
export function visibleMedia<T extends MediaItemView>(items: readonly T[], now: Date): T[] {
  return items.filter((item) => isApproved(item, now));
}

/**
 * Pohled Preview: Approved_Media seřazená sestupně podle času zveřejnění (R10.1).
 * Vstup se nemutuje.
 */
export function previewOrder<T extends MediaItemView>(items: readonly T[], now: Date): T[] {
  return visibleMedia(items, now).sort((a, b) => {
    // publishAt je u Approved_Media vždy nenulové (zaručeno isApproved).
    return b.publishAt!.getTime() - a.publishAt!.getTime();
  });
}

/**
 * Guard plánování (R8.5, R8.6): naplánovat lze pouze médium, které není skryté,
 * a pouze s časem zveřejnění striktně v budoucnu (minulost i `== now` se odmítá).
 */
export function canSchedule(
  item: MediaItemView,
  publishAt: Date,
  now: Date,
): Result<void, MediaError> {
  if (item.status === "hidden") {
    return err({ code: "invalid_state", message: "Skryté médium nelze naplánovat." });
  }
  if (publishAt.getTime() <= now.getTime()) {
    return err({
      code: "invalid_schedule",
      message: "Čas zveřejnění musí být v budoucnu.",
    });
  }
  return ok();
}

/**
 * Guard ruční publikace (R8.5): publikovat nelze skryté médium.
 */
export function canPublishNow(item: MediaItemView): Result<void, MediaError> {
  if (item.status === "hidden") {
    return err({ code: "invalid_state", message: "Skryté médium nelze publikovat." });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

export interface MediaService {
  classifyType(mime: string): MediaType | null;
  validateUpload(file: UploadMeta): Result<void, UploadError>;
  isApproved(item: MediaItemView, now: Date): boolean;
  createMediaItem(input: CreateMediaInput, now?: Date): Promise<Result<MediaItem, MediaError>>;
  /**
   * Ingest existujících souborů z Drive složky (plán 007). Z `files` vezme jen
   * podporované typy a založí pro ně `MediaItem` jako `hidden` (admin doplní
   * model/tagy a publikuje). Duplicity (dle unikátního `driveFileId`) se přeskočí.
   */
  importFromDrive(
    files: readonly DriveFileMeta[],
    uploaderId?: string | null,
  ): Promise<Result<{ imported: number; skipped: number }, MediaError>>;
  /**
   * Sync mazání (plán 007): smaže `MediaItem`y, jejichž `driveFileId` UŽ NENÍ
   * v dané množině (soubor zmizel z Drive). Bezpečnostní pojistka: prázdná
   * množina = no-op (nikdy hromadně nesmaže vše kvůli chybě/špatné složce).
   * Tagy a členství v kolekcích se uklidí přes FK cascade.
   */
  removeMissing(
    driveFileIds: readonly string[],
  ): Promise<Result<{ removed: number }, MediaError>>;
  schedulePublish(
    id: string,
    publishAt: Date,
    now?: Date,
  ): Promise<Result<MediaItem, MediaError>>;
  publishNow(id: string, now?: Date): Promise<Result<MediaItem, MediaError>>;
  hide(id: string): Promise<Result<void, MediaError>>;
  delete(id: string): Promise<Result<void, MediaError>>;
}

const NOT_FOUND: MediaError = { code: "not_found", message: "Médium nebylo nalezeno." };

/**
 * Vytvoří instanci Media_Service nad daným Prisma klientem.
 * Čisté funkce jsou vystaveny i jako samostatné exporty (pro PBT bez I/O).
 */
export function createMediaService(prisma: PrismaClient): MediaService {
  return {
    classifyType,
    validateUpload,
    isApproved,

    async createMediaItem(input, now = new Date()) {
      const mediaType = classifyType(input.mimeType);
      if (mediaType === null) {
        return err({
          code: "validation",
          field: "mimeType",
          message: `Nepodporovaný formát souboru: ${input.mimeType}`,
        });
      }

      // publishAt v budoucnu => scheduled; jinak publikováno ihned (publishAt = now).
      const future = input.publishAt != null && input.publishAt.getTime() > now.getTime();
      const status: MediaStatus = future ? "scheduled" : "published";
      const publishAt = future ? input.publishAt! : now;

      const created = await prisma.mediaItem.create({
        data: {
          modelId: input.modelId,
          driveFileId: input.driveFileId,
          mediaType,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          width: input.width,
          height: input.height,
          status,
          publishAt,
          uploaderId: input.uploaderId ?? null,
        },
      });
      return ok(created);
    },

    async importFromDrive(files, uploaderId = null) {
      const now = new Date();
      // Jen podporované typy (foto/video); ostatní (např. složky) přeskočíme.
      const data = files
        .map((f) => {
          const mediaType = classifyType(f.mimeType);
          if (mediaType === null) return null;
          return {
            driveFileId: f.driveFileId,
            mediaType,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            width: f.width ?? 0,
            height: f.height ?? 0,
            durationMs: f.durationMs ?? null,
            // Importováno rovnou publikované (viditelné), ať se po synchronizaci
            // objeví na webu. Admin může skrýt v seznamu médií.
            status: "published" as MediaStatus,
            publishAt: now,
            modelId: null,
            uploaderId,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      // skipDuplicates spoléhá na @unique(driveFileId) — opakovaný import je no-op.
      const res = await prisma.mediaItem.createMany({ data, skipDuplicates: true });
      return ok({ imported: res.count, skipped: files.length - res.count });
    },

    async removeMissing(driveFileIds) {
      // Pojistka: prázdná množina (chyba výpisu / špatná složka) → nemažeme nic.
      if (driveFileIds.length === 0) return ok({ removed: 0 });
      const res = await prisma.mediaItem.deleteMany({
        where: { driveFileId: { notIn: [...driveFileIds] } },
      });
      return ok({ removed: res.count });
    },

    async schedulePublish(id, publishAt, now = new Date()) {
      const item = await prisma.mediaItem.findUnique({ where: { id } });
      if (item === null) return err(NOT_FOUND);

      const guard = canSchedule(item, publishAt, now);
      if (isErr(guard)) return guard;

      const updated = await prisma.mediaItem.update({
        where: { id },
        data: { status: "scheduled", publishAt },
      });
      return ok(updated);
    },

    async publishNow(id, now = new Date()) {
      const item = await prisma.mediaItem.findUnique({ where: { id } });
      if (item === null) return err(NOT_FOUND);

      const guard = canPublishNow(item);
      if (isErr(guard)) return guard;

      const updated = await prisma.mediaItem.update({
        where: { id },
        data: { status: "published", publishAt: now },
      });
      return ok(updated);
    },

    async hide(id) {
      const item = await prisma.mediaItem.findUnique({ where: { id } });
      if (item === null) return err(NOT_FOUND);

      await prisma.mediaItem.update({ where: { id }, data: { status: "hidden" } });
      return ok();
    },

    async delete(id) {
      const item = await prisma.mediaItem.findUnique({ where: { id } });
      if (item === null) return err(NOT_FOUND);

      // Hard-delete + úklid kolekcí (R9.2, R9.3): odstraníme členství ve všech
      // kolekcích a poté samotný záznam, atomicky v jedné transakci.
      await prisma.$transaction([
        prisma.collectionItem.deleteMany({ where: { mediaId: id } }),
        prisma.mediaItem.delete({ where: { id } }),
      ]);
      return ok();
    },
  };
}
