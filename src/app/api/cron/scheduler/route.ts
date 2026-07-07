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
import {
  buildTelegramGeneralPingDayKey,
  parseTelegramGeneralRandomMessages,
  pickRandomTelegramGeneralMessage,
  resolveDueTelegramGeneralPingSlot,
} from "@/services/telegram-community-service";
import { createTelegramBroadcastService } from "@/services/telegram-broadcast-service";

// Prisma a node:crypto vyžadují Node.js runtime (ne Edge).
export const runtime = "nodejs";
// Plánovací běh nesmí být cachován ani staticky vyhodnocen.
export const dynamic = "force-dynamic";

const telegramService = createTelegramBroadcastService({
  config: {
    botToken: process.env.MMM_TELEGRAM_BOT_TOKEN,
    chatId: process.env.MMM_TELEGRAM_CHAT_ID,
    defaultThreadId: process.env.TELEGRAM_THREAD_GENERAL,
  },
});

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

async function maybeSendTelegramGeneralPing(now: Date): Promise<boolean> {
  const chatId = process.env.MMM_TELEGRAM_CHAT_ID?.trim();
  const threadId = process.env.TELEGRAM_THREAD_GENERAL?.trim();
  if (!chatId || !threadId) return false;

  const messages = parseTelegramGeneralRandomMessages(
    process.env.TELEGRAM_GENERAL_RANDOM_MESSAGES,
  );
  if (messages.length === 0) return false;

  const dayKey = buildTelegramGeneralPingDayKey(now);
  const keys = [0, 1, 2].map((slot) => `telegram_general_ping_${dayKey}_slot_${slot}`);
  const existing = await prisma.appConfig.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const existingKeys = new Set(
    existing.filter((row) => row.value).map((row) => row.key),
  );
  const dueSlot = resolveDueTelegramGeneralPingSlot({
    now,
    sentSlots: keys.map((key) => existingKeys.has(key)),
  });
  if (dueSlot === null) return false;

  const text = pickRandomTelegramGeneralMessage(messages);
  if (!text) return false;

  const sent = await telegramService.sendMessage({
    chatId,
    threadId,
    text,
  });
  if (!sent.ok) {
    console.error("Telegram general ping failed", {
      slot: dueSlot,
      dayKey,
      message: sent.error.message,
    });
    return false;
  }

  await prisma.appConfig.upsert({
    where: { key: keys[dueSlot] },
    update: { value: true },
    create: { key: keys[dueSlot], value: true },
  });
  return true;
}

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) {
    return NextResponse.json(
      { error: "cron_disabled", message: "CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  const provided = extractSecret(request);
  if (provided === null || !secretsMatch(provided, expected)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or missing cron secret." },
      { status: 401 },
    );
  }

  try {
    const now = new Date();
    const result = await createScheduler(prisma).runScheduler(now);
    const generalPingSent = await maybeSendTelegramGeneralPing(now);
    // runScheduler vrací Result<…, never> — vždy úspěch.
    const promoted = result.ok ? result.value.promoted : 0;
    return NextResponse.json({ promoted, generalPingSent }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "scheduler_failed", message: "The scheduler run failed." },
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
