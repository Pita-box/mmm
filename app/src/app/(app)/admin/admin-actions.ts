"use server";

/**
 * Server actions Admin_Console (task 21.2).
 *
 * Pokrývají administrátorské mutace: upload média (Drive upload v kombinaci s
 * perzistencí Media_Item a kompenzačním rollbackem — R5.1/R5.4/R5.6),
 * štítkování (R7.2), CRUD profilů modelů (R4.1), správu uživatelů (R15.1/R15.2
 * vč. revokace relací R15.4), viditelnost sekcí (R16.1) a oznamovací banner
 * (R17.1/R17.2). Každá akce ověří roli Admin a po úspěchu zneplatní dotčené
 * cesty. Mapování `Result` → výsledek akce je sjednoceno do `ActionResult`.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { requireAdmin, requireUploader } from "@/lib/session";
import { driveStorage } from "@/lib/drive";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import type { AccountStatus, Role } from "@/lib/domain";
import { canDeleteMedia } from "@/lib/permissions";
import { normalizeStoredProfileAvatarCrop } from "@/lib/profile-avatar";
import {
  createMediaService,
  classifyType,
  isApproved,
} from "@/services/media-service";
import { createTagService } from "@/services/tag-service";
import { modelService, validateProfileInput } from "@/services/model-service";
import { pageVisibilityService } from "@/services/page-visibility-service";
import { notificationService } from "@/services/notification-service";
import { buildTelegramGallerySummaryMessage } from "@/services/telegram-community-service";
import {
  buildTelegramUploadCaption,
  createTelegramBroadcastService,
} from "@/services/telegram-broadcast-service";

/** Sjednocený výsledek admin akce pro UI (úspěch / chybová hláška). */
export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

const OK: ActionResult = { ok: true };

