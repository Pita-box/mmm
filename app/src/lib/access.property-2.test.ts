// Feature: mmmred-streaming-dashboard, Property 2: Neautentizovaný přístup zachová cílovou adresu pro návrat
//
// Validates: Requirements 21.4
//
// Pro libovolnou chráněnou cestu (ne-veřejnou, ne-API) platí, že neautentizovaný
// požadavek (session === null) je odepřen přesměrováním na Sign In a `callbackUrl`
// se rovná původní požadované adrese — cíl se zachová pro návrat po přihlášení.

import { describe, it } from "vitest";
import fc from "fast-check";
import { decideAccess, type RequestContext, type AccessConfig } from "./access";
import { PUBLIC_PATHS } from "./domain";

/** Normalizace shodná s `access.ts` — kvůli vyloučení kolize s veřejnou cestou. */
function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "") || "/";
  }
  return path;
}

/** Segment cesty: neprázdný řetězec bezpečných znaků (bez `/`). */
const segmentArb = fc
  .stringMatching(/^[a-zA-Z0-9._~-]+$/)
  .filter((s) => s.length > 0 && s.length <= 24);

/**
 * Generátor chráněných cest: ne-veřejných a ne-API.
 * - 1–4 segmenty oddělené `/`
 * - první segment není `api` (vyloučí API cesty)
 * - po normalizaci není v `PUBLIC_PATHS`
 */
const protectedPathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => "/" + segments.join("/"))
  .filter((path) => {
    const normalized = normalizePath(path);
    if ((PUBLIC_PATHS as readonly string[]).includes(normalized)) return false;
    const first = normalized.split("/").filter(Boolean)[0];
    return first !== "api";
  });

const config: AccessConfig = { paymentsEnabled: false };

describe("Property 2: neautentizovaný přístup zachová cílovou adresu", () => {
  it("odepře chráněnou cestu redirectem na Sign In s callbackUrl === původní cesta", () => {
    fc.assert(
      fc.property(protectedPathArb, (path) => {
        const ctx: RequestContext = {
          path,
          isApiRoute: false,
          now: new Date(),
          session: null,
          role: null,
          accountStatus: "active",
          hiddenSections: {},
          subscriptionStatus: "inactive",
        };

        const decision = decideAccess(ctx, config);

        return (
          decision.outcome === "redirectSignIn" && decision.callbackUrl === path
        );
      }),
      { numRuns: 100 },
    );
  });
});
