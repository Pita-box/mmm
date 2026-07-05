/**
 * Telegram bot service — minimální Phase 1 logika pro `/start` a `/help`.
 *
 * Záměrně malé: bot odpoví jen na explicitní příkazy a jinak zůstává tichý.
 * Umožní komunikaci pod identitou bota bez použití osobního účtu.
 */

export interface TelegramWebhookChat {
  readonly id: number | string;
  readonly type?: string;
}

export interface TelegramWebhookMessage {
  readonly message_id: number;
  readonly text?: string;
  readonly message_thread_id?: number;
  readonly chat: TelegramWebhookChat;
  readonly from?: {
    readonly first_name?: string;
    readonly is_bot?: boolean;
  };
}

export interface TelegramWebhookUpdate {
  readonly update_id?: number;
  readonly message?: TelegramWebhookMessage;
}

export interface TelegramBotReply {
  readonly chatId: string;
  readonly text: string;
  readonly threadId?: number;
  readonly replyToMessageId?: number;
}

function normalizeCommand(text: string | undefined): string | null {
  if (!text) return null;
  const firstToken = text.trim().split(/\s+/, 1)[0];
  if (!firstToken?.startsWith("/")) return null;
  const command = firstToken.slice(1).split("@", 1)[0]?.toLowerCase();
  return command ? `/${command}` : null;
}

function buildLinksBlock(groupUrl: string | undefined): string {
  const trimmed = groupUrl?.trim();
  return trimmed ? `\n\nGroup: ${trimmed}` : "";
}

function normalizeThreadId(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildTelegramWelcomeMessage(args: {
  readonly firstName?: string;
  readonly groupUrl?: string;
}): string {
  const firstName = args.firstName?.trim();
  const hello = firstName ? `Hi ${firstName}` : "Hi";
  return (
    `${hello}, welcome to MMMRED.\n\n` +
    "I can help you stay in touch without needing the admin's personal account.\n\n" +
    "Available commands:\n" +
    "/help - show bot help\n" +
    "/start - show welcome message\n\n" +
    "Threads in the private group:\n" +
    "- General = common chat\n" +
    "- Gallery = new media notifications\n" +
    "- Suggestions = ideas and feedback\n" +
    "- Request = content requests" +
    buildLinksBlock(args.groupUrl)
  );
}

export function buildTelegramHelpMessage(args: {
  readonly groupUrl?: string;
}): string {
  return (
    "MMMRED bot help\n\n" +
    "What this bot does now:\n" +
    "- posts new media notifications to Gallery\n" +
    "- replies to /start and /help\n\n" +
    "Use the group threads like this:\n" +
    "- General = community chat\n" +
    "- Suggestions = ideas for the app\n" +
    "- Request = what you want added to the site" +
    buildLinksBlock(args.groupUrl)
  );
}

export function buildTelegramSuggestionAck(args: {
  readonly firstName?: string;
}): string {
  const firstName = args.firstName?.trim();
  const hello = firstName ? `Thanks ${firstName}` : "Thanks";
  return (
    `${hello}, your suggestion was received.\n\n` +
    "If you want to make it easier to evaluate, add:\n" +
    "- what you want changed\n" +
    "- why it would be useful\n" +
    "- screenshot / example if relevant"
  );
}

export function buildTelegramRequestAck(args: {
  readonly firstName?: string;
}): string {
  const firstName = args.firstName?.trim();
  const hello = firstName ? `Thanks ${firstName}` : "Thanks";
  return (
    `${hello}, your request was received.\n\n` +
    "To help processing, add:\n" +
    "- which model / content this is about\n" +
    "- link or reference if you have one\n" +
    "- how important / urgent it is"
  );
}

export function resolveTelegramWebhookReply(
  update: TelegramWebhookUpdate,
  options: {
    readonly groupUrl?: string;
    readonly suggestionsThreadId?: string | number | null;
    readonly requestThreadId?: string | number | null;
  },
): TelegramBotReply | null {
  const message = update.message;
  if (!message) return null;
  if (message.from?.is_bot) return null;

  const command = normalizeCommand(message.text);
  if (command === "/start" || command === "/help") {
    return {
      chatId: String(message.chat.id),
      threadId: message.message_thread_id,
      replyToMessageId: message.message_id,
      text:
        command === "/start"
          ? buildTelegramWelcomeMessage({
              firstName: message.from?.first_name,
              groupUrl: options.groupUrl,
            })
          : buildTelegramHelpMessage({ groupUrl: options.groupUrl }),
    };
  }

  const threadId = message.message_thread_id;
  if (!threadId) return null;

  if (threadId === normalizeThreadId(options.suggestionsThreadId)) {
    return {
      chatId: String(message.chat.id),
      threadId,
      replyToMessageId: message.message_id,
      text: buildTelegramSuggestionAck({ firstName: message.from?.first_name }),
    };
  }

  if (threadId === normalizeThreadId(options.requestThreadId)) {
    return {
      chatId: String(message.chat.id),
      threadId,
      replyToMessageId: message.message_id,
      text: buildTelegramRequestAck({ firstName: message.from?.first_name }),
    };
  }

  return null;
}
