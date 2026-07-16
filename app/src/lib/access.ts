/**
 * Access_Middleware — čistá rozhodovací funkce `decideAccess`.
 *
 * Vyhodnocuje, zda smí příchozí požadavek pokračovat, nebo má být odepřen,
 * a to bez jakéhokoli I/O. Veškerý kontext (cesta, relace, role, stav účtu,
 * viditelnost sekcí, stav předplatného, čas) přichází přes `RequestContext`,
 * takže funkce je deterministická a přímo property-testovatelná.
 *
 * Pořadí vyhodnocení (viz „Tok přístupového rozhodnutí" v designu):
 *   1. veřejná cesta            → allow
 *   2. autentizace              → redirectSignIn (stránka) / deny401 (API)
 *      (zahrnuje platnou relaci, aktivní účet i neexpirovanou inaktivitu)
 *   3. page visibility          → deny404 (sekce skrytá; Admin má přístup vždy)
 *   4. role                     → deny403 (admin cesta pro ne-Admina)
 *   5. předplatné [POST-MVP]    → redirectPaywall (jen když PAYMENTS_ENABLED)
 *
 * Validuje Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.3, 9.6, 15.3, 15.4,
 * 16.3, 20.6, 21.1, 21.2, 21.3, 21.4, 21.5.
 */

import {
  PUBLIC_PATHS,
  type Role,
  type AccountStatus,
  type SubscriptionStatus,
} from "./domain";

/** Relace vyprší po 30 minutách nečinnosti (R1.6, R2.3). */
export const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

/** Stav relace nesený kontextem. `null` znamená neautentizovaný požadavek. */
export interface SessionContext {
  /** Čas poslední aktivity; od něj se počítá 30min inaktivita. */
  readonly lastActivityAt: Date;
  readonly inactivityLimitMs?: number;
}

/**
 * Vstupní kontext rozhodnutí. Drží vše, co je k rozhodnutí potřeba, a nic víc —
 * žádné HTTP objekty, žádné DB handle. Route handler / middleware si tento
 * kontext sestaví a předá sem.
 */
export interface RequestContext {
  /** Požadovaná cesta (pathname bez query), např. `/models/123`. */
  readonly path: string;
  /** Je cílem API endpoint? Rozlišuje redirect (stránka) vs stavový kód (API). */
  readonly isApiRoute: boolean;
  /** Aktuální čas pro vyhodnocení inaktivity relace. */
  readonly now: Date;
  /** Aktivní relace, nebo `null` pokud žádná není. */
  readonly session: SessionContext | null;
  /** Role přihlášeného uživatele (relevantní jen při existující relaci). */
  readonly role: Role | null;
  /** Stav účtu; zablokovaný účet je považován za neautentizovaný (R15.3). */
  readonly accountStatus: AccountStatus;
  /** Mapa `sekce → skrytá`; skrytá sekce vrací 404 (R16.3). */
  readonly hiddenSections: Readonly<Record<string, boolean>>;
  /** Stav předplatného (vynucuje se jen v post-MVP režimu, R20.6/R21.2). */
  readonly subscriptionStatus: SubscriptionStatus;
}

/** Konfigurace režimu — jediný přepínač platební bariéry (R21.3). */
export interface AccessConfig {
  /** `false` = MVP režim bez kontroly předplatného; `true` = post-MVP. */
  readonly paymentsEnabled: boolean;
}

/** Výsledek rozhodnutí. Stránkové redirecty vs. API stavové kódy. */
export interface AccessDecision {
  readonly outcome:
    | "allow"
    | "redirectSignIn"
    | "redirectPaywall"
    | "deny401"
    | "deny403"
    | "deny404";
  /** Zachování cíle pro návrat po přihlášení (R21.4). */
  readonly callbackUrl?: string;
}

/** Normalizuje cestu na porovnání: odstraní koncové lomítko (kromě kořene). */
function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "") || "/";
  }
  return path;
}

/** Je cesta veřejná (Sign In / Sign Up / Paywall)? (R1.3) */
function isPublicPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (PUBLIC_PATHS as readonly string[]).includes(normalized);
}

