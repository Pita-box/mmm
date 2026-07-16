import { NextResponse } from "next/server";
import {
  createTelegramBroadcastService,
} from "@/services/telegram-broadcast-service";
import { resolveTelegramWebhookReply } from "@/services/telegram-bot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const telegramBotService = createTelegramBroadcastService({
  config: {
    botToken: process.env.MMM_TELEGRAM_BOT_TOKEN,
    chatId: process.env.MMM_TELEGRAM_CHAT_ID,
    defaultThreadId: process.env.TELEGRAM_THREAD_GENERAL,
    botApiBaseUrl: process.env.TELEGRAM_BOT_API_BASE_URL,
  },
});

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "The request body could not be read." },
      { status: 400 },
    );
  }

  const reply = resolveTelegramWebhookReply(
    payload as Parameters<typeof resolveTelegramWebhookReply>[0],
    {
      groupUrl: process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL,
      suggestionsThreadId: process.env.TELEGRAM_THREAD_SUGGESTIONS,
      requestThreadId: process.env.TELEGRAM_THREAD_REQUEST,
    },
  );

  if (!reply) {
    return NextResponse.json({ ok: true, handled: false }, { status: 200 });
  }

  const sent = await telegramBotService.sendMessage({
    chatId: reply.chatId,
    threadId: reply.threadId,
    replyToMessageId: reply.replyToMessageId,
    text: reply.text,
    inlineButton: {
      text: "🔥 Join group",
      url: "https://t.me/+nKmAUZEMd9lkZTk8",
    },
  });

  if (!sent.ok) {
    return NextResponse.json(
      { ok: false, error: sent.error.code, message: sent.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, handled: true }, { status: 200 });
}
