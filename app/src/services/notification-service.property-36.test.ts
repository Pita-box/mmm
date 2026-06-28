// Feature: mmmred-streaming-dashboard, Property 36: Round-trip aktivace/deaktivace a doručení novým relacím
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, Notification } from "@prisma/client";
import { createNotificationService } from "./notification-service";
import { isOk } from "@/lib/result";

/**
 * Property 36: Round-trip aktivace/deaktivace a doručení novým relacím.
 *
 * Pro libovolné oznámení platí, že aktivace a následná deaktivace vrátí stav do
 * „žádný banner"; a po dobu, kdy je oznámení aktivní, je jeho aktuální text
 * doručen každé nově vzniklé relaci (getActiveBanner je zdrojem textu pro novou
 * relaci a vrací právě aktivní text).
 *
 * **Validates: Requirements 17.2, 17.4**
 */

/**
 * Minimální ruční in-memory fake PrismaClient (shodná logika s property-35).
 *
 * Implementuje jen to, co Notification_Service volá: `notification.updateMany`
 * (nastaví active podle filtru), `notification.create`, `notification.findFirst`
 * (nejnovější aktivní) a `$transaction` (sekvenční resolvování předaných
 * operací). Žádná DB, žádný I/O. `updatedAt` je odvozeno z monotónních hodin,
 * aby „nejnovější" banner byl jednoznačný i v rámci jedné milisekundy.
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

/** Platné texty oznámení — délka 1–500 znaků (R17.1). */
const validTextArb = fc.string({ minLength: 1, maxLength: 500 });

describe("Property 36: round-trip aktivace/deaktivace a doručení novým relacím", () => {
  it("aktivace doručí aktuální text nové relaci a deaktivace vrátí stav do 'žádný banner'", async () => {
    await fc.assert(
      fc.asyncProperty(validTextArb, async (text) => {
        const { prisma, activeCount } = createFakePrisma();
        const svc = createNotificationService(prisma);

        // Výchozí stav: žádný banner — nová relace nedostane nic (R17.4).
        expect(await svc.getActiveBanner()).toBeNull();
        expect(activeCount()).toBe(0);

        // Aktivace platného textu uspěje (R17.1).
        const res = await svc.activate(text);
        expect(isOk(res)).toBe(true);

        // Po dobu aktivity je aktuální text doručen každé nově vzniklé relaci:
        // getActiveBanner (zdroj textu pro novou relaci) vrací právě tento text
        // a opakovaný dotaz (další nová relace) vrací totéž (R17.4).
        const first = await svc.getActiveBanner();
        expect(first).not.toBeNull();
        expect(first?.text).toBe(text);
        const second = await svc.getActiveBanner();
        expect(second?.text).toBe(text);
        expect(activeCount()).toBe(1);

        // Deaktivace vrátí stav do „žádný banner" (R17.2).
        const deRes = await svc.deactivate();
        expect(isOk(deRes)).toBe(true);

        // Round-trip dokončen: žádný aktivní banner; nová relace nedostane text.
        expect(await svc.getActiveBanner()).toBeNull();
        expect(activeCount()).toBe(0);

        // Idempotence deaktivace: opakování stav nezmění (R17.2).
        expect(isOk(await svc.deactivate())).toBe(true);
        expect(await svc.getActiveBanner()).toBeNull();
        expect(activeCount()).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