function clampPercent(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

/** Interní signál pro rollback uploadu uvnitř transakce (nese hlášku pro UI). */
class UploadAbort extends Error {}

function getDriveRootFolderId(): string | null {
  const rootFolderId = process.env.GDRIVE_ROOT_FOLDER_ID?.trim();
  if (!rootFolderId) return null;
  if (process.env.NODE_ENV === "test") return null;
  if (process.env.DRIVE_STORAGE !== "real") return null;
  return rootFolderId;
}

async function ensureModelDriveFolderId(
  modelId: string,
): Promise<{ ok: true; driveFolderId: string | null } | { ok: false; message: string }> {
  const rootFolderId = getDriveRootFolderId();
  if (!rootFolderId) return { ok: true, driveFolderId: null };

  const profile = await prisma.modelProfile.findUnique({
    where: { id: modelId },
    select: { id: true, name: true, driveFolderId: true },
  });
  if (!profile) return { ok: false, message: "Model profile not found." };
  if (profile.driveFolderId) return { ok: true, driveFolderId: profile.driveFolderId };

  const ensured = await driveStorage.ensureFolder(profile.name, rootFolderId);
  if (isErr(ensured)) return { ok: false, message: ensured.error.message };
  try {
    await prisma.modelProfile.update({
      where: { id: modelId },
      data: { driveFolderId: ensured.value.driveFolderId },
    });
  } catch {
    return { ok: false, message: "Failed to save the model's Drive folder." };
  }
  return { ok: true, driveFolderId: ensured.value.driveFolderId };
}

async function resolveTargetDriveFolderId(
  modelId: string | null,
): Promise<{ ok: true; driveFolderId: string | null } | { ok: false; message: string }> {
  const rootFolderId = getDriveRootFolderId();
  if (!rootFolderId) return { ok: true, driveFolderId: null };
  if (!modelId) return { ok: true, driveFolderId: rootFolderId };
  return ensureModelDriveFolderId(modelId);
}

async function moveDriveFilesToFolder(
  folderId: string | null,
  driveFileIds: readonly (string | null | undefined)[],
): Promise<ActionResult> {
  if (!folderId) return OK;
  for (const driveFileId of driveFileIds) {
    if (!driveFileId) continue;
    const moved = await driveStorage.moveFileToFolder(driveFileId, folderId);
    if (isErr(moved)) return { ok: false, message: moved.error.message };
  }
  return OK;
}

// ─── Modely ─────────────────────────────────────────────────────────────────

/** Vytvoření profilu modelu (R4.1). Distributor i Admin. */
export async function createModelProfileAction(values: {
  name: string;
  bio: string;
}): Promise<ActionResult> {
  await requireUploader();
  const result = await modelService.createProfile({
    name: values.name,
    bio: values.bio,
  });
  if (isErr(result)) return { ok: false, message: result.error.message };
  const folder = await ensureModelDriveFolderId(result.value.id);
  if (!folder.ok) {
    await prisma.modelProfile.delete({ where: { id: result.value.id } }).catch(() => undefined);
    return { ok: false, message: folder.message };
  }
  revalidatePath("/admin/models");
  revalidatePath("/models");
  return OK;
}

/** Editace profilu modelu (jméno + bio). Uploader (Admin i Distributor). */
export async function updateModelProfileAction(
  modelId: string,
  values: {
    name: string;
    bio: string;
    coverMediaId?: string | null;
    coverFocusY?: number | null;
    profileMediaId?: string | null;
    avatarCropX?: number | null;
    avatarCropY?: number | null;
    avatarZoom?: number | null;
  },
): Promise<ActionResult> {
  await requireUploader();
  const validated = validateProfileInput({ name: values.name, bio: values.bio });
  if (isErr(validated)) return { ok: false, message: validated.error.message };

  const profile = await prisma.modelProfile.findUnique({
    where: { id: modelId },
    select: {
      id: true,
      coverMediaId: true,
      coverFocusY: true,
      profileMediaId: true,
      avatarCropX: true,
      avatarCropY: true,
      avatarZoom: true,
    },
  });
  if (!profile) return { ok: false, message: "Model profile not found." };

  const hasCoverUpdate = "coverMediaId" in values || "coverFocusY" in values;
  const hasAvatarUpdate =
    "profileMediaId" in values ||
    "avatarCropX" in values ||
    "avatarCropY" in values ||
    "avatarZoom" in values;

  let coverMediaId = profile.coverMediaId;
  let coverFocusY = profile.coverFocusY;
  if (hasCoverUpdate) {
    coverMediaId =
      typeof values.coverMediaId === "string" && values.coverMediaId.trim().length > 0
        ? values.coverMediaId
        : null;
    if (coverMediaId) {
      const now = new Date();
      const media = await prisma.mediaItem.findFirst({
        where: {
          id: coverMediaId,
          modelId,
          mediaType: "photo",
          status: "published",
          publishAt: { lte: now },
        },
        select: { id: true },
      });
      if (!media) {
        return {
          ok: false,
          message: "The cover photo must be a published photo assigned to this model.",
        };
      }
      coverFocusY = clampPercent(values.coverFocusY ?? 50);
    } else {
      coverFocusY = null;
    }
  }

  let profileMediaId = profile.profileMediaId;
  let crop = {
    avatarCropX: profile.avatarCropX,
    avatarCropY: profile.avatarCropY,
    avatarZoom: profile.avatarZoom,
  };
  if (hasAvatarUpdate) {
    profileMediaId =
      typeof values.profileMediaId === "string" && values.profileMediaId.trim().length > 0
        ? values.profileMediaId
        : null;
    let profileMediaMetrics: { width: number; height: number } | null = null;
    if (profileMediaId) {
      const now = new Date();
      const media = await prisma.mediaItem.findFirst({
        where: {
          id: profileMediaId,
          modelId,
          mediaType: "photo",
          status: "published",
          publishAt: { lte: now },
        },
        select: { id: true, width: true, height: true },
      });
      if (!media) {
        return {
          ok: false,
          message: "The profile avatar must be a published photo assigned to this model.",
        };
      }
      profileMediaMetrics = { width: media.width, height: media.height };
    }
    crop = profileMediaMetrics
      ? normalizeStoredProfileAvatarCrop(values, profileMediaMetrics)
      : { avatarCropX: null, avatarCropY: null, avatarZoom: null };
  }

  await prisma.modelProfile.update({
    where: { id: modelId },
    data: {
      name: values.name,
      bio: values.bio,
      coverMediaId,
      coverFocusY,
      profileMediaId,
      avatarCropX: crop.avatarCropX,
      avatarCropY: crop.avatarCropY,
      avatarZoom: crop.avatarZoom,
    },
  });
  revalidatePath("/admin/models");
  revalidatePath("/models");
  revalidatePath(`/models/${modelId}`);
  revalidatePath("/search");
  return OK;
}

/**
 * Smazání profilu modelu (Admin). Dvě varianty:
 *  - `withMedia=false` → smaže jen profil; jeho média zůstanou (FK `onDelete:
 *    SetNull` jim vynuluje `modelId`).
 *  - `withMedia=true` → smaže profil i jeho média, a to nejdřív z Google Drive
 *    (idempotentně, aby je sync nemohl re-importovat), pak z DB (kaskáda uklidí
 *    štítky/kolekce/gate-sample).
 */
export async function deleteModelProfileAction(
  modelId: string,
  withMedia: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    if (withMedia) {
      const items = await prisma.mediaItem.findMany({
        where: { modelId },
        select: { driveFileId: true, posterDriveFileId: true },
      });
      for (const it of items) {
        // idempotentní (404 = ok); případné selhání nebrání smazání záznamů.
        await driveStorage.deleteFile(it.driveFileId);
        if (it.posterDriveFileId) await driveStorage.deleteFile(it.posterDriveFileId);
      }
      await prisma.$transaction([
        prisma.mediaItem.deleteMany({ where: { modelId } }),
        prisma.modelProfile.delete({ where: { id: modelId } }),
      ]);
    } else {
      await prisma.modelProfile.delete({ where: { id: modelId } });
    }
  } catch {
    return { ok: false, message: "Failed to delete the model." };
  }
  revalidatePath("/admin/models");
  revalidatePath("/models");
  revalidatePath("/");
  return OK;
}

