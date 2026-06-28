// Feature: mmmred-streaming-dashboard, Property 22: Streamovací token má omezenou platnost a chrání zdroj
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  issueStreamingToken,
  verifyStreamingToken,
  STREAMING_TOKEN_TTL_SECONDS,
} from "./drive-connector";
import { isOk } from "@/lib/result";

/**
 * **Validates: Requirements 6.1, 6.5**
 *
 * Property 22: Streamovací token má omezenou platnost a chrání zdroj.
 *
 * Pro libovolný autorizovaný požadavek a čas `now` platí, že vydaný streamovací
 * token vyprší nejpozději za 300 sekund; ověření tokenu uspěje právě tehdy, když
 * `now <= exp`, jinak je přístup zamítnut s indikací vypršení (`token_expired`).
 *
 * Generujeme libovolný čas vydání (`issueNow`) a libovolný offset ověření (v
 * sekundách, pokrývající dobu před vypršením, hranici i po vypršení). Token i
 * ověření používají jeden pevný tajný klíč. Ověřujeme:
 *   1) vydaný token má `exp <= issueNowSeconds + 300` (R6.1),
 *   2) ověření uspěje právě když `verifyNowSeconds <= exp`,
 *      jinak selže s kódem `token_expired` (R6.5).
 */

// ─── Pevný tajný klíč pro podpis/ověření (deterministické vůči secret) ───────
const SECRET = "test-fixed-streaming-secret-pro-property-22";

// ─── Generátory ───────────────────────────────────────────────────────────────

/** Čas vydání tokenu (ms) v širokém rozsahu kolem epochy. */
const issueNowMsArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 4_000_000_000_000 });

/** Neprázdné ID autorizovaného uživatele (požadavek je autorizovaný — R6.2). */
const userIdArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 40 }).map((s) => `u-${s}`);

/** Libovolné ID média. */
const mediaIdArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 40 }).map((s) => `m-${s}`);

/**
 * Offset ověření v sekundách vůči času vydání. Rozsah pokrývá čas před vydáním,
 * těsně před vypršením, přesně na hranici (`exp`), těsně po i daleko po vypršení.
 */
const offsetSecondsArb: fc.Arbitrary<number> = fc.integer({ min: -100, max: 600 });

/** Zbytkové milisekundy (0–999) — ověření používá `floor(now/1000)`. */
const extraMsArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 999 });

describe("Property 22: Streamovací token má omezenou platnost a chrání zdroj", () => {
  it("vyprší nejpozději za 300 s a ověří se právě když now <= exp", () => {
    fc.assert(
      fc.property(
        issueNowMsArb,
        userIdArb,
        mediaIdArb,
        offsetSecondsArb,
        extraMsArb,
        (issueNowMs, userId, mediaId, offsetSeconds, extraMs) => {
          const issueNow = new Date(issueNowMs);
          const issueNowSeconds = Math.floor(issueNowMs / 1000);

          // Vydání tokenu pro autorizovaný požadavek musí uspět.
          const issued = issueStreamingToken({ mediaId, userId, now: issueNow }, SECRET);
          expect(isOk(issued)).toBe(true);
          if (!isOk(issued)) return;
          const token = issued.value;

          // 1) Token vyprší nejpozději za 300 s od vydání (R6.1).
          const verifiedAtIssue = verifyStreamingToken(token, issueNow, SECRET);
          expect(isOk(verifiedAtIssue)).toBe(true);
          if (!isOk(verifiedAtIssue)) return;
          const exp = verifiedAtIssue.value.exp;
          expect(exp).toBeLessThanOrEqual(issueNowSeconds + STREAMING_TOKEN_TTL_SECONDS);
          expect(exp).toBeLessThanOrEqual(issueNowSeconds + 300);

          // Sestav čas ověření se sekundovou granularitou + zbytkové ms.
          const verifyNowSeconds = Math.max(0, issueNowSeconds + offsetSeconds);
          const verifyNow = new Date(verifyNowSeconds * 1000 + extraMs);

          // 2) Ověření uspěje právě když verifyNowSeconds <= exp (R6.5).
          const verified = verifyStreamingToken(token, verifyNow, SECRET);
          if (verifyNowSeconds <= exp) {
            expect(isOk(verified)).toBe(true);
            if (isOk(verified)) {
              expect(verified.value.mediaId).toBe(mediaId);
              expect(verified.value.userId).toBe(userId);
              expect(verified.value.exp).toBe(exp);
            }
          } else {
            expect(isOk(verified)).toBe(false);
            if (!isOk(verified)) {
              expect(verified.error.code).toBe("token_expired");
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
