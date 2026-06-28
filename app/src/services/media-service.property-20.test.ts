// Feature: mmmred-streaming-dashboard, Property 20: Guardy plánování a publikace
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canSchedule, canPublishNow, type MediaItemView } from "./media-service";
import type { MediaStatus } from "@/lib/domain";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 20: Guardy plánování a publikace.
 *
 * Pro libovolné médium platí, že pokus o naplánování nebo publikaci média ve
 * stavu skryté (resp. smazané → not_found, řešeno v perzistentní vrstvě), nebo
 * nastavení času zveřejnění v minulosti či rovného aktuálnímu času, je zamítnut
 * a stav média zůstane beze změny.
 *
 * Testujeme čisté guardy `canSchedule(item, publishAt, now)` a
 * `canPublishNow(item)`:
 *   - `canSchedule` uspěje právě když item NENÍ skryté A publishAt je striktně
 *     v budoucnu (publishAt > now); minulost i `== now` se odmítá.
 *   - `canPublishNow` uspěje právě když item NENÍ skryté.
 *   - Guardy jsou čisté: vstupní `item` se nikdy nemutuje (stav beze změny).
 *
 * Validates: Requirements 8.5, 8.6
 */
describe("Property 20: Guardy plánování a publikace", () => {
  const status = fc.constantFrom<MediaStatus>("scheduled", "published", "hidden");
  // publishAt kolem `now`: offset v ms v minulosti (<0), rovný (0) i budoucnosti (>0).
  const offsetMs = fc.integer({ min: -1_000_000, max: 1_000_000 });
  // publishAt na médiu může být null (dosud nepublikováno) nebo konkrétní čas.
  const itemPublishAt = fc.option(fc.date(), { nil: null });

  it("canSchedule zamítne skrytá média i publishAt <= now; jinak povolí — stav beze změny", () => {
    fc.assert(
      fc.property(status, itemPublishAt, offsetMs, (st, pa, off) => {
        const now = new Date(1_700_000_000_000);
        const publishAt = new Date(now.getTime() + off);
        const item: MediaItemView = { status: st, publishAt: pa };
        const snapshot = { status: item.status, publishAt: item.publishAt };

        const result = canSchedule(item, publishAt, now);

        const shouldAllow = st !== "hidden" && publishAt.getTime() > now.getTime();

        if (shouldAllow) {
          expect(isOk(result)).toBe(true);
        } else {
          expect(isErr(result)).toBe(true);
          if (st === "hidden") {
            // Skryté médium → invalid_state (přednost před kontrolou času).
            if (isErr(result)) expect(result.error.code).toBe("invalid_state");
          } else {
            // Ne-skryté s publishAt <= now → invalid_schedule.
            if (isErr(result)) expect(result.error.code).toBe("invalid_schedule");
          }
        }

        // Guard je čistý: vstupní médium zůstává beze změny.
        expect(item.status).toBe(snapshot.status);
        expect(item.publishAt).toBe(snapshot.publishAt);
      }),
      { numRuns: 100 },
    );
  });

  it("canPublishNow zamítne skrytá média a povolí ostatní — stav beze změny", () => {
    fc.assert(
      fc.property(status, itemPublishAt, (st, pa) => {
        const item: MediaItemView = { status: st, publishAt: pa };
        const snapshot = { status: item.status, publishAt: item.publishAt };

        const result = canPublishNow(item);

        if (st === "hidden") {
          expect(isErr(result)).toBe(true);
          if (isErr(result)) expect(result.error.code).toBe("invalid_state");
        } else {
          expect(isOk(result)).toBe(true);
        }

        // Guard je čistý: vstupní médium zůstává beze změny.
        expect(item.status).toBe(snapshot.status);
        expect(item.publishAt).toBe(snapshot.publishAt);
      }),
      { numRuns: 100 },
    );
  });
});
