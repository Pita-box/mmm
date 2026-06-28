/**
 * Chybové typy služeb MMMRED.
 *
 * Každá služba vrací `Result<T, E>` (viz `result.ts`) a nikdy nevyhazuje
 * neočekávané výjimky přes svou hranici. Chyby jsou modelovány jako
 * discriminated uniony nad polem `code`, takže route handlery je mohou
 * deterministicky mapovat na HTTP odpovědi (viz Error Handling v designu)
 * a TypeScript dokáže zúžit konkrétní variantu.
 *
 * Volitelné `field` nese název pole u validačních chyb (R2.7, R4.2/4.3/4.5,
 * R17.3, R18.2), `message` je lidsky čitelný popis pro UI / log.
 */

/** Společný tvar validační chyby pole se zachováním původního stavu. */
export type ValidationError = {
  readonly code: "validation";
  readonly field: string;
  readonly message: string;
};

/**
 * Chyby Auth_Service (R2, R3, R18).
 * `invalid_credentials` je záměrně generická — neprozrazuje, které pole
 * je špatně (R2.4).
 */
export type AuthError =
  | ValidationError
  | { readonly code: "invalid_credentials"; readonly message: string }
  | { readonly code: "email_taken"; readonly message: string }
  | { readonly code: "locked_out"; readonly retryAfterMinutes: number; readonly message: string }
  | { readonly code: "account_blocked"; readonly message: string }
  | { readonly code: "session_expired"; readonly message: string }
  | { readonly code: "not_found"; readonly message: string };

/** Chyby validace nahrávaného souboru před uploadem (R5.3). */
export type UploadError =
  | { readonly code: "unsupported_format"; readonly message: string }
  | { readonly code: "file_too_large"; readonly maxBytes: number; readonly message: string };

/** Chyby Media_Service — neplatný stav/přechod nebo neexistující položka (R8.5, R8.6, R9.5). */
export type MediaError =
  | ValidationError
  | { readonly code: "not_found"; readonly message: string }
  | { readonly code: "invalid_state"; readonly message: string }
  | { readonly code: "invalid_schedule"; readonly message: string };

/** Chyby Drive_Connector a streamování (R5.4, R5.6, R6.2, R6.5). */
export type DriveError =
  | { readonly code: "auth_failed"; readonly message: string }
  | { readonly code: "upload_failed"; readonly message: string }
  | { readonly code: "list_failed"; readonly message: string }
  | { readonly code: "not_found"; readonly message: string }
  | { readonly code: "timeout"; readonly timeoutMs: number; readonly message: string }
  | { readonly code: "token_expired"; readonly message: string }
  | { readonly code: "token_invalid"; readonly message: string }
  | { readonly code: "unauthorized"; readonly message: string };

/** Chyby Tag_Service (R7.3, R7.6, R7.7). */
export type TagError =
  | ValidationError
  | { readonly code: "invalid_category"; readonly message: string }
  | { readonly code: "category_limit_exceeded"; readonly limit: number; readonly message: string };

/** Chyby Model_Service (R4). */
export type ModelError =
  | ValidationError
  | { readonly code: "not_found"; readonly message: string };

/** Chyby Collection_Service (R14). */
export type CollectionError =
  | ValidationError
  | { readonly code: "not_found"; readonly message: string }
  | { readonly code: "forbidden"; readonly message: string }
  | { readonly code: "media_not_approved"; readonly message: string }
  | { readonly code: "item_not_in_collection"; readonly message: string };

/** Chyby Notification_Service (R17.3). */
export type NotificationError = ValidationError;

/**
 * Chyby Telegram_Service (R19.3). `destination_unavailable` znamená, že
 * nakonfigurovaná URL chybí nebo nemá platný formát — přesměrování se zruší.
 */
export type TelegramError = {
  readonly code: "destination_unavailable";
  readonly message: string;
};

/** Chyby Page_Visibility_Service při selhání perzistence (R16.4). */
export type VisibilityError = {
  readonly code: "persist_failed";
  readonly message: string;
};

/** Chyby Subscription_Service / Stripe webhooku [POST-MVP] (R20.5). */
export type SubscriptionError =
  | { readonly code: "webhook_unverified"; readonly message: string }
  | { readonly code: "not_found"; readonly message: string };
