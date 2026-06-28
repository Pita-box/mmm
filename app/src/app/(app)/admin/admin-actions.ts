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
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { requireAdmin, requireUploader } from "@/lib/session";
import { driveStorage } from "@/lib/drive";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import type { AccountStatus, Role } from "@/lib/domain";
import { canDeleteMedia } from "@/lib/permissions";
import {
  createMediaService,
  validateUpload,
  classifyType,
} from "@/services/media-service";
import { createTagService } from "@/services/tag-service";
import { modelService } from "@/services/model-service";
import { pageVisibilityService } from "@/services/page-visibility-service";
import { notificationService } from "@/services/notification-service";

/** Sjednocený výsledek admin akce pro UI (úspěch / chybová hláška). */
export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

const OK: ActionResult = { ok: true };

/** Interní signál pro rollback uploadu uvnitř transakce (nese hlášku pro UI). */
class UploadAbort extends Error {}

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
  revalidatePath("/admin/models");
  revalidatePath("/models");
  return OK;
}

// ─── Upload média ───────────────────────────────────────────────────────────

/** Hodnoty pro upload (kompatibilní s `MediaUploadForm.onSubmit`). */
export interface UploadMediaInput {
  readonly file: File;
  /** Profil modelu, nebo `null` — přiřazení k modelu je nepovinné. */
  readonly modelId: string | null;
  readonly tags: Partial<Record<TagCategory, string[]>>;
  readonly publishAt: string | null;
}

/**
 * Upload média: nahraje soubor na Drive a teprve poté vytvoří Media_Item.
 * Selže-li perzistence po úspěšném uploadu, soubor se z Drive kompenzačně
 * smaže (rollback) — nikdy nevznikne osiřelý záznam ani osiřelý soubor
 * (R5.1, R5.4, R5.6).
 */
export async function uploadMediaAction(
  input: UploadMediaInput,
): Promise<ActionResult> {
  const principal = await requireUploader();

  const meta = { mimeType: input.file.type, sizeBytes: input.file.size };
  const validated = validateUpload(meta);
  if (isErr(validated)) return { ok: false, message: validated.error.message };

  if (classifyType(input.file.type) === null) {
    return { ok: false, message: "Nepodporovaný formát souboru." };
  }

  // Drive upload (R5.1). Selhání/timeout/auth → žádný záznam (R5.4, R5.6).
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const uploaded = await driveStorage.upload(bytes, {
    mimeType: input.file.type,
    name: input.file.name,
  });
  if (isErr(uploaded)) return { ok: false, message: uploaded.error.message };

  return persistMediaWithTags({
    driveFileId: uploaded.value.driveFileId,
    modelId: input.modelId,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    publishAt: input.publishAt ? new Date(input.publishAt) : null,
    tags: input.tags,
    uploaderId: principal.userId,
  });
}

/** Vstup pro finalizaci resumable uploadu (Approach B): soubor je už na Drive. */
export interface FinalizeUploadInput {
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly modelId: string | null;
  readonly tags: Partial<Record<TagCategory, string[]>>;
  readonly publishAt: string | null;
}

/**
 * Vytvoří resumable upload session (Approach B, plán 007). Klient pak nahraje
 * soubor po částech PŘÍMO do Googlu (bajty nejdou přes server → obejde 1MB limit
 * Server Actions i zátěž serveru). Vrací `uploadUrl` session.
 */
export async function createUploadSessionAction(
  name: string,
  mimeType: string,
): Promise<{ ok: boolean; uploadUrl?: string; message?: string }> {
  await requireUploader();
  if (classifyType(mimeType) === null) {
    return { ok: false, message: "Nepodporovaný formát souboru." };
  }
  const res = await driveStorage.createResumableSession({ name, mimeType });
  if (isErr(res)) return { ok: false, message: res.error.message };
  return { ok: true, uploadUrl: res.value.uploadUrl };
}

/**
 * Finalizace resumable uploadu (Approach B): soubor už je na Drive (klient ho
 * nahrál přes session), tady jen vznikne `Media_Item` + štítky (atomicky, s
 * kompenzačním smazáním souboru při selhání). R5.1/R5.4/R5.6.
 */
export async function finalizeDriveUploadAction(
  input: FinalizeUploadInput,
): Promise<ActionResult> {
  const principal = await requireUploader();
  if (classifyType(input.mimeType) === null) {
    return { ok: false, message: "Nepodporovaný formát souboru." };
  }
  return persistMediaWithTags({
    driveFileId: input.driveFileId,
    modelId: input.modelId,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    publishAt: input.publishAt ? new Date(input.publishAt) : null,
    tags: input.tags,
    uploaderId: principal.userId,
  });
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
  /** false = po vytvoření skrýt (wizard „uložit skryté", plán 012). Default published. */
  readonly publish?: boolean;
}