// ─── Upload média ───────────────────────────────────────────────────────────

/**
 * Vytvoří resumable upload session (Approach B, plán 007). Klient pak nahraje
 * soubor po částech PŘÍMO do Googlu (bajty nejdou přes server → obejde 1MB limit
 * Server Actions i zátěž serveru). Vrací `uploadUrl` session.
 */
export async function createUploadSessionAction(
  name: string,
  mimeType: string,
  modelId?: string | null,
): Promise<{ ok: boolean; uploadUrl?: string; message?: string }> {
  await requireUploader();
  if (classifyType(mimeType) === null) {
    return { ok: false, message: "Unsupported file format." };
  }
  const targetFolder = await resolveTargetDriveFolderId(modelId ?? null);
  if (!targetFolder.ok) return { ok: false, message: targetFolder.message };
  const res = await driveStorage.createResumableSession({
    name,
    mimeType,
    folderId: targetFolder.driveFolderId,
  });
  if (isErr(res)) return { ok: false, message: res.error.message };
  return { ok: true, uploadUrl: res.value.uploadUrl };
}

/** Vstup sdílené perzistence média + štítků. */
interface PersistMediaInput {
  readonly driveFileId: string;
  readonly modelId: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly publishAt: Date | null;
  readonly tags: Partial<Record<TagCategory, string[]>>;
  readonly uploaderId: string;
  /** Vlastní poster videa (Drive file ID), pokud byl vygenerován. */
  readonly posterDriveFileId?: string | null;
  /** false = po vytvoření skrýt (wizard „uložit skryté", plán 012). Default published. */
  readonly publish?: boolean;
}

interface PersistMediaResult extends ActionResult {
  readonly mediaId?: string;
  readonly created?: boolean;
}

const telegramBroadcastService = createTelegramBroadcastService({
  storage: driveStorage,
  config: {
    botToken: process.env.MMM_TELEGRAM_BOT_TOKEN,
    chatId: process.env.MMM_TELEGRAM_CHAT_ID,
    defaultThreadId: process.env.TELEGRAM_THREAD_GALLERY,
    botApiBaseUrl: process.env.TELEGRAM_BOT_API_BASE_URL,
  },
});

/**
 * Sdílené uložení Media_Item + štítků v jedné transakci; při selhání rollback +
 * kompenzační smazání souboru z Drive (žádný osiřelý záznam ani soubor, R5.4/5.6).
 * Používá ji upload wizard při finalizaci souborů, které už jsou na Drive.
 */
