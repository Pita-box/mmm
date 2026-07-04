// Feature: mmmred-streaming-dashboard, Property 3: Přístup respektuje roli a nikdy neprozradí obsah mimo roli
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  decideAccess,
  type RequestContext,
  type AccessConfig,
} from "./access";
import type { Role } from "./domain";

/**
 * Property 3: Přístup respektuje roli a nikdy neprozradí obsah mimo roli.
 *
 * Pro libovolnou kombinaci role a cesty platí, že přístup je povolen právě
 * tehdy, když cesta odpovídá oprávněním role. Požadavek uživatele s rolí User
 * na administrátorskou cestu je odepřen (403) — `decideAccess` je čistá funkce,
 * takže odepření samo o sobě neprovede žádnou operaci ani nezmění žádná data.
 *
 * Test fixuje vše ostatní v pořadí vyhodnocení tak, aby zbylo jen rozhodnutí
 * o roli: autentizovaná aktivní relace, čerstvá aktivita, neskrytá sekce,
 * platby vypnuté (MVP).
 *
 * Validates: Requirements 1.4, 1.5, 3.3, 9.6
 */

const config: AccessConfig = { paymentsEnabled: false };

const roleArb: fc.Arbitrary<Role> = fc.constantFrom("Admin", "User");

/** Segment cesty bez lomítek (1–20 alfanumerických/pomlčkových znaků). */
const segmentArb = fc
  .stringMatching(/^[a-zA-Z0-9-]+$/)
  .filter((s) => s.length >= 1 && s.length <= 20);

/** Administrátorské cesty: `/admin/**` i `/api/admin/**`. */
const adminPathArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant("/admin"),
  fc.constant("/api/admin"),
  segmentArb.map((s) => `/admin/${s}`),
  segmentArb.map((s) => `/api/admin/${s}`),
  fc.tuple(segmentArb, segmentArb).map(([a, b]) => `/admin/${a}/${b}`),
);

/** Neadministrátorské chráněné cesty (ne veřejné, ne /admin, ne API admin). */
const nonAdminProtectedPathArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant("/"),
  fc.constantFrom("/models", "/search", "/settings"),
  fc.constantFrom("models", "search", "settings").chain((base) =>
    segmentArb.map((s) => `/${base}/${s}`),
  ),
  fc.constantFrom("api/media", "api/filter").chain((base) =>
    segmentArb.map((s) => `/${base}/${s}`),
  ),
);

/** Sestaví autentizovaný, aktivní kontext s čerstvou relací a neskrytou sekcí. */
function makeContext(path: string, role: Role): RequestContext {
  const now = new Date("2026-01-01T12:00:00.000Z");
  return {
    path,
    isApiRoute: path.startsWith("/api/"),
    now,
    // Čerstvá aktivita — relace nevypršela.
    session: { lastActivityAt: new Date(now.getTime() - 1000) },
    role,
    accountStatus: "active",
    hiddenSections: {},
    subscriptionStatus: "inactive",
  };
}

describe("Property 3: přístup respektuje roli", () => {
  it("administrátorská cesta + role User → deny403 (žádný únik obsahu mimo roli)", () => {
    fc.assert(
      fc.property(adminPathArb, (path) => {
        const decision = decideAccess(makeContext(path, "User"), config);
        expect(decision.outcome).toBe("deny403");
      }),
      { numRuns: 100 },
    );
  });

  it("administrátorská cesta + role Admin → allow", () => {
    fc.assert(
      fc.property(adminPathArb, (path) => {
        const decision = decideAccess(makeContext(path, "Admin"), config);
        expect(decision.outcome).toBe("allow");
      }),
      { numRuns: 100 },
    );
  });

  it("neadministrátorská chráněná cesta + libovolná role → allow", () => {
    fc.assert(
      fc.property(nonAdminProtectedPathArb, roleArb, (path, role) => {
        const decision = decideAccess(makeContext(path, role), config);
        expect(decision.outcome).toBe("allow");
      }),
      { numRuns: 100 },
    );
  });
});
