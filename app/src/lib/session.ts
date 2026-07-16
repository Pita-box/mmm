/**
 * Serverová relační vrstva (task 21.2) — čte/vydává/ruší podepsané session
 * cookie v Node runtime (Server Components, Server Actions, Route Handlers).
 *
 * Cookie je jediný zdroj principála pro `decideAccess`; jeho podpis (HMAC) řeší
 * `@/lib/access-context`. Tento modul přidává jen integraci s `next/headers`
 * (čtení a zápis cookie) a pohodlné strážce `requireSession` / `requireAdmin`
 * pro stránky a akce. Vynucení přístupu globálně řeší middleware (task 21.1);
 * tyto strážce slouží k získání principála a jako obranná pojistka.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_INACTIVITY_LIMIT_MS } from "./access";
import {
  SESSION_COOKIE,
  resolveSessionPrincipal,
  signSessionCookie,
  type SessionPrincipal,
} from "./access-context";
import type { PrismaClient } from "@prisma/client";

/** Doba života cookie = 30 min inaktivity (R2.3, R1.6). */
const SESSION_MAX_AGE_SECONDS = 30 * 60;
const REMEMBERED_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * DB-backed ověření relace (plán 002, R15.3/R15.4, R1.6/R2.3). Cookie sám o sobě
 * nestačí — re-čte session záznam i živý stav účtu z DB, takže zablokování
 * (smazání session) i degradace role/předplatného se projeví na dalším požadavku.
 * Vrací `null` (= neautentizováno), když session neexistuje, účet není aktivní,
 * nebo vypršela 30min inaktivita (záznam přitom smaže). Jinak posune
 * `lastActivityAt` (rolling inaktivita) a vrátí principála s živými hodnotami.
 *
 * ponytail: validace žije zde (zdroj principála pro requireSession/requireAdmin
 * i stream route), ne v access-guard — to je skutečná hot path stránek. Cena:
 * 1 read (+1 write) na požadavek; per-request memoizace, až to bude měřitelně vadit.
 */
export async function validateSession(
  principal: SessionPrincipal,
  options: { touch?: boolean } = {},
  db: Pick<PrismaClient, "session"> = prisma,
  now: number = Date.now(),
): Promise<SessionPrincipal | null> {
  const session = await db.session.findUnique({
    where: { id: principal.sessionId },
    include: {
      user: { select: { role: true, status: true, subscriptionStatus: true } },
    },
  });
  if (session === null) return null; // odhlášeno / revokováno (R15.4)
  if (session.user.status !== "active") return null; // zablokováno (R15.3)
  const inactivityLimit = principal.rememberMe
    ? REMEMBERED_SESSION_MAX_AGE_SECONDS * 1000
    : SESSION_INACTIVITY_LIMIT_MS;
  if (
    now >= session.expiresAt.getTime() ||
    now - session.lastActivityAt.getTime() >= inactivityLimit
  ) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null; // vypršela inaktivita (R1.6, R2.3) — úklid běží i bez touch
  }
  // ponytail: read-only varianta (touch=false) existuje kvůli write-amplifikaci
  // ve streamovací/náhledové proxy (plán 009/010) — tam se relace jen ověří,
  // lastActivityAt se posouvá jen u navigace stránek/akcí (touch=true).
  if (options.touch !== false) {
    await db.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date(now) },
    });
  }
  return {
    ...principal,
    role: session.user.role,
    accountStatus: session.user.status,
    subscriptionStatus: session.user.subscriptionStatus,
    // bez touch vrať skutečné lastActivityAt z DB, ne „now".
    lastActivityAt: (options.touch === false
      ? session.lastActivityAt
      : new Date(now)
    ).toISOString(),
  };
}

/**
 * Zpětně kompatibilní wrapper: ověří relaci A posune `lastActivityAt`
 * (rolling inaktivita pro navigaci stránek a akce).
 */
export async function validateAndTouchSession(
  principal: SessionPrincipal,
  db: Pick<PrismaClient, "session"> = prisma,
  now: number = Date.now(),
): Promise<SessionPrincipal | null> {
  return validateSession(principal, { touch: true }, db, now);
}

/** Přečte a ověří principála z cookie + DB, nebo `null` (neautentizováno). */
export async function getSessionPrincipal(): Promise<SessionPrincipal | null> {
  const store = await cookies();
  const principal = await resolveSessionPrincipal(store.get(SESSION_COOKIE)?.value);
  if (principal === null) return null;
  return validateAndTouchSession(principal);
}

/**
 * Ověří relaci z cookie BEZ posunu `lastActivityAt` (read-only). Pro hot-path
 * proxy (stream/náhledy), kde každý požadavek nesmí generovat zápis do DB
 * (plán 009 — write-amplifikace). Autorizační kontroly (existence relace,
 * aktivní účet, inaktivita) zůstávají stejné.
 */
export async function getSessionPrincipalReadOnly(): Promise<SessionPrincipal | null> {
  const store = await cookies();
  const principal = await resolveSessionPrincipal(store.get(SESSION_COOKIE)?.value);
  if (principal === null) return null;
  return validateSession(principal, { touch: false });
}

/**
 * Vrátí přihlášeného principála, nebo přesměruje na Sign In s `callbackUrl`.
 * Používá se v chráněných Server Components.
 */
export async function requireSession(
  callbackUrl?: string,
): Promise<SessionPrincipal> {
  const principal = await getSessionPrincipal();
  if (principal === null) {
    const target = callbackUrl
      ? `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/signin";
    redirect(target);
  }
  return principal;
}

/** Vyžaduje roli Admin; jinak přesměruje (obranná pojistka k middlewaru). */
export async function requireAdmin(): Promise<SessionPrincipal> {
  const principal = await requireSession();
  if (principal.role !== "Admin") {
    redirect("/");
  }
  return principal;
}

/**
 * Vyžaduje roli s právem nahrávat (Admin nebo Distributor); jinak přesměruje.
 * Feature „distributor" — chrání media/models admin sekce a jejich akce.
 */
export async function requireUploader(): Promise<SessionPrincipal> {
  const principal = await requireSession();
  if (principal.role !== "Admin" && principal.role !== "Distributor") {
    redirect("/");
  }
  return principal;
}

/**
 * Vydá podepsané session cookie pro principála (po úspěšném přihlášení, R2.5).
 * Vrátí `false`, pokud chybí `SESSION_COOKIE_SECRET` (relaci nelze vydat).
 */
export async function establishSession(
  principal: SessionPrincipal,
): Promise<boolean> {
  const value = await signSessionCookie(principal);
  if (value === null) return false;
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: principal.rememberMe
      ? REMEMBERED_SESSION_MAX_AGE_SECONDS
      : SESSION_MAX_AGE_SECONDS,
  });
  return true;
}

/** Ukončí relaci smazáním cookie (odhlášení, R2.5). */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
