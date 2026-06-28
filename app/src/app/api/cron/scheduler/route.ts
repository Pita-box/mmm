/**
 * Cron endpoint pro Scheduler (task 21.3, R8.2).
 *
 * Endpoint je určen ke spouštění cronem **každou minutu**. Po ověření tajemstvím
 * (`CRON_SECRET`) spustí plánovač (`runScheduler`), který povýší naplánovaná
 * média s `publishAt <= now` na published, a vrátí počet povýšených médií.
 * Tím je splněn požadavek publikace do 60 sekund od dosaženého času (R8.2).
 *
 * Autorizace: hlavička `authorization: Bearer <CRON_SECRET>` nebo
 * `x-cron-secret: <CRON_SECRET>`. Porovnání probíhá v konstantním čase. Chybí-li
 * `CRON_SECRET` v prostředí, je endpoint zakázán (503) — žádný nechráněný běh.
 *
 * Endpoint nikdy nevyhazuje výjimku přes svou hranici; vždy vrací typovaný JSON.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createScheduler } from "@/services/scheduler";

// Prisma a node:crypto vyžadují Node.js runtime (ne Edge).
export const runtime = "nodejs";
// Plánovací běh nesmí být cachován ani staticky vyhodnocen.
export const dynamic = "force-dynamic";

/** Porovná dvě tajemství v konstantním čase (zabrání timing útoku). */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Vytáhne předané tajemství z hlaviček (`authorization` Bearer nebo `x-cron-secret`). */
function extractSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if (bearer.length > 0) return bearer;
  }
  const headerSecret = request.headers.get("x-cron-secret");
  return headerSecret && headerSecret.length > 0 ? headerSecret : null;
}

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) {
    return NextResponse.json(
      { error: "cron_disabled", message: "CRON_SECRET není nastaven." },
      { status: 503 },
    );
  }

  const provided = extractSecret(request);
  if (provided === null || !secretsMatch(provided, expected)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Neplatné nebo chybějící cron tajemství." },
      { status: 401 },
    );
  }

  try {
    const result = await createScheduler(prisma).runScheduler(new Date());
    // runScheduler vrací Result<…, never> — vždy úspěch.
    const promoted = result.ok ? result.value.promoted : 0;
    return NextResponse.json({ promoted }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "scheduler_failed", message: "Běh plánovače selhal." },
      { status: 500 },
    );
  }
}

/** Cron typicky volá POST; podporujeme i GET pro jednoduché plánovače. */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
