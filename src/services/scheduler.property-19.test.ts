// Feature: mmmred-streaming-dashboard, Property 19: Plánovač publikuje právě dosažená média
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient } from "@prisma/client";
import type { MediaStatus } from "@/lib/domain";
import type { MediaItemView } from "@/services/media-service";
import { selectDueMedia, createScheduler } from "./scheduler";
import { isOk } from "@/lib/result";

/**
 * Property 19: Plánovač publikuje právě dosažená média.
 *
 * Pro libovolnou množinu naplánovaných médií a libovolný čas `now` platí, že po
 * běhu plánovače přejdou do stavu `published` právě ta média, jejichž
 * `publishAt <= now`, a ostatní zůstanou naplánovaná.
 *
 * **Validates: Requirements 8.2**
 *
 * Test má dvě části:
 *  1) Čisté jádro `selectDueMedia(items, now)` — vrací přesně média s
 *     `publishAt != null && publishAt <= now`, ostatní vylučuje. Zrcadlí dotaz
 *     perzistentní vrstvy bez I/O.
 *  2) Perzistentní `createScheduler(prisma).runScheduler(now)` nad minimálním
 *     in-memory fake Prismou implementující `mediaItem.updateMany` — potvrzuje,
 *     že na `published` přejdou právě naplánovaná dosažená média a nic jiného.
 */

// ─── Generátory ─────────────────────────────────────────────────────────────

/** Referenční čas — okolo něj generujeme publishAt do minulosti i budoucnosti. */
const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

/** publishAt: buď null, nebo Date v okně ±~23 dní okolo `now` (včetně přesně `now`). */
const publishAtArb: fc.Arbitrary<Date | null> = fc.oneof(
  fc.constant<Date | null>(null),
  fc.integer({ min: -2_000_000_000, max: 2_000_000_000 }).map((delta) => new Date(NOW + delta)),
  fc.constant<Date | null>(new Date(NOW)), // hraniční případ publishAt == now (dosažené)
);

const statusArb: fc.Arbitrary<MediaStatus> = fc.constantFrom("scheduled", "published", "hidden");

/** Libovolné médium (jakýkoli stav) — pro test čistého `selectDueMedia`. */
const mediaViewArb: fc.Arbitrary<MediaItemView> = fc.record({
  status: statusArb,
  publishAt: publishAtArb,
});

const now = new Date(NOW);

describe("Property 19: Plánovač publikuje právě dosažená média", () => {
  it("selectDueMedia vrací přesně média s publishAt != null && publishAt <= now", () => {
    fc.assert(
      fc.property(fc.array(mediaViewArb, { maxLength: 30 }), (items) => {
        const due = selectDueMedia(items, now);

        // Každé vrácené médium je dosažené.
        for (const item of due) {
          expect(item.publishAt).not.toBeNull();
          expect(item.publishAt!.getTime()).toBeLessThanOrEqual(now.getTime());
        }

        // Každé NEvrácené médium dosažené není (null nebo v budoucnu).
        const dueSet = new Set(due);
        for (const item of items) {
          if (!dueSet.has(item)) {
            const reached = item.publishAt !== null && item.publishAt.getTime() <= now.getTime();
            expect(reached).toBe(false);
          }
        }

        // Vstup se nemutuje a výběr je čistá podmnožina (zachované pořadí).
        expect(due).toEqual(
          items.filter((i) => i.publishAt !== null && i.publishAt.getTime() <= now.getTime()),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("runScheduler povýší na published právě naplánovaná dosažená média, ostatní zůstanou beze změny", async () => {
    // Řádek s identitou pro sledování stavu napříč fake updateMany.
    interface Row {
      id: string;
      status: MediaStatus;
      publishAt: Date | null;
    }

    const rowArb = fc.record({
      status: statusArb,
      publishAt: publishAtArb,
    });

    await fc.assert(
      fc.asyncProperty(fc.array(rowArb, { maxLength: 30 }), async (specs) => {
        const rows: Row[] = specs.map((s, i) => ({ id: `m-${i}`, ...s }));

        // Minimální in-memory fake Prisma: jen mediaItem.updateMany se sémantikou
        // `WHERE status = ? AND publishAt <= now  SET status = ?` (lte podle času).
        const fake = {
          mediaItem: {
            updateMany: async ({
              where,
              data,
            }: {
              where: { status: MediaStatus; publishAt: { lte: Date } };
              data: { status: MediaStatus };
            }) => {
              let count = 0;
              for (const row of rows) {
                if (
                  row.status === where.status &&
                  row.publishAt !== null &&
                  row.publishAt.getTime() <= where.publishAt.lte.getTime()
                ) {
                  row.status = data.status;
                  count += 1;
                }
              }
              return { count };
            },
          },
        };

        // Očekávání spočítané PŘED během (na původních stavech).
        const expectedPromoted = specs.filter(
          (s) => s.status === "scheduled" && s.publishAt !== null && s.publishAt.getTime() <= now.getTime(),
        ).length;
        const expectedFinal = rows.map((r) => {
          const due = r.status === "scheduled" && r.publishAt !== null && r.publishAt.getTime() <= now.getTime();
          return due ? "published" : r.status;
        });

        const scheduler = createScheduler(fake as unknown as PrismaClient);
        const result = await scheduler.runScheduler(now);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.promoted).toBe(expectedPromoted);
        }

        // Každý řádek skončí ve správném stavu: dosažená naplánovaná → published,
        // ostatní (budoucí scheduled, published, hidden) beze změny.
        expect(rows.map((r) => r.status)).toEqual(expectedFinal);
      }),
      { numRuns: 100 },
    );
  });
});
