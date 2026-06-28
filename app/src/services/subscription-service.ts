/**
 * Subscription_Service — předplatné a zpracování Stripe webhooků (task 19.1). [POST-MVP]
 *
 * Tento soubor odděluje **čisté jádro** (ověření podpisu/původu webhooku,
 * klasifikace typu události na cílový stav předplatného) od **perzistentní
 * vrstvy** (Prisma). Čisté funkce jsou bez I/O, deterministické (vůči zadanému
 * `secret`/payloadu) a přímo testovatelné generátory (PBT tasky 19.2–19.4);
 * perzistentní operace jsou vystaveny přes `createSubscriptionService(prisma)`
 * a vracejí `Result<…, SubscriptionError>` — nikdy nevyhazují výjimku přes svou
 * hranici.
 *
 * Klíčová pravidla (R20):
 *  - ověřený webhook o úspěšné platbě → předplatné aktivní (R20.3),
 *  - ověřený webhook o selhání/vypršení → předplatné neaktivní (R20.4),
 *  - neověřitelný webhook (neplatný podpis/původ) je odmítnut, NEMĚNÍ stav
 *    žádného uživatele a je zaznamenán jako audit (WebhookEvent.accepted=false)
 *    s důvodem (R20.5),
 *  - nový účet má výchozí neaktivní předplatné (R20.7 — vynuceno i schématem),
 *  - Admin může ručně nastavit stav předplatného uživatele (R20.9).
 *
 * Skutečné volání Stripe SDK (checkout R20.1, zákaznický portál R20.8) i drátování
 * webhook endpointu jsou skryté za rozhraním `StripeGateway` a budou napojené
 * v tasku 21.3; ověření podpisu webhooku je ale **čisté** (HMAC) a žije zde.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SubscriptionStatus } from "@/lib/domain";
import type { SubscriptionError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import { prisma } from "@/lib/prisma";

// ─── Konstanty: mapování typů událostí na cílový stav ─────────────────────────

/**
 * Typy ověřených událostí, které aktivují předplatné (R20.3).
 * Úspěšná platba / aktivace předplatného.
 */
export const ACTIVATING_EVENT_TYPES: readonly string[] = [
  "invoice.payment_succeeded",
  "checkout.session.completed",
  "customer.subscription.created",
] as const;

/**
 * Typy ověřených událostí, které deaktivují předplatné (R20.4).
 * Selhání platby nebo vypršení/zrušení předplatného.
 */
export const DEACTIVATING_EVENT_TYPES: readonly string[] = [
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.paused",
] as const;

/** Výchozí stav předplatného nového účtu (R20.7). */
export const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = "inactive";

// ─── Čisté jádro: ověření podpisu webhooku (R20.5) ────────────────────────────

/** Je `value` neprázdný řetězec (po odstranění okrajových mezer)? */
function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Ověří pravost webhooku porovnáním HMAC-SHA256 podpisu payloadu (R20.5).
 *
 * Čistá, deterministická funkce bez I/O. Vrací `true` právě když je `signature`
 * platným HMAC-SHA256 (hex) nad `payload` se sdíleným `secret`. Porovnání je
 * v konstantním čase (`timingSafeEqual`), aby neunikala informace o podpisu.
 * Chybějící/prázdný podpis nebo secret nelze ověřit → `false` (žádný původ).
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!isNonEmpty(signature) || !isNonEmpty(secret)) return false;
  return safeEqualHex(signature.trim(), hmacHex(payload, secret));
}

// ─── Čisté jádro: klasifikace typu události ───────────────────────────────────

/**
 * Přiřadí typu ověřené události cílový stav předplatného (R20.3, R20.4).
 * Vrací `"active"` pro úspěšnou platbu, `"inactive"` pro selhání/vypršení,
 * nebo `null` pro typ, který se předplatného netýká (ignoruje se beze změny).
 */
export function classifyWebhookType(type: string): SubscriptionStatus | null {
  if (ACTIVATING_EVENT_TYPES.includes(type)) return "active";
  if (DEACTIVATING_EVENT_TYPES.includes(type)) return "inactive";
  return null;
}

/** Výchozí stav předplatného nového účtu (R20.7). Čistý helper. */
export function defaultSubscriptionStatus(): SubscriptionStatus {
  return DEFAULT_SUBSCRIPTION_STATUS;
}

// ─── Čisté jádro: parsování payloadu ──────────────────────────────────────────

