/**
 * Access-context — sdílená serverová vrstva nad čistým `decideAccess` (task 21.1).
 *
 * Tento modul je **jediné místo**, kde se z příchozího požadavku sestavuje
 * `RequestContext` pro čistou rozhodovací funkci `decideAccess`. Sdílí ho jak
 * Edge `middleware.ts` (stránky + API redirecty / stavové kódy), tak serverové
 * route handlery a server actions. `decideAccess` zůstává jedinou autoritou
 * rozhodnutí — tento soubor pouze překládá HTTP svět na/z jejího kontextu.
 *
 * Runtime poznámka: horní úroveň tohoto modulu musí být **Edge-safe**
 * (žádný import Prisma ani Node-only API), protože ho importuje Edge middleware.
 * Node-only doplněk (čtení mapy viditelnosti sekcí z DB) je proto izolován do
 * samostatného modulu `@/lib/access-guard`, který middleware nikdy neimportuje —
 * Prisma se tak nedostane do Edge bundle.
 *
 * Relace se nese v podepsaném (HMAC-SHA256) cookie, ověřeném přes Web Crypto
 * (dostupné v Edge i Node). Tím je výchozí stav „uzavřený": chybějící nebo
 * neověřitelné cookie ⇒ neautentizovaný požadavek.
 *
 * TODO(task 21.2): Plné DB-backed ověření relace — vydávání cookie při loginu,
 * revokace (zablokování účtu ukončí relaci do 5 s, R15.3/R15.4) a aktualizace
 * `lastActivityAt` v DB při každém požadavku. Do té doby je `lastActivityAt`
 * čten z podepsaného payloadu a inaktivita se vyhodnocuje proti němu.
 */
import {
  decideAccess,
  type AccessConfig,
  type AccessDecision,
  type RequestContext,
} from "./access";
import type { Role, AccountStatus, SubscriptionStatus } from "./domain";

/** Název cookie nesoucího podepsanou relaci. */
export const SESSION_COOKIE = "mmm_session";

/**
 * Principál nesený v podepsaném session cookie. Drží jen to, co `decideAccess`
 * potřebuje k rozhodnutí — žádná tajemství.
 */
export interface SessionPrincipal {
  readonly userId: string;
  /** ID DB session záznamu — klíč pro revokaci a kontrolu existence (plán 002). */
  readonly sessionId: string;
  readonly role: Role;
  readonly accountStatus: AccountStatus;
  readonly subscriptionStatus: SubscriptionStatus;
  /** ISO 8601 čas poslední aktivity; od něj se počítá 30min inaktivita. */
  readonly lastActivityAt: string;
  readonly rememberMe?: boolean;
}

// ─── Konfigurace režimu (PAYMENTS_ENABLED) ────────────────────────────────────

/**
 * Sestaví `AccessConfig` z prostředí. Přepínač `PAYMENTS_ENABLED` je v MVP
 * vypnutý (výchozí `false`); zapne se jedině explicitní hodnotou `"true"`
 * (R21.1, R21.3, R21.5).
 *
 * Pozn.: Kanonickým zdrojem je `AppConfig` v DB (R21.3), tu však Edge runtime
 * nemůže číst přes Prisma. Middleware proto čte Edge-safe env proměnnou; Node
 * vrstva může v budoucnu hodnotu sladit s `AppConfig`.
 */
export function getAccessConfig(): AccessConfig {
  return { paymentsEnabled: process.env.PAYMENTS_ENABLED === "true" };
}

// ─── Cesty ────────────────────────────────────────────────────────────────────

/** Je cesta API endpointem? Rozlišuje stavové kódy (API) vs. redirecty (stránky). */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

// ─── Podepsané session cookie (Web Crypto, Edge-safe) ─────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  // Alokace přes explicitní ArrayBuffer, aby byl typ kompatibilní s Web Crypto
  // (BufferSource nepřijímá SharedArrayBuffer-backed view).
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSessionSecret(): string | undefined {
  const secret = process.env.SESSION_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : undefined;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function isValidPrincipal(value: unknown): value is SessionPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.userId === "string" &&
    typeof p.sessionId === "string" &&
    p.sessionId.length > 0 &&
    p.userId.length > 0 &&
    (p.role === "Admin" || p.role === "Distributor" || p.role === "User") &&
    (p.accountStatus === "active" || p.accountStatus === "blocked") &&
    (p.subscriptionStatus === "active" || p.subscriptionStatus === "inactive") &&
    typeof p.lastActivityAt === "string" &&
    !Number.isNaN(Date.parse(p.lastActivityAt)) &&
    (p.rememberMe === undefined || typeof p.rememberMe === "boolean")
  );
}