/** Klíč sekce odvozený z cesty (první segment, u API přeskočí `api`). */
function sectionKey(path: string): string | null {
  const segments = normalizePath(path).split("/").filter(Boolean);
  if (segments.length === 0) return null; // kořen (Preview) — bez klíče sekce
  const index = segments[0] === "api" ? 1 : 0;
  return segments[index] ?? null;
}

/** Je cesta administrátorská? `/admin/**` i `/api/admin/**` (R3.3). */
function isAdminPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    normalized === "/api/admin" ||
    normalized.startsWith("/api/admin/")
  );
}

/**
 * Podmnožina admin cest dostupná i roli Distributor: rozcestník `/admin` a
 * sekce médií/modelů (vč. /api). Správa uživatelů, rolí, viditelnosti a
 * oznámení sem nepatří (zůstává Admin-only). Feature „distributor".
 */
function isUploaderAdminPath(path: string): boolean {
  const n = normalizePath(path);
  if (n === "/admin" || n === "/api/admin") return true;
  for (const base of ["/admin/media", "/admin/models", "/api/admin/media", "/api/admin/models"]) {
    if (n === base || n.startsWith(`${base}/`)) return true;
  }
  return false;
}

/** Vypršela relace kvůli 30min inaktivitě? (R1.6) */
function isSessionExpired(session: SessionContext, now: Date): boolean {
  const elapsed = now.getTime() - session.lastActivityAt.getTime();
  return elapsed >= (session.inactivityLimitMs ?? SESSION_INACTIVITY_LIMIT_MS);
}

/**
 * Je požadavek plně autentizovaný? Vyžaduje existující relaci, aktivní účet
 * a relaci, která nevypršela. Zablokovaný účet i vypršelá relace jsou
 * považovány za neautentizované (R1.6, R15.3, R15.4).
 */
function isAuthenticated(ctx: RequestContext): boolean {
  if (ctx.session === null) return false;
  if (ctx.accountStatus !== "active") return false;
  if (isSessionExpired(ctx.session, ctx.now)) return false;
  return true;
}

/** Je sekce odpovídající cestě globálně skrytá? (R16.3) */
function isSectionHidden(ctx: RequestContext): boolean {
  const key = sectionKey(ctx.path);
  return key !== null && ctx.hiddenSections[key] === true;
}

/** Odepření neautentizovaného požadavku: 401 pro API, jinak redirect na Sign In. */
function denyUnauthenticated(ctx: RequestContext): AccessDecision {
  return ctx.isApiRoute
    ? { outcome: "deny401" }
    : { outcome: "redirectSignIn", callbackUrl: ctx.path };
}

/**
 * Čisté rozhodnutí o přístupu. Neprovádí žádné I/O ani mutace — pouze mapuje
 * vstupní kontext na výsledek.
 */
export function decideAccess(
  ctx: RequestContext,
  config: AccessConfig,
): AccessDecision {
  // 1. Veřejné cesty jsou vždy dostupné (R1.3).
  if (isPublicPath(ctx.path)) {
    return { outcome: "allow" };
  }

  // 2. Autentizace: relace + aktivní účet + neexpirovaná inaktivita
  //    (R1.1, R1.2, R1.6, R15.3, R15.4, R21.4).
  if (!isAuthenticated(ctx)) {
    return denyUnauthenticated(ctx);
  }

  // 3. Globálně skrytá sekce vrací 404 — ale Admin má přístup vždy (R16.3 +
  //    požadavek: skrytí jen zabrání přístup ostatním rolím, Adminovi ne).
  if (isSectionHidden(ctx) && ctx.role !== "Admin") {
    return { outcome: "deny404" };
  }

  // 4. Role: administrátorské cesty jsou pro Admina; Distributor smí jen
  //    sekce médií/modelů (R1.4, R1.5, R3.3, R9.6, feature „distributor").
  if (isAdminPath(ctx.path)) {
    const allowed =
      ctx.role === "Admin" ||
      (ctx.role === "Distributor" && isUploaderAdminPath(ctx.path));
    if (!allowed) return { outcome: "deny403" };
  }

  // 5. Předplatné [POST-MVP]: vynucuje se jen v zapnutém režimu (R20.6, R21.1, R21.2, R21.5).
  if (config.paymentsEnabled && ctx.subscriptionStatus !== "active") {
    return { outcome: "redirectPaywall" };
  }

  return { outcome: "allow" };
}