async function persistMediaWithTags(input: PersistMediaInput): Promise<PersistMediaResult> {
  const existing = await prisma.mediaItem.findUnique({
    where: { driveFileId: input.driveFileId },
    select: { id: true },
  });
  if (existing) return { ok: true, mediaId: existing.id, created: false };

  let createdMediaId: string | undefined;
  const targetFolder = await resolveTargetDriveFolderId(input.modelId);
  if (!targetFolder.ok) return { ok: false, message: targetFolder.message };
  const moved = await moveDriveFilesToFolder(targetFolder.driveFolderId, [
    input.driveFileId,
    input.posterDriveFileId,
  ]);
  if (!moved.ok) return moved;
  try {
    await prisma.$transaction(
      async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        const mediaService = createMediaService(txClient);
        const tagService = createTagService(txClient);

        const created = await mediaService.createMediaItem({
          modelId: input.modelId,
          driveFileId: input.driveFileId,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          width: 0,
          height: 0,
          publishAt: input.publishAt,
          uploaderId: input.uploaderId,
          posterDriveFileId: input.posterDriveFileId ?? null,
        });
        if (isErr(created)) throw new UploadAbort(created.error.message);
        createdMediaId = created.value.id;

        // Wizard „uložit skryté" (plán 012): médium vznikne, ale skryjeme ho.
        if (input.publish === false) {
          await txClient.mediaItem.update({
            where: { id: created.value.id },
            data: { status: "hidden" },
          });
        }

        for (const category of FIXED_CATEGORIES) {
          for (const raw of input.tags[category] ?? []) {
            const value = await tagService.upsertValue(category, raw);
            if (isErr(value)) throw new UploadAbort(value.error.message);
            const assigned = await tagService.assignValueToMedia(
              created.value.id,
              value.value.id,
            );
            if (isErr(assigned)) throw new UploadAbort(assigned.error.message);
          }
        }
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e && typeof e.code === "string"
        ? e.code
        : undefined;
    console.error("Media persistence failed", {
      driveFileId: input.driveFileId,
      code,
      message: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      message:
        e instanceof UploadAbort
          ? e.message
          : `Failed to save the media${code ? ` (${code})` : ""}. You can retry.`,
    };
  }

  revalidatePath("/admin/media");
  revalidatePath("/");
  return { ok: true, mediaId: createdMediaId, created: true };
}

async function notifyTelegramAboutUpload(input: {
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly modelId: string | null;
}): Promise<ActionResult> {
  const model = input.modelId
    ? await prisma.modelProfile.findUnique({
        where: { id: input.modelId },
        select: { name: true },
      })
    : null;
  const sent = await telegramBroadcastService.sendMedia({
    driveFileId: input.driveFileId,
    mimeType: input.mimeType,
    caption: buildTelegramUploadCaption({
      mimeType: input.mimeType,
      modelName: model?.name,
    }),
  });
  if (isErr(sent)) {
    return {
      ok: false,
      message: sent.error.message,
    };
  }
  return OK;
}

async function notifyTelegramAboutUploads(
  items: readonly {
    driveFileId: string;
    mimeType: string;
    modelId: string | null;
  }[],
) : Promise<{ sent: number; failed: number; lastError?: string }> {
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const item of items) {
    const telegram = await notifyTelegramAboutUpload(item);
    if (!telegram.ok) {
      failed++;
      lastError = telegram.message;
      console.error("Telegram broadcast failed for upload", {
        driveFileId: item.driveFileId,
        message: telegram.message,
      });
    } else {
      sent++;
    }
  }
  return { sent, failed, lastError };
}

async function notifyTelegramGeneralSummary(count: number): Promise<ActionResult> {
  if (count <= 0) return OK;
  const sent = await telegramBroadcastService.sendMessage({
    chatId: process.env.MMM_TELEGRAM_CHAT_ID ?? "",
    threadId: process.env.TELEGRAM_THREAD_GENERAL,
    text: buildTelegramGallerySummaryMessage(count),
  });
  if (isErr(sent)) {
    return {
      ok: false,
      message: sent.error.message,
    };
  }
  return OK;
}

// ─── Import z Google Drive (plán 007) ────────────────────────────────────────

/**
 * Synchronizace s Drive složkou (`GDRIVE_ROOT_FOLDER_ID`, plán 007): naimportuje
 * nové soubory jako `MediaItem` (status `hidden`) a smaže `MediaItem`y, jejichž
 * soubor už na Drive není. Bajty nejdou přes server — soubory se nahrávají mimo
 * web (Drive web / desktop / rclone). Duplicity (dle `driveFileId`) se přeskočí.
 */
export async function importFromDriveAction(): Promise<ActionResult> {
  const principal = await requireUploader();
  const folderId = process.env.GDRIVE_ROOT_FOLDER_ID;
  if (!folderId) {
    return { ok: false, message: "GDRIVE_ROOT_FOLDER_ID is not set." };
  }
  const listed = await driveStorage.listFilesRecursive(folderId);
  if (isErr(listed)) return { ok: false, message: listed.error.message };
  const importStartedAt = new Date();
  const importableDriveFileIds = listed.value
    .filter((f) => classifyType(f.mimeType) !== null)
    .map((f) => f.driveFileId);
  const modelProfiles = await prisma.modelProfile.findMany({
    where: { driveFolderId: { not: null } },
    select: { id: true, driveFolderId: true },
  });
  const modelIdsByFolderId = new Map(
    modelProfiles
      .filter((profile): profile is { id: string; driveFolderId: string } => typeof profile.driveFolderId === "string")
      .map((profile) => [profile.driveFolderId, profile.id]),
  );
  const modelIdsByDriveFileId = Object.fromEntries(
    listed.value.map((file) => [
      file.driveFileId,
      file.parentFolderId ? (modelIdsByFolderId.get(file.parentFolderId) ?? null) : null,
    ]),
  );

  const service = createMediaService(prisma);
  const imported = await service.importFromDrive(
    listed.value,
    principal.userId,
    modelIdsByDriveFileId,
  );
  if (isErr(imported)) return { ok: false, message: imported.error.message };

  // Sync mazání: odeber média, jejichž soubor už na Drive není (pojistka:
  // prázdný výpis nemaže nic, řeší `removeMissing`).
  const removed = await service.removeMissing(
    listed.value.map((f) => f.driveFileId),
  );
  if (isErr(removed)) return { ok: false, message: removed.error.message };

  if (imported.value.imported > 0 && importableDriveFileIds.length > 0) {
    after(async () => {
      const newRows = await prisma.mediaItem.findMany({
        where: {
          driveFileId: { in: importableDriveFileIds },
          createdAt: { gte: importStartedAt },
          status: "published",
        },
        select: { driveFileId: true, mimeType: true, modelId: true },
      });
      const telegram = await notifyTelegramAboutUploads(newRows);
      if (telegram.failed > 0) {
        console.error("Telegram broadcast failed for import", telegram);
      }
      if (telegram.sent > 0) {
        const summary = await notifyTelegramGeneralSummary(telegram.sent);
        if (!summary.ok) {
          console.error("Telegram gallery summary failed for import", {
            sent: telegram.sent,
            message: summary.message,
          });
        }
      }
    });
  }

  revalidatePath("/admin/media");
  revalidatePath("/");
  return {
    ok: true,
    message: `Imported ${imported.value.imported}, skipped ${imported.value.skipped}, removed ${removed.value.removed}.`,
  };
}

/**
 * Publikace / skrytí média (R8.3/R8.5). Uploader (Admin i Distributor) může
 * měnit viditelnost — publikované médium je vidět na webu, skryté ne.
 */
export async function setMediaPublishedAction(
  mediaId: string,
  published: boolean,
): Promise<ActionResult> {
  await requireUploader();
  const service = createMediaService(prisma);
  if (published) {
    const now = new Date();
    const before = await prisma.mediaItem.findUnique({
      where: { id: mediaId },
      select: {
        driveFileId: true,
        mimeType: true,
        modelId: true,
        status: true,
        publishAt: true,
      },
    });
    const res = await service.publishNow(mediaId, now);
    if (isErr(res)) return { ok: false, message: res.error.message };
    if (before && !isApproved(before, now)) {
      const telegram = await notifyTelegramAboutUpload({
        driveFileId: before.driveFileId,
        mimeType: before.mimeType,
        modelId: before.modelId,
      });
      if (!telegram.ok) {
        console.error("Telegram broadcast failed for manual publish", {
          mediaId,
          driveFileId: before.driveFileId,
          message: telegram.message,
        });
        revalidatePath("/admin/media");
        revalidatePath("/");
        return {
          ok: true,
          message: `The media was published, but the Telegram notification failed. ${telegram.message ?? ""}`.trim(),
        };
      }
      const summary = await notifyTelegramGeneralSummary(1);
      if (!summary.ok) {
        console.error("Telegram gallery summary failed for manual publish", {
          mediaId,
          driveFileId: before.driveFileId,
          message: summary.message,
        });
        revalidatePath("/admin/media");
        revalidatePath("/");
        return {
          ok: true,
          message: `The media was published, but the Telegram text notification failed. ${summary.message ?? ""}`.trim(),
        };
      }
    }
  } else {
    const res = await service.hide(mediaId);
    if (isErr(res)) return { ok: false, message: res.error.message };
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  return OK;
}

// ─── Úprava metadat média (model + štítky, plán 011) ─────────────────────────

/**
 * Přiřadí médium k profilu modelu, nebo ho odpojí (`modelId = null`). Uploader
 * (Admin i Distributor). Médium bez modelu se na webu zobrazí jen v obecném
 * Preview; s modelem i v albu modelu (R13.4).
 */
export async function assignMediaModelAction(
  mediaId: string,
  modelId: string | null,
): Promise<ActionResult> {
  await requireUploader();
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    select: { id: true, modelId: true, driveFileId: true, posterDriveFileId: true },
  });
  if (!media) return { ok: false, message: "Media not found." };
  if (modelId === media.modelId) return OK;
  if (modelId) {
    const profile = await prisma.modelProfile.findUnique({
      where: { id: modelId },
      select: { id: true },
    });
    if (!profile) return { ok: false, message: "Model profile does not exist." };
  }

  const targetFolder = await resolveTargetDriveFolderId(modelId);
  if (!targetFolder.ok) return { ok: false, message: targetFolder.message };
  const previousFolder = await resolveTargetDriveFolderId(media.modelId);
  if (!previousFolder.ok) return { ok: false, message: previousFolder.message };

  const moved = await moveDriveFilesToFolder(targetFolder.driveFolderId, [
    media.driveFileId,
    media.posterDriveFileId,
  ]);
  if (!moved.ok) return moved;

  try {
    await prisma.mediaItem.update({ where: { id: mediaId }, data: { modelId } });
  } catch {
    await moveDriveFilesToFolder(previousFolder.driveFolderId, [
      media.driveFileId,
      media.posterDriveFileId,
    ]);
    return {
      ok: false,
      message: modelId ? "Failed to assign the media to the model." : "Failed to detach the media from the model.",
    };
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  revalidatePath("/models");
  if (media.modelId) revalidatePath(`/models/${media.modelId}`);
  if (modelId) revalidatePath(`/models/${modelId}`);
  return OK;
}

/**
 * Přidá médiu hodnotu štítku v dané kategorii (vytvoří/znovupoužije hodnotu a
 * přiřadí ji). Uploader. Validace kategorie/hodnoty i limit 50/kategorie řeší
 * Tag_Service (R7).
 */
export async function addMediaTagAction(
  mediaId: string,
  category: string,
  value: string,
): Promise<{ ok: boolean; message?: string; tagValueId?: string }> {
  await requireUploader();
  const service = createTagService(prisma);
  const upserted = await service.upsertValue(category, value);
  if (isErr(upserted)) return { ok: false, message: upserted.error.message };
  const assigned = await service.assignValueToMedia(mediaId, upserted.value.id);
  if (isErr(assigned)) return { ok: false, message: assigned.error.message };
  revalidatePath("/admin/media");
  revalidatePath("/");
  return { ok: true, tagValueId: upserted.value.id };
}

/** Odebere médiu hodnotu štítku (idempotentní). Uploader. */
export async function removeMediaTagAction(
  mediaId: string,
  tagValueId: string,
): Promise<ActionResult> {
  await requireUploader();
  const res = await createTagService(prisma).removeValueFromMedia(mediaId, tagValueId);
  if (isErr(res)) return { ok: false, message: res.error.message };
  revalidatePath("/admin/media");
  revalidatePath("/");
  return OK;
}

/** Existující hodnoty štítků pro našeptávač (plán 012). Uploader. */
export async function listTagValuesAction(): Promise<
  { category: string; value: string }[]
> {
  await requireUploader();
  return createTagService(prisma).listValues();
}

/** Přejmenování hodnoty štítku (správa štítků, admin). */
export async function renameTagValueAction(
  tagValueId: string,
  value: string,
): Promise<ActionResult> {
  await requireAdmin();
  const res = await createTagService(prisma).renameValue(tagValueId, value);
  if (isErr(res)) return { ok: false, message: res.error.message };
  revalidatePath("/admin/tags");
  revalidatePath("/");
  return OK;
}

/** Smazání hodnoty štítku (správa štítků, admin). Odebere ji i ze všech médií. */
export async function deleteTagValueAction(tagValueId: string): Promise<ActionResult> {
  await requireAdmin();
  const res = await createTagService(prisma).deleteValue(tagValueId);
  if (isErr(res)) return { ok: false, message: res.error.message };
  revalidatePath("/admin/tags");
  revalidatePath("/");
  return OK;
}

/** Jedna položka k finalizaci z wizardu (soubor už na Drive). */
export interface WizardUploadItem {
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly modelId: string | null;
  readonly tags: Partial<Record<TagCategory, string[]>>;
  /** Vlastní poster videa (Drive file ID), pokud byl vygenerován. */
  readonly posterDriveFileId?: string | null;
}

/**
 * Bulk finalizace nahraných souborů z wizardu (plán 012). Pro každou položku
 * vytvoří Media_Item + štítky (atomicky, rollback při selhání). `publish=false`
 * → média zůstanou skrytá. Vrací souhrn počtů.
 */
export async function finalizeUploadsAction(
  items: readonly WizardUploadItem[],
  publish: boolean,
): Promise<{ ok: boolean; created: number; failed: number; message?: string }> {
  const principal = await requireUploader();
  let created = 0;
  let failed = 0;
  let lastError: string | undefined;
  const telegramItems: WizardUploadItem[] = [];
  for (const item of items) {
    if (classifyType(item.mimeType) === null) {
      failed++;
      lastError = "Unsupported file format.";
      continue;
    }
    const res = await persistMediaWithTags({
      driveFileId: item.driveFileId,
      modelId: item.modelId,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      publishAt: null,
      tags: item.tags,
      uploaderId: principal.userId,
      posterDriveFileId: item.posterDriveFileId ?? null,
      publish,
    });
    if (res.ok) {
      if (res.created) created++;
      if (publish && res.created) telegramItems.push(item);
    }
    else {
      failed++;
      lastError = res.message;
    }
  }
  if (telegramItems.length > 0) {
    after(async () => {
      const telegram = await notifyTelegramAboutUploads(telegramItems);
      if (telegram.failed > 0) {
        console.error("Telegram broadcast failed for finalized uploads", telegram);
      }
      if (telegram.sent > 0) {
        const summary = await notifyTelegramGeneralSummary(telegram.sent);
        if (!summary.ok) {
          console.error("Telegram gallery summary failed for finalized uploads", {
            sent: telegram.sent,
            message: summary.message,
          });
        }
      }
    });
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  return {
    ok: failed === 0,
    created,
    failed,
    message:
      failed > 0
        ? `Created ${created}, failed ${failed}. ${lastError ?? ""}`.trim()
        : undefined,
  };
}

// ─── Video poster (vlastní náhled z 1/3 délky) ───────────────────────────────

/**
 * Nahraje vygenerovaný poster (JPEG, base64) na Drive a vrátí jeho `driveFileId`.
 * Poster je malý obrázek → projde i přes limit Server Actions. Uploader.
 */
export async function uploadPosterAction(
  base64: string,
  name: string,
): Promise<{ ok: boolean; driveFileId?: string; message?: string }> {
  await requireUploader();
  try {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0) return { ok: false, message: "Empty thumbnail." };
    const res = await driveStorage.upload(bytes, { mimeType: "image/jpeg", name });
    if (isErr(res)) return { ok: false, message: res.error.message };
    return { ok: true, driveFileId: res.value.driveFileId };
  } catch {
    return { ok: false, message: "Failed to upload the thumbnail." };
  }
}

/**
 * Nastaví/aktualizuje vlastní poster videa (`posterDriveFileId`). Uploader.
 * Starý poster (pokud byl) se kompenzačně smaže z Drive (idempotentně).
 */
export async function setMediaPosterAction(
  mediaId: string,
  posterDriveFileId: string,
): Promise<ActionResult> {
  await requireUploader();
  const prev = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    select: { posterDriveFileId: true, modelId: true },
  });
  if (!prev) return { ok: false, message: "Media not found." };
  const targetFolder = await resolveTargetDriveFolderId(prev.modelId);
  if (!targetFolder.ok) return { ok: false, message: targetFolder.message };
  const moved = await moveDriveFilesToFolder(targetFolder.driveFolderId, [posterDriveFileId]);
  if (!moved.ok) return moved;
  try {
    await prisma.mediaItem.update({
      where: { id: mediaId },
      data: { posterDriveFileId },
    });
  } catch {
    await driveStorage.deleteFile(posterDriveFileId);
    return { ok: false, message: "Failed to save the thumbnail." };
  }
  if (prev?.posterDriveFileId && prev.posterDriveFileId !== posterDriveFileId) {
    await driveStorage.deleteFile(prev.posterDriveFileId);
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  return OK;
}

