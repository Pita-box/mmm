// Feature: mmmred-streaming-dashboard, Property 1: Pouze veřejné cesty jsou dostupné bez autentizace
import { describe, it } from "vitest";
import fc from "fast-check";
import {
  decideAccess,
  type RequestContext,
  type AccessConfig,
} from "./access";
import {
  PUBLIC_PATHS,
  type Role,
  type AccountStatus,
  type SubscriptionStatus,
} from "./domain";

/**
 * Property 1: Pouze veřejné cesty jsou dostupné bez autentizace.
 *
 * Pro libovolnou cestu platí, že je dostupná neautentizovanému návštěvníkovi
 * právě tehdy, když patří do množiny {/signin, /signup, /paywall}. Jakákoli
 * jiná cesta vede pro neautentizovaný požadavek (session === null) na redirect
 * na Sign In (stránka) nebo stav 401 (media API), přičemž se nikdy nevrátí
 * povolení (žádný chráněný obsah).
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

const NOW = new Date("2026-01-01T12:00:00.000Z");

const PUBLIC_SET = new Set<string>(PUBLIC_PATHS as readonly string[]);

/** Znaky pro generování segmentů cesty (bez `/`, `?`, `#`). */
const SEGMENT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split("");

const segmentArb = fc
  .array(fc.constantFrom(...SEGMENT_CHARS), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

/** Veřejné cesty — přesné konstanty i varianta s koncovým lomítkem. */
const publicPathArb = fc.oneof(
  fc.constantFrom(...(PUBLIC_PATHS as readonly string[])),
  fc.constantFrom(...(PUBLIC_PATHS as readonly string[])).map((p) => `${p}/`),
);

/** Chráněné cesty — libovolné cesty, které nejsou veřejné. */
const protectedPathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => `/${segs.join("/")}`)
  .filter((p) => {
    const normalized = p.length > 1 ? p.replace(/\/+$/, "") || "/" : p;
    return !PUBLIC_SET.has(normalized);
  });

const pathCaseArb = fc.oneof(
  fc.record({ path: publicPathArb, isPublic: fc.constant(true) }),
  fc.record({ path: protectedPathArb, isPublic: fc.constant(false) }),
);

/** Náhodné okolní prostředí — pro neautentizovaný požadavek nesmí výsledek ovlivnit. */
const envArb = fc.record({
  isApiRoute: fc.boolean(),
  role: fc.constantFrom<Role | null>("Admin", "User", null),
  accountStatus: fc.constantFrom<AccountStatus>("active", "blocked"),
  subscriptionStatus: fc.constantFrom<SubscriptionStatus>("active", "inactive"),
  paymentsEnabled: fc.boolean(),
  hiddenSections: fc.dictionary(segmentArb, fc.boolean()),
});

type Env = {
  isApiRoute: boolean;
  role: Role | null;
  accountStatus: AccountStatus;
  subscriptionStatus: SubscriptionStatus;
  paymentsEnabled: boolean;
  hiddenSections: Record<string, boolean>;
};

function buildCtx(path: string, env: Env): RequestContext {
  return {
    path,
    isApiRoute: env.isApiRoute,
    now: NOW,
    session: null, // neautentizovaný návštěvník
    role: env.role,
    accountStatus: env.accountStatus,
    hiddenSections: env.hiddenSections,
    subscriptionStatus: env.subscriptionStatus,
  };
}

describe("Property 1: Pouze veřejné cesty jsou dostupné bez autentizace", () => {
  it("dostupnost bez autentizace platí právě pro veřejné cesty", () => {
    fc.assert(
      fc.property(pathCaseArb, envArb, ({ path, isPublic }, env) => {
        const config: AccessConfig = { paymentsEnabled: env.paymentsEnabled };
        const decision = decideAccess(buildCtx(path, env), config);

        if (isPublic) {
          // Veřejná cesta je dostupná i bez relace.
          return decision.outcome === "allow";
        }

        // Chráněná cesta nesmí nikdy vrátit povolení (žádný chráněný obsah).
        if (decision.outcome === "allow") return false;

        if (env.isApiRoute) {
          // Media API → 401 bez redirectu.
          return (
            decision.outcome === "deny401" &&
            decision.callbackUrl === undefined
          );
        }

        // Stránka → redirect na Sign In se zachováním cílové adresy.
        return (
          decision.outcome === "redirectSignIn" &&
          decision.callbackUrl === path
        );
      }),
      { numRuns: 100 },
    );
  });
});