/**
 * Podepíše principála do hodnoty cookie `payloadB64.signatureB64`.
 * Vystaveno pro task 21.2 (vydání cookie po přihlášení). Vrací `null`, pokud
 * není nastaven `SESSION_COOKIE_SECRET` — bez tajemství nelze relaci vydat.
 */
export async function signSessionCookie(
  principal: SessionPrincipal,
): Promise<string | null> {
  const secret = getSessionSecret();
  if (!secret) return null;
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(principal)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadB64),
  );
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Ověří a rozparsuje podepsané session cookie. Vrací principála právě tehdy,
 * když cookie existuje, má platný formát a HMAC podpis odpovídá tajemství
 * (uzavřený výchozí stav: jinak `null` ⇒ neautentizováno).
 */
export async function resolveSessionPrincipal(
  rawCookie: string | undefined | null,
): Promise<SessionPrincipal | null> {
  if (!rawCookie) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const dot = rawCookie.lastIndexOf(".");
  if (dot <= 0 || dot === rawCookie.length - 1) return null;
  const payloadB64 = rawCookie.slice(0, dot);
  const signatureB64 = rawCookie.slice(dot + 1);

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlToBytes(signatureB64);
  } catch {
    return null;
  }

  let key: CryptoKey;
  try {
    key = await importHmacKey(secret);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(payloadB64),
  );
  if (!valid) return null;

  try {
    const json = decoder.decode(base64UrlToBytes(payloadB64));
    const parsed: unknown = JSON.parse(json);
    return isValidPrincipal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Sestavení kontextu a rozhodnutí ──────────────────────────────────────────

/** Vstup pro sestavení `RequestContext` (sjednocuje Edge i Node volání). */
export interface BuildContextArgs {
  readonly path: string;
  readonly isApiRoute: boolean;
  readonly principal: SessionPrincipal | null;
  readonly hiddenSections: Readonly<Record<string, boolean>>;
  readonly now?: Date;
}

/**
 * Přeloží principála + cestu na `RequestContext` pro `decideAccess`.
 * Neautentizovaný principál ⇒ `session: null` a výchozí (neutralní) hodnoty
 * stavu účtu/předplatného — autentizační větev `decideAccess` je tak vyhodnotí
 * jako neautentizované bez ohledu na ně.
 */
export function buildRequestContext(args: BuildContextArgs): RequestContext {
  const { path, isApiRoute, principal, hiddenSections } = args;
  const now = args.now ?? new Date();

  if (principal === null) {
    return {
      path,
      isApiRoute,
      now,
      session: null,
      role: null,
      accountStatus: "active",
      hiddenSections,
      subscriptionStatus: "inactive",
    };
  }

  return {
    path,
    isApiRoute,
    now,
    session: {
      lastActivityAt: new Date(principal.lastActivityAt),
      inactivityLimitMs: principal.rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : undefined,
    },
    role: principal.role,
    accountStatus: principal.accountStatus,
    hiddenSections,
    subscriptionStatus: principal.subscriptionStatus,
  };
}

/**
 * Edge-safe vyhodnocení přístupu: ověří cookie, sestaví kontext a vrátí
 * rozhodnutí `decideAccess`. `hiddenSections` se předává explicitně (Edge je
 * nemůže číst z DB) — výchozí prázdná mapa znamená „žádná sekce skrytá".
 */
export async function evaluateAccess(input: {
  path: string;
  rawCookie: string | undefined | null;
  hiddenSections?: Readonly<Record<string, boolean>>;
  now?: Date;
}): Promise<AccessDecision> {
  const principal = await resolveSessionPrincipal(input.rawCookie);
  const ctx = buildRequestContext({
    path: input.path,
    isApiRoute: isApiPath(input.path),
    principal,
    hiddenSections: input.hiddenSections ?? {},
    now: input.now,
  });
  return decideAccess(ctx, getAccessConfig());
}