/** Ověřená a rozparsovaná Stripe událost potřebná ke zpracování. */
export interface ParsedWebhookEvent {
  /** Stripe event id (`evt_…`); slouží i pro idempotenci/audit. */
  readonly eventId: string | null;
  readonly type: string;
  /** Reference na uživatele z metadat (preferováno). */
  readonly userId: string | null;
  /** Reference na zákazníka Stripe (fallback k vyhledání uživatele). */
  readonly stripeCustomerId: string | null;
}

/**
 * Rozparsuje JSON payload ověřeného webhooku do `ParsedWebhookEvent`.
 * Čistá funkce; vrací `null`, pokud payload není validní JSON s polem `type`.
 * Očekávaný tvar (zploštěné reference kvůli testovatelnosti):
 *   `{ id, type, data: { userId?, stripeCustomerId? } }`
 */
export function parseWebhookEvent(payload: string): ParsedWebhookEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string" || obj.type.length === 0) return null;

  const data =
    typeof obj.data === "object" && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : {};

  return {
    eventId: typeof obj.id === "string" && obj.id.length > 0 ? obj.id : null,
    type: obj.type,
    userId: typeof data.userId === "string" && data.userId.length > 0 ? data.userId : null,
    stripeCustomerId:
      typeof data.stripeCustomerId === "string" && data.stripeCustomerId.length > 0
        ? data.stripeCustomerId
        : null,
  };
}

// ─── Stripe gateway (SDK za rozhraním; napojení v tasku 21.3) ─────────────────

/**
 * Port ke Stripe SDK. Checkout (R20.1) a zákaznický portál (R20.8) volají SDK
 * přes toto rozhraní; skutečná implementace bude napojena v tasku 21.3. Ověření
 * podpisu webhooku je čisté (HMAC) a gateway k němu nepotřebuje.
 */
export interface StripeGateway {
  /** Vytvoří měsíční předplatné přes Stripe checkout (R20.1). */
  createCheckoutSubscription(userId: string): Promise<Result<{ checkoutUrl: string }, SubscriptionError>>;
  /** URL zákaznického portálu pro správu/zrušení předplatného (R20.8). */
  createCustomerPortalSession(userId: string): Promise<Result<{ portalUrl: string }, SubscriptionError>>;
}

/**
 * Stub Stripe gateway pro fázi před napojením SDK (task 21.3). Vrací chybu
 * `not_found` místo toho, aby vyhazoval výjimku přes hranici služby.
 */
export function createStubStripeGateway(): StripeGateway {
  const notWired: SubscriptionError = {
    code: "not_found",
    message: "Stripe SDK není napojeno (stub, napojení v tasku 21.3).",
  };
  return {
    async createCheckoutSubscription() {
      return err(notWired);
    },
    async createCustomerPortalSession() {
      return err(notWired);
    },
  };
}

// ─── Perzistentní vrstva ──────────────────────────────────────────────────────

/** Vstup pro zpracování příchozího webhooku (drátuje endpoint v tasku 21.3). */
export interface WebhookInput {
  /** Surový (raw) JSON payload tak, jak dorazil — podpis se ověřuje nad ním. */
  readonly payload: string;
  /** HMAC-SHA256 podpis z hlavičky požadavku. */
  readonly signature: string | null | undefined;
  readonly now?: Date;
}

/** Výsledek zpracování ověřeného webhooku. */
export interface WebhookResult {
  /** Byla provedena změna stavu předplatného? */
  readonly applied: boolean;
  /** Cílový stav, na který byl uživatel nastaven (nebo `null` při ignorování). */
  readonly status: SubscriptionStatus | null;
  /** Dotčený uživatel (nebo `null`, pokud událost nemá dopad). */
  readonly userId: string | null;
}

export interface SubscriptionService {
  /**
   * Zpracuje příchozí Stripe webhook (R20.3, R20.4, R20.5).
   * Neověřitelný webhook je odmítnut bez změny stavu a zaznamenán jako audit
   * (`accepted=false`). Ověřená událost o (ne)úspěchu nastaví stav předplatného
   * dotčeného uživatele a je zaznamenána (`accepted=true`).
   */
  processWebhook(input: WebhookInput): Promise<Result<WebhookResult, SubscriptionError>>;
  /** Ruční nastavení stavu předplatného Adminem (R20.9). */
  setSubscriptionStatusByAdmin(
    userId: string,
    status: SubscriptionStatus,
  ): Promise<Result<SubscriptionStatus, SubscriptionError>>;
  /** Aktuální stav předplatného uživatele (zdroj pro Access_Middleware). */
  getSubscriptionStatus(userId: string): Promise<Result<SubscriptionStatus, SubscriptionError>>;
}

