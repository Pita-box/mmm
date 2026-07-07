// Feature: mmmred-streaming-dashboard, Property 40: Přechody stavu předplatného z ověřených webhooků
/**
 * Property 40: Přechody stavu předplatného z ověřených webhooků
 *
 * Pro libovolný ověřený Stripe webhook platí, že událost úspěšné platby nastaví
 * předplatné na aktivní a událost selhání/vypršení na neaktivní.
 *
 * Validates: Requirements 20.3, 20.4
 *
 * Jádrem property je čistá klasifikace `classifyWebhookType`: typ z aktivační
 * množiny → "active", z deaktivační množiny → "inactive", jinak → null. Druhý
 * (volitelný) test ověří totéž end-to-end přes `processWebhook` se správně
 * podepsaným payloadem nad drobnou in-memory fake Prisma vrstvou.
 */
import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient } from "@prisma/client";
import type { SubscriptionStatus } from "@/lib/domain";
import {
  ACTIVATING_EVENT_TYPES,
  DEACTIVATING_EVENT_TYPES,
  classifyWebhookType,
  createSubscriptionService,
} from "@/services/subscription-service";

const KNOWN_TYPES = new Set<string>([...ACTIVATING_EVENT_TYPES, ...DEACTIVATING_EVENT_TYPES]);

/** Generátor typu, který do žádné z mapovaných množin nepatří (→ null). */
const otherTypeArb = fc.string().filter((t) => !KNOWN_TYPES.has(t));

describe("Property 40: přechody stavu předplatného z ověřených webhooků", () => {
  it("classifyWebhookType mapuje aktivační typy na active, deaktivační na inactive, ostatní na null", () => {
    const caseArb = fc.oneof(
      // Aktivační události → "active" (R20.3)
      fc
        .constantFrom(...ACTIVATING_EVENT_TYPES)
        .map((type) => ({ type, expected: "active" as SubscriptionStatus | null })),
      // Deaktivační události → "inactive" (R20.4)
      fc
        .constantFrom(...DEACTIVATING_EVENT_TYPES)
        .map((type) => ({ type, expected: "inactive" as SubscriptionStatus | null })),
      // Irelevantní události → null (beze změny stavu)
      otherTypeArb.map((type) => ({ type, expected: null as SubscriptionStatus | null })),
    );

    fc.assert(
      fc.property(caseArb, ({ type, expected }) => {
        expect(classifyWebhookType(type)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("processWebhook nastaví stav předplatného uživatele dle ověřené události (end-to-end)", async () => {
    const secret = "whsec_test_property40";

    const eventArb = fc.oneof(
      fc
        .constantFrom(...ACTIVATING_EVENT_TYPES)
        .map((type) => ({ type, expected: "active" as SubscriptionStatus })),
      fc
        .constantFrom(...DEACTIVATING_EVENT_TYPES)
        .map((type) => ({ type, expected: "inactive" as SubscriptionStatus })),
    );

    await fc.assert(
      fc.asyncProperty(
        eventArb,
        fc.string({ minLength: 1, maxLength: 12 }).map((s) => `user_${s}`),
        fc.constantFrom<SubscriptionStatus>("active", "inactive"),
        async ({ type, expected }, userId, initialStatus) => {
          const { prisma, statusOf } = makeFakePrisma(userId, initialStatus);
          const service = createSubscriptionService(prisma, { webhookSecret: secret });

          const payload = JSON.stringify({ id: "evt_1", type, data: { userId } });
          const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

          const result = await service.processWebhook({ payload, signature });

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toEqual({ applied: true, status: expected, userId });
          }
          // Ověřený webhook skutečně přepsal stav uživatele na cílovou hodnotu.
          expect(statusOf(userId)).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Drobná in-memory fake Prisma vrstva — pokrývá jen volání, která `processWebhook`
 * potřebuje pro cestu „ověřený webhook s userId v metadatech". Žádné I/O.
 */
function makeFakePrisma(
  userId: string,
  initialStatus: SubscriptionStatus,
): { prisma: PrismaClient; statusOf: (id: string) => SubscriptionStatus | undefined } {
  const users = new Map<string, { id: string; subscriptionStatus: SubscriptionStatus }>([
    [userId, { id: userId, subscriptionStatus: initialStatus }],
  ]);
  const subscriptions = new Map<string, { userId: string; status: SubscriptionStatus }>();

  const fake = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
      findFirst: async () => null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { subscriptionStatus: SubscriptionStatus };
      }) => {
        const u = users.get(where.id);
        if (u) u.subscriptionStatus = data.subscriptionStatus;
        return u ?? null;
      },
    },
    subscription: {
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: { status: SubscriptionStatus };
        create: { userId: string; status: SubscriptionStatus };
      }) => {
        const existing = subscriptions.get(where.userId);
        if (existing) {
          existing.status = update.status;
          return existing;
        }
        const created = { ...create };
        subscriptions.set(where.userId, created);
        return created;
      },
    },
    webhookEvent: {
      create: async ({ data }: { data: unknown }) => data,
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return {
    prisma: fake as unknown as PrismaClient,
    statusOf: (id: string) => users.get(id)?.subscriptionStatus,
  };
}
