// Feature: mmmred-streaming-dashboard, Property 5: Platební režim je deterministicky odvozen z přepínače
import { describe, it } from "vitest";
import fc from "fast-check";
import { decideAccess, type RequestContext } from "./access";
import type { SubscriptionStatus } from "./domain";

/**
 * Property 5: Platební režim je deterministicky odvozen z přepínače.
 *
 * Pro autentizovaného (aktivní, neexpirovaná relace) uživatele na chráněné,
 * ne-admin, ne-skryté cestě platí:
 *   - paymentsEnabled === false (MVP) → vždy `allow`, bez ohledu na předplatné.
 *   - paymentsEnabled === true (post-MVP) → `allow` právě když je předplatné
 *     aktivní, jinak `redirectPaywall`.
 *
 * Validates: Requirements 20.6, 21.1, 21.2, 21.3, 21.5
 */
describe("Property 5: Platební režim je deterministicky odvozen z přepínače", () => {
  it("MVP režim povolí vždy; post-MVP režim závisí na aktivním předplatném", () => {
    const protectedPath = fc.constantFrom(
      "/",
      "/search",
      "/models",
      "/collections",
      "/settings",
    );
    const subscriptionStatus = fc.constantFrom<SubscriptionStatus>(
      "active",
      "inactive",
    );

    fc.assert(
      fc.property(
        fc.boolean(), // paymentsEnabled
        subscriptionStatus,
        fc.boolean(), // isApiRoute
        protectedPath,
        (paymentsEnabled, subStatus, isApiRoute, path) => {
          const ctx: RequestContext = {
            path,
            isApiRoute,
            now: new Date(),
            // Aktivní, neexpirovaná relace (lastActivity = teď).
            session: { lastActivityAt: new Date() },
            role: "User",
            accountStatus: "active",
            hiddenSections: {},
            subscriptionStatus: subStatus,
          };

          const decision = decideAccess(ctx, { paymentsEnabled });

          if (!paymentsEnabled) {
            // MVP režim: přístup bez kontroly předplatného (R21.1).
            return decision.outcome === "allow";
          }
          // post-MVP režim: závisí na aktivním předplatném (R20.6, R21.2).
          return subStatus === "active"
            ? decision.outcome === "allow"
            : decision.outcome === "redirectPaywall";
        },
      ),
      { numRuns: 100 },
    );
  });
});