// ─── Membership gate sample fotky ─────────────────────────────────────────────

/**
 * Zařadí/odebere médium z výběru „sample" náhledů zobrazených v MembershipGate
 * (admin). Idempotentní. Po změně revaliduje layout, aby se gate obnovil.
 */
export async function setGateSampleAction(
  mediaId: string,
  included: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    if (included) {
      await prisma.membershipGateSample.upsert({
        where: { mediaId },
        create: { mediaId },
        update: {},
      });
    } else {
      await prisma.membershipGateSample.deleteMany({ where: { mediaId } });
    }
  } catch {
    return { ok: false, message: "Failed to change the selection." };
  }
  revalidatePath("/admin/membership-gate");
  revalidatePath("/", "layout");
  return OK;
}

// ─── Správa uživatelů ─────────────────────────────────────────────────────────

/**
 * Změna stavu účtu (R15.1, R15.2). Zablokování navíc ukončí všechny aktivní
 * relace uživatele (R15.4). Při selhání zachová původní stav (R15.7).
 */
export async function setUserStatusAction(
  userId: string,
  next: AccountStatus,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: next } });
      if (next === "blocked") {
        // Revokace relací (R15.4): odstraní DB session záznamy.
        await tx.session.deleteMany({ where: { userId } });
      }
    });
  } catch {
    return { ok: false, message: "Failed to change the account status." };
  }
  revalidatePath("/admin/users");
  return OK;
}

