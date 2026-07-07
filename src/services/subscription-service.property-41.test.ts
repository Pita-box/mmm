// Feature: mmmred-streaming-dashboard, Property 41: Neověřitelný webhook nemění stav
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import fc from "fast-check";
import type { PrismaClient, User, WebhookEvent } from "@prisma/client";
import {
  createSubscriptionService,
  verifyWebhookSignature,
} from "./subscription-service";
import type { SubscriptionStatus } from "@/lib/domain";
import { isErr } from "@/lib/result";

/**
 * Property 41: Neověřitelný webhook nemění stav.
 *
 * Pro libovolný webhook s neplatným podpisem nebo původem platí, že je odmítnut,
 * nezmění stav předplatného žádného uživatele a je zaznamenán pokus o neoprávněný
 * webhook (WebhookEvent.accepted=false).
 *
 * Ověřuje se to dvěma cestami:
 *  1) čistá funkce `verifyWebhookSignature` vrací `false` pro prázdné/chybné
 *     podpisy (žádný původ → nelze ověřit), a
 *  2) `createSubscriptionService(prisma).processWebhook` nad minimálním in-memory
 *     fake Prisma klientem odmítne neověřený webhook s chybou `webhook_unverified`,
 *     vytvoří audit řádek `accepted=false` a NIKDY nezavolá mutace stavu
 *     (`user.update` / `subscription.upsert`), takže stav žádného uživatele se
 *     nezmění.
 *
 * **Validates: Requirements 20.5**
 */

const SECRET = "whsec_test_secret_for_property_41";
const WRONG_SECRET = "whsec_some_other_secret";

const hmac = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload, "utf8").digest("hex");

/**
 * Minimální ruční in-memory fake PrismaClient.
 *
 * Implementuje jen to, co `processWebhook` na neověřené cestě potřebuje:
 * `webhookEvent.create` (audit). Mutace stavu (`user.update`,
 * `subscription.upsert`) a `$transaction` jsou rovněž přítomné, ale počítají
 * volání — pro neověřený webhook MUSÍ zůstat na nule. Žádná DB, žádný I/O.
 */
function createFakePrisma(seed: ReadonlyArray<{ id: string; status: SubscriptionStatus }>): {
  prisma: PrismaClient;
  events: WebhookEvent[];
  mutationCount: () => number;
  statusOf: (id: string) => SubscriptionStatus | undefined;
} {
  const users = new Map<string, User>();
  for (const u of seed) {
    users.set(u.id, { id: u.id, subscriptionStatus: u.status } as unknown as User);
  }
  const events: WebhookEvent[] = [];
  let seq = 0;
  let mutations = 0;

  const webhookEvent = {
    async create({
      data,
    }: {
      data: {
        eventId: string | null;
        type: string;
        accepted: boolean;
        reason: string | null;
      };
    }): Promise<WebhookEvent> {
      const created = {
        id: `evt${++seq}`,
        eventId: data.eventId,
        type: data.type,
        accepted: data.accepted,
        reason: data.reason,
        payloadHash: null,
        receivedAt: new Date(seq),
      } as unknown as WebhookEvent;
      events.push(created);
      return created;
    },
  };

  // Mutace stavu — pro neověřený webhook se NESMÍ zavolat. Pokud se zavolá,
  // zvýší čítač (a stav bychom skutečně změnili), což property odhalí.
  const user = {
    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: { subscriptionStatus: SubscriptionStatus };
    }): Promise<User> {
      mutations++;
      const existing = users.get(where.id);
      const updated = { ...(existing ?? { id: where.id }), subscriptionStatus: data.subscriptionStatus } as User;
      users.set(where.id, updated);
      return updated;
    },
    async findUnique(): Promise<User | null> {
      // Na neověřené cestě se nevolá; vrať null defenzivně.
      return null;
    },
    async findFirst(): Promise<User | null> {
      return null;
    },
  };

  const subscription = {
    async upsert(): Promise<unknown> {
      mutations++;
      return {};
    },
  };

  const $transaction = async <T>(ops: Promise<T>[]): Promise<T[]> => Promise.all(ops);

  return {
    prisma: { webhookEvent, user, subscription, $transaction } as unknown as PrismaClient,
    events,
    mutationCount: () => mutations,
    statusOf: (id) => users.get(id)?.subscriptionStatus,
  };
}

const statusArb: fc.Arbitrary<SubscriptionStatus> = fc.constantFrom("active", "inactive");

/** Seed několika uživatelů s různými stavy předplatného. */
const seedArb = fc.array(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    status: statusArb,
  }),
  { minLength: 1, maxLength: 4 },
).map((arr) => {
  // Deduplikace dle id (mapa stejně přepíše, ale držme čitelný seed).
  const seen = new Map<string, { id: string; status: SubscriptionStatus }>();
  for (const u of arr) seen.set(u.id, u);
  return [...seen.values()];
});

/**
 * Dvojice (payload, neplatný podpis). Neplatný = prázdný/whitespace, chybějící,
 * náhodný hex, nebo HMAC vytvořený jiným secretem. Filtr zaručí, že se podpis
 * nikdy náhodně neshoduje se správným HMAC nad payloadem.
 */
const caseArb = fc
  .string({ maxLength: 300 })
  .chain((payload) =>
    fc.tuple(
      fc.constant(payload),
      fc.oneof(
        fc.constant<string | null | undefined>(""),
        fc.constant<string | null | undefined>("   "),
        fc.constant<string | null | undefined>(undefined),
        fc.constant<string | null | undefined>(null),
        fc.hexaString({ maxLength: 80 }),
        fc.constant<string | null | undefined>(hmac(payload, WRONG_SECRET)),
      ),
    ),
  )
  .filter(
    ([payload, signature]) =>
      !(typeof signature === "string" && signature.trim() === hmac(payload, SECRET)),
  );

describe("Property 41: neověřitelný webhook nemění stav (R20.5)", () => {
  it("verifyWebhookSignature vrací false pro chybný/prázdný podpis nebo původ", () => {
    fc.assert(
      fc.property(caseArb, ([payload, signature]) => {
        // Neplatný podpis/původ nelze ověřit (čisté jádro).
        expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("processWebhook odmítne, nezmění stav žádného uživatele a zaznamená audit accepted=false", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, seedArb, async ([payload, signature], seed) => {
        const { prisma, events, mutationCount, statusOf } = createFakePrisma(seed);
        const svc = createSubscriptionService(prisma, { webhookSecret: SECRET });

        const before = new Map(seed.map((u) => [u.id, u.status]));

        const res = await svc.processWebhook({ payload, signature });

        // Odmítnuto s chybou webhook_unverified (R20.5).
        expect(isErr(res)).toBe(true);
        if (isErr(res)) {
          expect(res.error.code).toBe("webhook_unverified");
        }

        // Žádná mutace stavu předplatného — user.update ani subscription.upsert.
        expect(mutationCount()).toBe(0);
        for (const u of seed) {
          expect(statusOf(u.id)).toBe(before.get(u.id));
        }

        // Zaznamenán právě jeden audit pokus o neoprávněný webhook (accepted=false).
        expect(events.length).toBe(1);
        expect(events[0].accepted).toBe(false);
        expect(events[0].reason).toBe("invalid_signature_or_origin");
      }),
      { numRuns: 100 },
    );
  });
});
