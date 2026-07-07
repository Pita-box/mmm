"use server";

/**
 * Server actions stránky Settings (task 21.2).
 *
 * - `saveProfileAction` — uloží profil přes Settings_Service; neplatné pole
 *   odmítne a zachová původní hodnoty (R18.1, R18.2).
 * - `changePasswordAction` — změní heslo přes Auth_Service s ověřením
 *   stávajícího hesla a délky nového (R18.3–R18.5).
 * - `telegramTargetAction` — vyhodnotí nakonfigurovanou Telegram URL přes
 *   čistý resolver a vrátí cíl k otevření v nové záložce (R19.1, R19.3).
 */
import { isErr } from "@/lib/result";
import { getSessionPrincipal } from "@/lib/session";
import { settingsService } from "@/services/settings-service";
import { authService } from "@/services/auth-service";
import { resolveTelegramRedirect } from "@/services/telegram-service";

export interface FormState {
  readonly ok: boolean;
  readonly error: string | null;
}

const NOT_AUTHENTICATED: FormState = {
  ok: false,
  error: "Your session has expired. Please sign in again.",
};

/** Uložení profilu (R18.1, R18.2). */
export async function saveProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const principal = await getSessionPrincipal();
  if (principal === null) return NOT_AUTHENTICATED;

  const displayName = String(formData.get("displayName") ?? "");
  const result = await settingsService.saveProfile(principal.userId, {
    displayName,
  });
  if (isErr(result)) return { ok: false, error: result.error.message };
  return { ok: true, error: null };
}

/** Změna hesla (R18.3–R18.5). */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const principal = await getSessionPrincipal();
  if (principal === null) return NOT_AUTHENTICATED;

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const result = await authService.changePassword(
    principal.userId,
    current,
    next,
  );
  if (isErr(result)) return { ok: false, error: result.error.message };
  return { ok: true, error: null };
}

/** Cíl přesměrování na Telegram, nebo chyba o nedostupném cíli (R19.1/R19.3). */
export type TelegramTarget =
  | { readonly url: string }
  | { readonly error: string };

export async function telegramTargetAction(): Promise<TelegramTarget> {
  const result = resolveTelegramRedirect(
    process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL,
  );
  if (isErr(result)) return { error: result.error.message };
  return { url: result.value.url };
}