/**
 * Nastavení aktivního členství uživatele (R20/R21). Admin ručně aktivuje/deaktivuje
 * a volitelně nastaví datum expirace (`expiresAt` ISO; `null` = bez expirace).
 * Deaktivace expiraci vynuluje. Při selhání zachová původní stav.
 */
export async function setUserMembershipAction(
  userId: string,
  active: boolean,
  expiresAt: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  let expiry: Date | null = null;
  if (active && expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "Invalid expiration date." };
    }
    expiry = parsed;
  }
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: active ? "active" : "inactive",
        membershipExpiresAt: active ? expiry : null,
      },
    });
  } catch {
    return { ok: false, message: "Failed to change the membership." };
  }
  revalidatePath("/admin/users");
  return OK;
}

/**
 * Změna role uživatele Adminem (feature „distributor", R3.4). Admin nesmí měnit
 * vlastní roli (ochrana před vlastním vylockováním). Po blokaci/změně se nové
 * hodnoty čtou živě z DB (plán 002), takže se projeví na dalším požadavku.
 */
export async function setUserRoleAction(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Vstup z klienta — povol jen platné role (Prisma by sice neplatný enum odmítla,
  // ale validujeme explicitně na hranici důvěry).
  if (role !== "User" && role !== "Distributor" && role !== "Admin") {
    return { ok: false, message: "Invalid role." };
  }
  if (userId === admin.userId) {
    return { ok: false, message: "You cannot change your own role." };
  }
  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  } catch {
    return { ok: false, message: "Failed to change the role." };
  }
  revalidatePath("/admin/users");
  return OK;
}