/**
 * Sdílené uložení Media_Item + štítků v jedné transakci; při selhání rollback +
 * kompenzační smazání souboru z Drive (žádný osiřelý záznam ani soubor, R5.4/5.6).
 * Sdílí ji `uploadMediaAction` (server upload) i `finalizeDriveUploadAction`
 * (resumable upload — soubor už na Drive je).
 */
async function persistMediaWithTags(input: PersistMediaInput): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
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
      });
      if (isErr(created)) throw new UploadAbort(created.error.message);

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
    });
  } catch (e) {
    // Rollback transakce zahodil Media_Item; smaž i soubor na Drive (R5.4).
    await driveStorage.deleteFile(input.driveFileId);
    return {
      ok: false,
      message: e instanceof UploadAbort ? e.message : "Uložení média selhalo.",
    };
  }

  revalidatePath("/admin/media");
  revalidatePath("/");
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
    return { ok: false, message: "GDRIVE_ROOT_FOLDER_ID není nastaven." };
  }
  const listed = await driveStorage.listFiles(folderId);
  if (isErr(listed)) return { ok: false, message: listed.error.message };

  const service = createMediaService(prisma);
  const imported = await service.importFromDrive(listed.value, principal.userId);
  if (isErr(imported)) return { ok: false, message: imported.error.message };

  // Sync mazání: odeber média, jejichž soubor už na Drive není (pojistka:
  // prázdný výpis nemaže nic, řeší `removeMissing`).
  const removed = await service.removeMissing(
    listed.value.map((f) => f.driveFileId),
  );
  if (isErr(removed)) return { ok: false, message: removed.error.message };

  revalidatePath("/admin/media");
  revalidatePath("/");
  return {
    ok: true,
    message: `Naimportováno ${imported.value.imported}, přeskočeno ${imported.value.skipped}, odebráno ${removed.value.removed}.`,
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
    const res = await service.publishNow(mediaId);
    if (isErr(res)) return { ok: false, message: res.error.message };
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
  if (modelId) {
    const res = await modelService.assignMedia(mediaId, modelId);
    if (isErr(res)) return { ok: false, message: res.error.message };
  } else {
    // Odpojení od modelu — médium zůstává, jen ztratí příslušnost k albu.
    try {
      await prisma.mediaItem.update({ where: { id: mediaId }, data: { modelId: null } });
    } catch {
      return { ok: false, message: "Odpojení od modelu se nezdařilo." };
    }
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  revalidatePath("/models");
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
): Promise<ActionResult> {
  await requireUploader();
  const service = createTagService(prisma);
  const upserted = await service.upsertValue(category, value);
  if (isErr(upserted)) return { ok: false, message: upserted.error.message };
  const assigned = await service.assignValueToMedia(mediaId, upserted.value.id);
  if (isErr(assigned)) return { ok: false, message: assigned.error.message };
  revalidatePath("/admin/media");
  revalidatePath("/");
  return OK;
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

/** Jedna položka k finalizaci z wizardu (soubor už na Drive). */
export interface WizardUploadItem {
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly modelId: string | null;
  readonly tags: Partial<Record<TagCategory, string[]>>;
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
  for (const item of items) {
    if (classifyType(item.mimeType) === null) {
      failed++;
      lastError = "Nepodporovaný formát souboru.";
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
      publish,
    });
    if (res.ok) created++;
    else {
      failed++;
      lastError = res.message;
    }
  }
  revalidatePath("/admin/media");
  revalidatePath("/");
  return {
    ok: failed === 0,
    created,
    failed,
    message: failed > 0 ? `Vytvořeno ${created}, selhalo ${failed}. ${lastError ?? ""}`.trim() : undefined,
  };
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
    return { ok: false, message: "Změna stavu účtu se nezdařila." };
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
    return { ok: false, message: "Neplatná role." };
  }
  if (userId === admin.userId) {
    return { ok: false, message: "Nelze měnit vlastní roli." };
  }
  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  } catch {
    return { ok: false, message: "Změna role se nezdařila." };
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
    select: { uploaderId: true },
  });
  if (media === null) return { ok: false, message: "Médium nebylo nalezeno." };
  if (!canDeleteMedia(principal.role, principal.userId, media)) {
    return { ok: false, message: "Nemáte oprávnění smazat toto médium." };
  }
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
