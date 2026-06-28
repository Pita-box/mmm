/**
 * Sdílená validační jádra MMMRED — čisté funkce bez I/O.
 *
 * Tyto predikáty jsou záměrně bez vedlejších efektů a bez závislosti na DB,
 * síti nebo času, aby byly přímo testovatelné property-based testy (fast-check).
 * Vrací `boolean` (platné / neplatné). Mapování na konkrétní `ValidationError`
 * (s názvem pole a hláškou) řeší volající služby, ne tato vrstva.
 *
 * Délkové meze odpovídají akceptačním kritériím v requirements.md:
 *   e-mail 5–254, heslo 8–128, jméno modelu 1–100, bio 0–1000,
 *   text oznámení 1–500, název kolekce 1–100, pole profilu 1–255.
 *
 * _Requirements: 2.1, 2.7, 4.1, 4.2, 4.3, 14.6, 17.3, 18.2, 19.3_
 */

/** Délkové meze (inkluzivní) pro jednotlivá pole. Jediný zdroj pravdy. */
export const LENGTH_BOUNDS = {
  email: { min: 5, max: 254 },
  password: { min: 8, max: 128 },
  modelName: { min: 1, max: 100 },
  bio: { min: 0, max: 1000 },
  notificationText: { min: 1, max: 500 },
  collectionName: { min: 1, max: 100 },
  profileField: { min: 1, max: 255 },
} as const;

/**
 * Formát e-mailu `local@domain`: neprázdná lokální část, jediné `@`,
 * doména s alespoň jednou tečkou (TLD). Bez bílých znaků a dalšího `@`.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vrátí true, pokud délka řetězce leží v inkluzivním rozsahu [min, max]. */
function isLengthInRange(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

/** E-mail: formát `local@domain` a délka 5–254 (R2.1, R2.7). */
export function validateEmail(email: string): boolean {
  return (
    isLengthInRange(email, LENGTH_BOUNDS.email.min, LENGTH_BOUNDS.email.max) &&
    EMAIL_PATTERN.test(email)
  );
}

/** Heslo: délka 8–128 (R2.1, R2.7, R18.5). */
export function validatePassword(password: string): boolean {
  return isLengthInRange(
    password,
    LENGTH_BOUNDS.password.min,
    LENGTH_BOUNDS.password.max,
  );
}

/** Jméno modelu: délka 1–100 (R4.1, R4.2). */
export function validateModelName(name: string): boolean {
  return isLengthInRange(
    name,
    LENGTH_BOUNDS.modelName.min,
    LENGTH_BOUNDS.modelName.max,
  );
}

/** Bio modelu: délka 0–1000, prázdné je povolené (R4.1, R4.3). */
export function validateBio(bio: string): boolean {
  return isLengthInRange(bio, LENGTH_BOUNDS.bio.min, LENGTH_BOUNDS.bio.max);
}

/** Text oznamovacího banneru: délka 1–500 (R17.3). */
export function validateNotificationText(text: string): boolean {
  return isLengthInRange(
    text,
    LENGTH_BOUNDS.notificationText.min,
    LENGTH_BOUNDS.notificationText.max,
  );
}

/** Název kolekce: délka 1–100 (R14.6). */
export function validateCollectionName(name: string): boolean {
  return isLengthInRange(
    name,
    LENGTH_BOUNDS.collectionName.min,
    LENGTH_BOUNDS.collectionName.max,
  );
}

/** Pole profilu v Settings: povinné neprázdné, délka 1–255 (R18.2). */
export function validateProfileField(value: string): boolean {
  return isLengthInRange(
    value,
    LENGTH_BOUNDS.profileField.min,
    LENGTH_BOUNDS.profileField.max,
  );
}

/**
 * Cíl Telegram: neprázdný řetězec s platným formátem URL (R19.3).
 * Validace je čistá — využívá `URL` konstruktor (žádný síťový požadavek).
 */
export function isValidUrl(value: string): boolean {
  if (value.length === 0) return false;
  try {
    // `URL` vyžaduje schéma (např. https:), takže holé řetězce neprojdou.
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