/**
 * Smazání média (R9.2/9.3). Admin smaže jakékoli; Distributor jen vlastní
 * (`uploaderId`); jinak zamítnuto (feature „distributor").
 */
export async function deleteMediaAction(mediaId: string): Promise<ActionResult> {
  const principal = await requireUploader();
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    select: { uploaderId: true, driveFileId: true, posterDriveFileId: true },
  });
  if (media === null) return { ok: false, message: "Media not found." };
  if (!canDeleteMedia(principal.role, principal.userId, media)) {
    return { ok: false, message: "You do not have permission to delete this media." };
  }
  // Drive nejdřív (aby ho sync nemohl re-import), pak DB. deleteFile je
  // idempotentní (404 = ok). Selhání Drive → DB záznam zůstává (konzistence).
  const driveDeleted = await driveStorage.deleteFile(media.driveFileId);
  if (isErr(driveDeleted)) return { ok: false, message: driveDeleted.error.message };
  // Vlastní poster (pokud byl) — idempotentní úklid, selhání nebrání smazání.
  if (media.posterDriveFileId) await driveStorage.deleteFile(media.posterDriveFileId);
  const result = await createMediaService(prisma).delete(mediaId);
  if (isErr(result)) return { ok: false, message: result.error.message };
  revalidatePath("/admin/media");
  revalidatePath("/");
  return OK;
}

// ─── Viditelnost sekcí ────────────────────────────────────────────────────────

/** Nastaví viditelnost sekce (R16.1). Při selhání perzistence vrátí chybu (R16.4). */
export async function setVisibilityAction(
  sectionKey: string,
  hidden: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const result = await pageVisibilityService.setHidden(sectionKey, hidden);
  if (isErr(result)) return { ok: false, message: result.error.message };
  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
  return OK;
}

// ─── Oznamovací banner ──────────────────────────────────────────────────────

/** Aktivace banneru (R17.1). Neplatný text se odmítne beze změny (R17.3). */
export async function activateNotificationAction(
  text: string,
): Promise<ActionResult> {
  await requireAdmin();
  const result = await notificationService.activate(text);
  if (isErr(result)) return { ok: false, message: result.error.message };
  revalidatePath("/admin/notifications");
  revalidatePath("/", "layout");
  return OK;
}

/** Deaktivace banneru (R17.2). */
export async function deactivateNotificationAction(): Promise<ActionResult> {
  await requireAdmin();
  await notificationService.deactivate();
  revalidatePath("/admin/notifications");
  revalidatePath("/", "layout");
  return OK;
}
