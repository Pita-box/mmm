import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  decideAccess,
  SESSION_INACTIVITY_LIMIT_MS,
  type RequestContext,
} from "./access";
import type { AccountStatus, Role } from "./domain";

// Feature: mmmred-streaming-dashboard, Property 4: Vypršení relace, zablokování a revokace
//
// Pro libovolný stav relace a účtu (na chráněné, neveřejné, ne-API stránce
// s existující relací) platí, že požadavek je považován za neautentizovaný
// (redirect na Sign In) právě tehdy, když relace vypršela (≥ 30 min inaktivity)
// NEBO je účet zablokovaný; jinak je přístup povolen. Tím je pokryta i revokace:
// po zablokování účtu nezůstane žádná jeho relace platná.
//
// Validates: Requirements 1.6, 15.3, 15.4

/** Chráněné, neveřejné, ne-admin a ne-API stránkové cesty bez klíče skryté sekce. */
const PROTECTED_PAGE_PATHS = ["/", "/search", "/models", "/settings"];

const NOW = new Date("2026-06-22T12:00:00.000Z");

const accountStatusArb: fc.Arbitrary<AccountStatus> = fc.constantFrom(
  "active",
  "blocked",
);
const roleArb: fc.Arbitrary<Role> = fc.constantFrom("Admin", "User");

/**
 * Doba inaktivity v ms, zaměřená kolem 30min hranice (i mimo ni), aby test
 * pokryl obě strany prahu i přesnou rovnost.
 */
const inactivityMsArb: fc.Arbitrary<number> = fc.oneof(
  // úzké okolí hranice (± 5 s), kde se rozhodnutí láme
  fc.integer({
    min: SESSION_INACTIVITY_LIMIT_MS - 5_000,
    max: SESSION_INACTIVITY_LIMIT_MS + 5_000,
  }),
  // širší rozsah od 0 do dvojnásobku limitu
  fc.integer({ min: 0, max: 2 * SESSION_INACTIVITY_LIMIT_MS }),
);

describe("Property 4: Vypršení relace, zablokování a revokace", () => {
  it("je neautentizovaný (redirectSignIn) ⟺ relace vypršela NEBO je účet zablokovaný", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROTECTED_PAGE_PATHS),
        inactivityMsArb,
        accountStatusArb,
        roleArb,
        (path, inactivityMs, accountStatus, role) => {
          const ctx: RequestContext = {
            path,
            isApiRoute: false,
            now: NOW,
            session: { lastActivityAt: new Date(NOW.getTime() - inactivityMs) },
            role,
            accountStatus,
            hiddenSections: {},
            subscriptionStatus: "inactive",
          };

          const decision = decideAccess(ctx, { paymentsEnabled: false });

          const expired = inactivityMs >= SESSION_INACTIVITY_LIMIT_MS;
          const blocked = accountStatus === "blocked";
          const shouldBeUnauthenticated = expired || blocked;

          if (shouldBeUnauthenticated) {
            expect(decision.outcome).toBe("redirectSignIn");
            expect(decision.callbackUrl).toBe(path);
          } else {
            expect(decision.outcome).toBe("allow");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
