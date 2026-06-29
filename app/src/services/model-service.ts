/**
 * Model_Service — správa profilů modelů (task 13.1).
 *
 * Profil modelu (artist page) nese jméno a volitelné bio a slouží jako kořen,
 * ke kterému jsou přiřazena média. Tento soubor odděluje **čisté jádro**
 * (validace vstupu) od **perzistentní vrstvy** (Prisma). Čistá validace je bez
 * I/O a přímo testovatelná generátory (PBT tasky 13.2–13.3); perzistentní
 * operace jsou vystaveny přes `createModelService(prisma)` a vracejí
 * `Result<…, ModelError>` — nikdy nevyhazují výjimku přes svou hranici.
 *
 * Klíčová pravidla (R4, R13):
 *  - jméno délky 1–100, bio délky 0–1000 (validace ze sdíleného jádra),
 *  - neplatný vstup při vytvoření profil nevytvoří (R4.2, R4.3),
 *  - neplatný vstup při editaci zachová původní hodnoty beze změny (R4.5),
 *  - galerie modelu vrací výhradně Approved_Media (R13.4) — sdílí invariant
 *    viditelnosti s Media_Service (`visibleMedia`),
 *  - operace nad neexistujícím profilem/modelem vrací chybu not_found
 *    (R4.6, R13.6).
 */
import type { PrismaClient, ModelProfile, MediaItem } from "@prisma/client";
import type { ModelError } from "@/lib/errors";
import { ok, err, isErr, type Result } from "@/lib/result";
import { validateModelName, validateBio } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { visibleMedia } from "./media-service";

// ─── Vstupní typy ────────────────────────────────────────────────────────────

/** Vstup pro vytvoření profilu (R4.1). Bio je volitelné, výchozí prázdné. */
export interface CreateProfileInput {
  readonly name: string;
  readonly bio?: string;
}

/** Částečná editace profilu (R4.4). Neuvedená pole zůstanou beze změny. */
export interface UpdateProfileInput {
  readonly name?: string;
  readonly bio?: string;
}

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Validace hodnot profilu (R4.1–R4.5). Jméno se kontroluje jako první.
 * Vrací typovanou `ValidationError` s názvem pole, aby volající (a UI) mohlo
 * zvýraznit konkrétní neplatné pole; při chybě se nikdy nic neperzistuje.
 */
