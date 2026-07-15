/**
 * Sdílené doménové typy MMMRED.
 *
 * Stringové literálové uniony odpovídají enumům v Prisma schématu (task 2.1)
 * a invariantům z designu (Data Models). Drží se zde jako jediný zdroj pravdy
 * pro doménový jazyk napříč službami i UI.
 */

/** Role uživatele. Každý účet má právě jednu; výchozí je `User` (R3.1, R3.2).
 *  `Distributor` smí nahrávat/editovat média a mazat jen ta vlastní. */
export type Role = "Admin" | "Distributor" | "User";

/** Stav účtu. Zablokovaný účet je považován za neautentizovaný (R15.3). */
export type AccountStatus = "active" | "blocked";

/** Stav předplatného. Nový účet je výchozí `inactive` (R20.7). */
export type SubscriptionStatus = "active" | "inactive";

/** Typ média odvozený z MIME typu při nahrání (R5.2). */
export type MediaType = "photo" | "video";

/** Stav položky média v publikačním cyklu (viz stavový diagram v designu). */
export type MediaStatus = "scheduled" | "published" | "hidden";

/**
 * Pevná, neměnná množina šesti kategorií štítků (R7.1, R7.7).
 * Mimo tuto množinu nelze vytvořit žádnou kategorii.
 */
export type TagCategory =
  | "Category"
  | "Face type"
  | "Body type"
  | "Body hair"
  | "Hair color"
  | "Clothes";

/** Přesně 6 fixních kategorií, v kanonickém pořadí (R7.1). */
export const FIXED_CATEGORIES: readonly TagCategory[] = [
  "Category",
  "Face type",
  "Body type",
  "Body hair",
  "Hair color",
  "Clothes",
] as const;

/** Veřejné cesty dostupné bez autentizace (R1.2). Paywall je [POST-MVP]. */
export const PUBLIC_PATHS = [
  "/signin",
  "/signup",
  "/paywall",
  "/api/webhooks/telegram",
  "/api/cron/scheduler",
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];
