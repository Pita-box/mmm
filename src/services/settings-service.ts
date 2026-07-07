/**
 * Settings_Service — uložení uživatelského profilu na stránce Settings (task 18.1).
 *
 * Stránka Settings umožňuje uživateli upravit hodnoty svého profilu. Tento
 * soubor odděluje **čisté jádro** (validace polí) od **perzistentní vrstvy**
 * (Prisma). Čistá validace je bez I/O a přímo testovatelná generátory
 * (PBT task 18.2); perzistentní operace jsou vystaveny přes
 * `createSettingsService(prisma)` a vracejí `Result<…, SettingsError>` — nikdy
 * nevyhazují výjimku přes svou hranici.
 *
 * Klíčová pravidla (R18.1, R18.2):
 *  - uložení platných hodnot je perzistuje a opětovné načtení je vrátí (R18.1),
 *  - neplatné pole (prázdné povinné pole nebo hodnota > 255 znaků) je odmítnuto,
 *    původní hodnoty profilu zůstanou beze změny a vrátí se chyba s názvem
 *    konkrétního neplatného pole — žádný částečný zápis (R18.2).
 *
 * Pozn.: Změna hesla je řešena samostatně v Auth_Service (R18.3–18.5, task 4.1).
 */
import type { PrismaClient, User } from "@prisma/client";
import type { ValidationError } from "@/lib/errors";
import { ok, err, isErr, type Result } from "@/lib/result";
import { validateProfileField } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

// ─── Typy ───────────────────────────────────────────────────────────────────

/**
 * Chyby Settings_Service: validace pole (R18.2) nebo neexistující uživatel.
 * Skládá se ze sdíleného `ValidationError` (R18.2) a `not_found`.
 */
export type SettingsError =
  | ValidationError
  | { readonly code: "not_found"; readonly message: string };

/**
 * Editovatelná pole profilu na stránce Settings. Aktuálně zobrazované jméno
 * (`displayName`) je povinné neprázdné pole délky 1–255 (R18.2).
 */
export interface SaveProfileInput {
  readonly displayName: string;
}

/** Hodnoty profilu vrácené při čtení (round-trip ověření — R18.1). */
export interface ProfileValues {
  readonly displayName: string;
}

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Validace polí profilu (R18.2). Každé povinné pole musí být neprázdné a mít
 * délku ≤ 255. Vrací typovanou `ValidationError` s názvem pole, aby volající
 * (a UI) mohlo zvýraznit konkrétní neplatné pole; při chybě se nikdy nic
 * neperzistuje (žádný částečný zápis).
 */
export function validateProfileSave(
  input: SaveProfileInput,
): Result<void, SettingsError> {
  if (!validateProfileField(input.displayName)) {
    return err({
      code: "validation",
      field: "displayName",
      message: "Zobrazované jméno je povinné a smí mít nejvýše 255 znaků.",
    });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

export interface SettingsService {
  /** Načte aktuální hodnoty profilu uživatele (R18.1 round-trip). */
  getProfile(userId: string): Promise<Result<ProfileValues, SettingsError>>;
  /**
   * Uloží hodnoty profilu. Platné hodnoty perzistuje (R18.1); neplatné pole
   * odmítne a zachová původní hodnoty beze změny (R18.2).
   */
  saveProfile(
    userId: string,
    input: SaveProfileInput,
  ): Promise<Result<ProfileValues, SettingsError>>;
}

const USER_NOT_FOUND: SettingsError = {
  code: "not_found",
  message: "Uživatel nebyl nalezen.",
};

/** Serializace User → hodnoty profilu (displayName může být v DB null). */
function toProfileValues(user: User): ProfileValues {
  return { displayName: user.displayName ?? "" };
}

/**
 * Vytvoří instanci Settings_Service nad daným Prisma klientem.
 * Čistá validace je vystavena i jako samostatný export (pro PBT bez I/O).
 */
export function createSettingsService(prisma: PrismaClient): SettingsService {
  return {
    async getProfile(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user === null) return err(USER_NOT_FOUND);
      return ok(toProfileValues(user));
    },

    async saveProfile(userId, input) {
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (existing === null) return err(USER_NOT_FOUND);

      // Neplatné pole → původní hodnoty beze změny, žádný zápis (R18.2).
      const v = validateProfileSave(input);
      if (isErr(v)) return v;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { displayName: input.displayName },
      });
      return ok(toProfileValues(updated));
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient. */
export const settingsService: SettingsService = createSettingsService(prisma);