export function validateProfileInput(input: {
  name: string;
  bio: string;
}): Result<void, ModelError> {
  if (!validateModelName(input.name)) {
    return err({
      code: "validation",
      field: "name",
      message: "Jméno modelu musí mít délku 1–100 znaků.",
    });
  }
  if (!validateBio(input.bio)) {
    return err({
      code: "validation",
      field: "bio",
      message: "Bio modelu nesmí přesáhnout 1000 znaků.",
    });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

/** Náhled modelu pro mřížku /models: název, počet a poslední média (R13.1). */
export interface ProfilePreview {
  readonly id: string;
  readonly name: string;
  readonly mediaCount: number;
  /** ID posledních (max 3) Approved_Media, nejnovější první (pro collage). */
  readonly recentMediaIds: readonly string[];
}

export interface ModelService {
  createProfile(input: CreateProfileInput): Promise<Result<ModelProfile, ModelError>>;
  getProfile(id: string): Promise<Result<ModelProfile, ModelError>>;
  listProfiles(): Promise<ModelProfile[]>;
  /** Modely s náhledem (počet + poslední 3 Approved_Media) pro mřížku /models. */
  listProfilesWithPreview(now?: Date): Promise<ProfilePreview[]>;
  updateProfile(
    id: string,
    patch: UpdateProfileInput,
  ): Promise<Result<ModelProfile, ModelError>>;
  deleteProfile(id: string): Promise<Result<void, ModelError>>;
  /** Galerie modelu — výhradně Approved_Media vůči `now` (R13.4). */
  getGallery(modelId: string, now?: Date): Promise<Result<MediaItem[], ModelError>>;
  /** Přiřazení existujícího média k profilu (R4.6). */
  assignMedia(
    mediaId: string,
    modelId: string,
  ): Promise<Result<MediaItem, ModelError>>;
}

const PROFILE_NOT_FOUND: ModelError = {
  code: "not_found",
  message: "Profil modelu nebyl nalezen.",
};

/**
 * Vytvoří instanci Model_Service nad daným Prisma klientem.
 * Čistá validace je vystavena i jako samostatný export (pro PBT bez I/O).
 */
export function createModelService(prisma: PrismaClient): ModelService {
  return {
    async createProfile(input) {
      const bio = input.bio ?? "";
      const v = validateProfileInput({ name: input.name, bio });
      if (isErr(v)) return v; // neplatný vstup → žádný profil (R4.2, R4.3)

      const created = await prisma.modelProfile.create({
        data: { name: input.name, bio },
      });
      return ok(created);
    },

    async getProfile(id) {
      const profile = await prisma.modelProfile.findUnique({ where: { id } });
      if (profile === null) return err(PROFILE_NOT_FOUND); // R13.6
      return ok(profile);
    },

    listProfiles() {
      // Seznam všech modelů pro stránku Models (R13.1).
      return prisma.modelProfile.findMany({ orderBy: { createdAt: "desc" } });
    },

    async listProfilesWithPreview(now = new Date()) {
      const profiles = await prisma.modelProfile.findMany({
        orderBy: { createdAt: "desc" },
        include: { media: true },
      });
      return profiles.map((p) => {
        // Jen Approved_Media (R13.4), nejnovější první → collage z posledních 3.
        const visible = visibleMedia(p.media, now).sort(
          (a, b) => b.publishAt!.getTime() - a.publishAt!.getTime(),
        );
        return {
          id: p.id,
          name: p.name,
          mediaCount: visible.length,
          recentMediaIds: visible.slice(0, 3).map((m) => m.id),
        };
      });
    },

    async updateProfile(id, patch) {
      const existing = await prisma.modelProfile.findUnique({ where: { id } });
      if (existing === null) return err(PROFILE_NOT_FOUND); // R13.6

      // Neuvedená pole převezmou původní hodnotu; prázdný řetězec se zachová.
      const name = patch.name ?? existing.name;
      const bio = patch.bio ?? existing.bio ?? "";

      const v = validateProfileInput({ name, bio });
      if (isErr(v)) return v; // neplatný vstup → původní hodnoty beze změny (R4.5)

      const updated = await prisma.modelProfile.update({
        where: { id },
        data: { name, bio },
      });
      return ok(updated);
    },

    async deleteProfile(id) {
      const existing = await prisma.modelProfile.findUnique({ where: { id } });
      if (existing === null) return err(PROFILE_NOT_FOUND);

      // Smazání profilu kaskádově odstraní jeho média (onDelete: Cascade).
      await prisma.modelProfile.delete({ where: { id } });
      return ok();
    },

    async getGallery(modelId, now = new Date()) {
      const profile = await prisma.modelProfile.findUnique({
        where: { id: modelId },
        include: { media: true },
      });
      if (profile === null) return err(PROFILE_NOT_FOUND); // R13.6
      // Galerie obsahuje výhradně Approved_Media (R13.4); ostatní stavy se vynechají.
      return ok(visibleMedia(profile.media, now));
    },

    async assignMedia(mediaId, modelId) {
      const profile = await prisma.modelProfile.findUnique({ where: { id: modelId } });
      if (profile === null) {
        // Přiřazení k neexistujícímu profilu je odmítnuto (R4.6).
        return err({ code: "not_found", message: "Profil modelu neexistuje." });
      }
      const media = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
      if (media === null) {
        return err({ code: "not_found", message: "Médium nebylo nalezeno." });
      }
      const updated = await prisma.mediaItem.update({
        where: { id: mediaId },
        data: { modelId },
      });
      return ok(updated);
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient. */
export const modelService: ModelService = createModelService(prisma);
