/**
 * Webhook endpoint pro Stripe (task 21.3, R20.3/20.4/20.5). [POST-MVP]
 *
 * Endpoint přijímá Stripe webhooky. Čte **surové** tělo požadavku (`req.text()`),
 * aby bylo možné ověřit podpis nad přesně tím bajtovým obsahem, jaký dorazil
 * (jakékoli předparsování JSON by podpis rozbilo). Podpis se předává službě
 * `Subscription_Service.processWebhook`, která:
 *  - ověřený webhook o úspěšné platbě → nastaví předplatné aktivní (R20.3),
 *  - ověřený webhook o selhání/vypršení → nastaví neaktivní (R20.4),
 *  - neověřitelný webhook → odmítne bez změny stavu a zaznamená audit (R20.5).
 *
 * Mapování na HTTP: přijatá událost → 200, `webhook_unverified` → 400,
 * `not_found` → 404. Endpoint nikdy nevyhazuje výjimku přes svou hranici.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSubscriptionService } from "@/services/subscription-service";

// Prisma a ověření podpisu (node:crypto) vyžadují Node.js runtime.
export const runtime = "nodejs";
// Webhook nesmí být cachován ani staticky vyhodnocen.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  // Surové tělo — NUTNÉ pro ověření podpisu (nečíst přes .json()).
  let payload: string;
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Tělo požadavku nelze přečíst." },
      { status: 400 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  try {
    const result = await createSubscriptionService(prisma).processWebhook({
      payload,
      signature,
    });

    if (result.ok) {
      return NextResponse.json(
        { received: true, applied: result.value.applied, status: result.value.status },
        { status: 200 },
      );
    }

    // Neověřitelný webhook (R20.5) → 400; chybějící uživatel → 404.
    const status = result.error.code === "webhook_unverified" ? 400 : 404;
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status },
    );
  } catch {
    return NextResponse.json(
      { error: "webhook_failed", message: "Zpracování webhooku selhalo." },
      { status: 500 },
    );
  }
}