export interface SubscriptionServiceOptions {
  /** Tajný klíč pro ověření podpisu webhooku. Výchozí `STRIPE_WEBHOOK_SECRET`. */
  readonly webhookSecret?: string;
  /** Stripe gateway (SDK). Výchozí stub do napojení v tasku 21.3. */
  readonly stripe?: StripeGateway;
}

const USER_NOT_FOUND: SubscriptionError = {
  code: "not_found",
  message: "Uživatel nebyl nalezen.",
};

/**
 * Vytvoří instanci Subscription_Service nad daným Prisma klientem.
 * Čisté jádro (ověření podpisu, klasifikace) je vystaveno i jako samostatné
 * exporty (pro PBT bez I/O).
 */
export function createSubscriptionService(
  prisma: PrismaClient,
  options: SubscriptionServiceOptions = {},
): SubscriptionService {
  // Secret se čte líně z prostředí, aby import služby neselhal v MVP režimu
  // (platby vypnuté). Chybí-li secret, žádný webhook nelze ověřit → odmítnut.
  const resolveSecret = (): string | undefined =>
    options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;

  /** Nastaví stav předplatného atomicky na User i Subscription. */
  async function applyStatus(userId: string, status: SubscriptionStatus): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: status } }),
      prisma.subscription.upsert({
        where: { userId },
        update: { status },
        create: { userId, status },
      }),
    ]);
  }

  return {
    async processWebhook(input) {
      const secret = resolveSecret();
      const verified = verifyWebhookSignature(input.payload, input.signature, secret);

      // R20.5 — neověřitelný webhook: odmítnout, žádná změna stavu, audit log.
      if (!verified) {
        await prisma.webhookEvent.create({
          data: {
            eventId: null, // bez ověření nedůvěřujeme obsahu ani id
            type: "unverified",
            accepted: false,
            reason: "invalid_signature_or_origin",
          },
        });
        return err({
          code: "webhook_unverified",
          message: "Webhook nelze ověřit (neplatný podpis nebo původ) — odmítnuto.",
        });
      }

      // Podpis je platný → obsah je autentický. Rozparsuj a klasifikuj.
      const event = parseWebhookEvent(input.payload);
      if (event === null) {
        await prisma.webhookEvent.create({
          data: { eventId: null, type: "unparseable", accepted: true, reason: "malformed_payload" },
        });
        return ok({ applied: false, status: null, userId: null });
      }

      const target = classifyWebhookType(event.type);
      if (target === null) {
        // Ověřená, ale pro předplatné irelevantní událost — ignoruj beze změny.
        await prisma.webhookEvent.create({
          data: { eventId: event.eventId, type: event.type, accepted: true, reason: "ignored" },
        });
        return ok({ applied: false, status: null, userId: null });
      }

      // Najdi dotčeného uživatele (preferuj userId z metadat, jinak Stripe zákazníka).
      const user = event.userId
        ? await prisma.user.findUnique({ where: { id: event.userId } })
        : event.stripeCustomerId
          ? await prisma.user.findFirst({
              where: { subscription: { stripeCustomerId: event.stripeCustomerId } },
            })
          : null;

      if (user === null) {
        await prisma.webhookEvent.create({
          data: { eventId: event.eventId, type: event.type, accepted: true, reason: "user_not_found" },
        });
        return err(USER_NOT_FOUND);
      }

      // R20.3 / R20.4 — nastav cílový stav předplatného a zaznamenej audit.
      await applyStatus(user.id, target);
      await prisma.webhookEvent.create({
        data: { eventId: event.eventId, type: event.type, accepted: true, reason: null },
      });
      return ok({ applied: true, status: target, userId: user.id });
    },

    async setSubscriptionStatusByAdmin(userId, status) {
      // R20.9 — ruční změna stavu Adminem.
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user === null) return err(USER_NOT_FOUND);
      await applyStatus(userId, status);
      return ok(status);
    },

    async getSubscriptionStatus(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true },
      });
      if (user === null) return err(USER_NOT_FOUND);
      return ok(user.subscriptionStatus);
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient (stub Stripe gateway). */
export const subscriptionService: SubscriptionService = createSubscriptionService(prisma);
