import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createSubscriptionService } from "@/services/subscription-service";
import { isOk, isErr } from "@/lib/result";

/**
 * Integrační testy zpracování Stripe webhooků (task 21.4). [POST-MVP]
 *
 * Ověřují celou dráhu `Subscription_Service.processWebhook` nad **in-memory
 * fake Prisma** a se sdíleným tajemstvím (mock Stripe): ověření podpisu →
 * parsování → klasifikace události → perzistence stavu + audit. Reprezentativní
 * scénáře:
 *  - správně podepsaný aktivační webhook → předplatné aktivní, audit accepted
 *    (R20.1/20.2 reprezentativně, R20.3),
 *  - správně podepsaný deaktivační webhook → předplatné neaktivní (R20.4),
 *  - chybně podepsaný webhook → odmítnut, žádná změna stavu, zaznamenán pokus
 *    o neoprávněný webhook (R20.5).
 */

const SECRET = "whsec_integration_secret";
const sign = (payload: string, secret = SECRET): string =>
  createHmac("sha256", secret).update(payload, "utf8").digest("hex");

// ─── In-memory fake Prisma (jen metody, které služba volá) ───────────────────

interface FakeUser {
  id: string;
  subscriptionStatus: "active" | "inactive";
}
interface FakeSub {
  userId: string;
  status: "active" | "inactive";
  stripeCustomerId?: string;
}
interface WebhookEventRow {
  eventId: string | null;
  type: string;
  accepted: boolean;
  reason: string | null;
}

class FakeSubscriptionPrisma {
  readonly users = new Map<string, FakeUser>();
  readonly subs = new Map<string, FakeSub>();
  readonly webhookEvents: WebhookEventRow[] = [];

  seedUser(
    id: string,
    status: "active" | "inactive",
    stripeCustomerId?: string,
  ): void {
    this.users.set(id, { id, subscriptionStatus: status });
    if (stripeCustomerId) {
      this.subs.set(id, { userId: id, status, stripeCustomerId });
    }
  }

  readonly user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.get(where.id) ?? null,

    findFirst: async ({
      where,
    }: {
      where: { subscription?: { stripeCustomerId?: string } };
    }) => {
      const customer = where.subscription?.stripeCustomerId;
      for (const sub of this.subs.values()) {
        if (sub.stripeCustomerId === customer) {
          return this.users.get(sub.userId) ?? null;
        }
      }
      return null;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { subscriptionStatus: "active" | "inactive" };
    }) => {
      const user = this.users.get(where.id);
      if (!user) throw new Error(`fake: user ${where.id} not found`);
      user.subscriptionStatus = data.subscriptionStatus;
      return user;
    },
  };

  readonly subscription = {
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { userId: string };
      update: { status: "active" | "inactive" };
      create: { userId: string; status: "active" | "inactive" };
    }) => {
      const existing = this.subs.get(where.userId);
      if (existing) {
        existing.status = update.status;
        return existing;
      }
      const row: FakeSub = { ...create };
      this.subs.set(where.userId, row);
      return row;
    },
  };

  readonly webhookEvent = {
    create: async ({ data }: { data: WebhookEventRow }) => {
      this.webhookEvents.push(data);
      return data;
    },
  };

  /** Operace se spustí už při vytvoření Promisu; transakce je jen atomicky odčeká. */
  async $transaction<T>(operations: readonly Promise<T>[]): Promise<T[]> {
    return Promise.all(operations);
  }
}

function makeService(prisma: FakeSubscriptionPrisma) {
  return createSubscriptionService(prisma as unknown as PrismaClient, {
    webhookSecret: SECRET,
  });
}

describe("processWebhook — ověřený aktivační webhook (R20.3)", () => {
  it("nastaví předplatné uživatele na aktivní a zaznamená přijatý audit", async () => {
    const prisma = new FakeSubscriptionPrisma();
    prisma.seedUser("u1", "inactive");
    const svc = makeService(prisma);

    const payload = JSON.stringify({
      id: "evt_active_1",
      type: "invoice.payment_succeeded",
      data: { userId: "u1" },
    });
    const result = await svc.processWebhook({ payload, signature: sign(payload) });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.value.applied).toBe(true);
    expect(result.value.status).toBe("active");
    expect(prisma.users.get("u1")?.subscriptionStatus).toBe("active");
    expect(prisma.subs.get("u1")?.status).toBe("active");

    const audit = prisma.webhookEvents.at(-1);
    expect(audit?.accepted).toBe(true);
    expect(audit?.type).toBe("invoice.payment_succeeded");
  });
});

describe("processWebhook — ověřený deaktivační webhook (R20.4)", () => {
  it("nastaví předplatné uživatele na neaktivní", async () => {
    const prisma = new FakeSubscriptionPrisma();
    prisma.seedUser("u2", "active");
    const svc = makeService(prisma);

    const payload = JSON.stringify({
      id: "evt_inactive_1",
      type: "invoice.payment_failed",
      data: { userId: "u2" },
    });
    const result = await svc.processWebhook({ payload, signature: sign(payload) });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.value.status).toBe("inactive");
    expect(prisma.users.get("u2")?.subscriptionStatus).toBe("inactive");
  });
});

describe("processWebhook — chybně podepsaný webhook (R20.5)", () => {
  it("je odmítnut, nemění stav předplatného a zaznamená neoprávněný pokus", async () => {
    const prisma = new FakeSubscriptionPrisma();
    prisma.seedUser("u3", "active");
    const svc = makeService(prisma);

    const payload = JSON.stringify({
      id: "evt_forged",
      type: "invoice.payment_failed",
      data: { userId: "u3" },
    });
    // Podpis vytvořený jiným tajemstvím → neověřitelný.
    const result = await svc.processWebhook({
      payload,
      signature: sign(payload, "attacker-secret"),
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected err");
    expect(result.error.code).toBe("webhook_unverified");
    // Stav předplatného zůstal beze změny.
    expect(prisma.users.get("u3")?.subscriptionStatus).toBe("active");

    const audit = prisma.webhookEvents.at(-1);
    expect(audit?.accepted).toBe(false);
    expect(audit?.reason).toBe("invalid_signature_or_origin");
  });

  it("odmítne i webhook bez podpisu beze změny stavu", async () => {
    const prisma = new FakeSubscriptionPrisma();
    prisma.seedUser("u4", "active");
    const svc = makeService(prisma);

    const payload = JSON.stringify({
      id: "evt_nosig",
      type: "invoice.payment_succeeded",
      data: { userId: "u4" },
    });
    const result = await svc.processWebhook({ payload, signature: null });

    expect(isErr(result)).toBe(true);
    expect(prisma.users.get("u4")?.subscriptionStatus).toBe("active");
    expect(prisma.webhookEvents.at(-1)?.accepted).toBe(false);
  });
});
