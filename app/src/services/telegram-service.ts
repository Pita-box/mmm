/**
 * Telegram_Service — čistý resolver přesměrování na privátní Telegram skupinu
 * (R19). Sám nenaviguje: vrací cíl přesměrování, který UI vrstva otevře v nové
 * záložce. Tím zůstává logika deterministická a testovatelná bez prohlížeče.
 *
 * Pravidlo (Property 39): přesměrování proběhne *právě tehdy*, když je
 * nakonfigurovaná hodnota neprázdný řetězec s platným formátem URL (R19.1).
 * Jinak (chybí / prázdné / neplatný formát) se vrátí chyba
 * `destination_unavailable` (R19.3).
 */

import { type Result, ok, err } from "@/lib/result";
import { type TelegramError } from "@/lib/errors";
import { isValidUrl } from "@/lib/validation";

/**
 * Cíl přesměrování na Telegram. `target: "_blank"` kóduje požadavek otevřít
 * URL v nové záložce a ponechat původní stránku otevřenou (R19.2).
 */
export type TelegramRedirect = {
  readonly url: string;
  readonly target: "_blank";
};

/**
 * Vyhodnotí nakonfigurovanou Telegram URL a vrátí cíl přesměrování.
 *
 * @param configuredUrl Nakonfigurovaná URL skupiny; může chybět (`null`/`undefined`).
 * @returns `Ok<TelegramRedirect>` pro platnou URL, jinak `Err<TelegramError>`.
 */
export function resolveTelegramRedirect(
  configuredUrl: string | null | undefined,
): Result<TelegramRedirect, TelegramError> {
  if (typeof configuredUrl === "string" && isValidUrl(configuredUrl)) {
    return ok({ url: configuredUrl, target: "_blank" });
  }
  return err({
    code: "destination_unavailable",
    message: "Cíl Telegram není dostupný.",
  });
}
