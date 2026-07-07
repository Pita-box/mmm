// Feature: mmmred-streaming-dashboard, Property 35: Validace a singleton oznamovacího banneru
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, Notification } from "@prisma/client";
import { createNotificationService } from "./notification-service";
import { isOk } from "@/lib/result";

/**
 * Property 35: Validace a singleton oznamovacího banneru.
 *
 * Pro libovolný text platí, že aktivace oznámení uspěje právě tehdy, když má
 * text délku 1–500 znaků; po aktivaci je vždy aktivní nejvýše jeden banner a
 * aktivace dalšího oznámení nahradí text předchozího (getActiveBanner odráží
 * nejnovější aktivní text).
 *
 * **Validates: Requirements 17.1, 17.3, 17.5**
 */

/**
 * Minimální ruční in-memory fake PrismaClient.
 *
 * Implementuje jen to, co Notification_Service volá: `notification.updateMany`
 * (nastaví active=false tam, kde je active), `notification.create`,
 * `notification.findFirst` (nejnovější aktivní) a `$transaction` (sekvenční
 * resolvování předaných operací). Žádná DB, žádný I/O — test ověřuje čistě
 * logiku služby. `updatedAt` je odvozeno z monotónních hodin, aby „nejnovější"
 * banner byl jednoznačný i v rámci jedné milisekundy.
 */
function createFakePrisma(): {
  prisma: PrismaClient;
  activeCount: () => number;
} {
  const store = new Map<string, Notification>();
  let seq = 0;
  let clock = 0;

  const notification = {
    async updateMany({
      where,
      data,
    }: {
      where?: { active?: boolean };
      data: { active: boolean };
    }): Promise<{ count: number }> {
      let count = 0;
      for (const [id, n] of store) {
        if (where?.active === undefined || n.active === where.active) {
          store.set(id, { ...n, active: data.active });
          count++;
        }
      }
      return { count };
    },
    async create({
      data,
    }: {
      data: { text: string; active?: boolean };
    }): Promise<Notification> {
      const created: Notification = {
        id: `n${++seq}`,
        text: data.text,
        active: data.active ?? false,
        updatedAt: new Date(++clock),
      };
      store.set(created.id, { ...created });
      return { ...created };
    },
    async findFirst({
      where,
      orderBy,
    }: {
      where?: { active?: boolean };
      orderBy?: { updatedAt: "asc" | "desc" };
    }): Promise<Notification | null> {
      let items = [...store.values()];
      if (where?.active !== undefined) {
        items = items.filter((n) => n.active === where.active);
      }
      const dir = orderBy?.updatedAt === "asc" ? 1 : -1;
      items.sort((a, b) => dir * (a.updatedAt.getTime() - b.updatedAt.getTime()));
      return items.length > 0 ? { ...items[0] } : null;
    },
  };

  // $transaction dostane pole již spuštěných (eager) Prisma promes a vrátí
  // jejich výsledky v pořadí — stejně jako reálný klient.
  const $transaction = async <T>(ops: Promise<T>[]): Promise<T[]> =>
    Promise.all(ops);

  return {
    prisma: { notification, $transaction } as unknown as PrismaClient,
    activeCount: () => [...store.values()].filter((n) => n.active).length,
  };
}

/** Texty délky 0–520 — pokrývají platné (1–500) i neplatné (0, 501–520) délky. */
const textArb = fc.string({ minLength: 0, maxLength: 520 });

/** Sekvence aktivací (1–12 textů) — testuje singleton a nahrazení textu. */
const activationsArb = fc.array(textArb, { minLength: 1, maxLength: 12 });

describe("Property 35: validace a singleton oznamovacího banneru", () => {
  it("aktivace uspěje právě pro délku 1–500, vždy je aktivní nejvýše jeden banner a další aktivace nahradí text", async () => {
    await fc.assert(
      fc.asyncProperty(activationsArb, async (texts) => {
        const { prisma, activeCount } = createFakePrisma();
        const svc = createNotificationService(prisma);

        // Očekávaný aktuálně aktivní text po dosud provedených aktivacích.
        let expectedActive: string | null = null;

        for (const text of texts) {
          const valid = text.length >= 1 && text.length <= 500;

          // Aktivace uspěje právě tehdy, když má text délku 1–500 (R17.1, R17.3).
          const res = await svc.activate(text);
          expect(isOk(res)).toBe(valid);

          if (valid) {
            expectedActive = text;
          }

          // Singleton: po libovolné aktivaci je aktivní nejvýše jeden banner (R17.5).
          expect(activeCount()).toBeLessThanOrEqual(1);

          // getActiveBanner odráží nejnovější platnou aktivaci; neplatná aktivace
          // zachová předchozí stav beze změny (R17.3, R17.5).
          const banner = await svc.getActiveBanner();
          if (expectedActive === null) {
            expect(banner).toBeNull();
            expect(activeCount()).toBe(0);
          } else {
            expect(banner).not.toBeNull();
            expect(banner?.text).toBe(expectedActive);
            expect(activeCount()).toBe(1);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
