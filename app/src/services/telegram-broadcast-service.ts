/**
 * Telegram broadcast service — pošle nově vytvořené foto/video do Telegram
 * skupiny přes Bot API. Využívá stávající `DriveStorage.streamFile`, takže
 * soubor nemusí být veřejně přístupný a netaháme ho celý do paměti.
 */
import type { DriveStorage } from "./drive-connector";
import { classifyType } from "./media-service";
import { ok, err, type Result } from "@/lib/result";

export type TelegramBroadcastError =
  | { readonly code: "destination_unavailable"; readonly message: string }
  | { readonly code: "unsupported_format"; readonly message: string }
  | { readonly code: "send_failed"; readonly message: string };

export interface TelegramBroadcastConfig {
  readonly botToken?: string | null;
  readonly chatId?: string | null;
}

export interface TelegramBroadcastInput {
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly caption?: string | null;
  readonly fileName?: string | null;
}

type TelegramMediaKind = "photo" | "video";

function telegramMediaKindForMimeType(mimeType: string): TelegramMediaKind | null {
  const mediaType = classifyType(mimeType);
  if (mediaType === "photo") return "photo";
  if (mediaType === "video") return "video";
  return null;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}

function generatorToStream(
  generator: AsyncGenerator<Uint8Array>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await generator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      if (typeof generator.return === "function") await generator.return(undefined);
    },
  });
}

export function buildTelegramUploadCaption(args: {
  readonly mimeType: string;
  readonly modelName?: string | null;
}): string {
  const label = classifyType(args.mimeType) === "video" ? "New video" : "New photo";
  const model = typeof args.modelName === "string" ? args.modelName.trim() : "";
  return model.length > 0 ? `${model}\n${label}` : label;
}

export function createTelegramBroadcastService(deps: {
  readonly storage: DriveStorage;
  readonly config: TelegramBroadcastConfig;
  readonly fetchFn?: typeof fetch;
}) {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async sendMedia(
      input: TelegramBroadcastInput,
    ): Promise<Result<void, TelegramBroadcastError>> {
      const botToken = deps.config.botToken?.trim();
      const chatId = deps.config.chatId?.trim();
      if (!botToken || !chatId) {
        return err({
          code: "destination_unavailable",
          message: "Telegram bot token nebo chat ID není nastavený.",
        });
      }

      const kind = telegramMediaKindForMimeType(input.mimeType);
      if (!kind) {
        return err({
          code: "unsupported_format",
          message: `Telegram broadcast nepodporuje MIME typ ${input.mimeType}.`,
        });
      }

      const streamed = await deps.storage.streamFile(input.driveFileId);
      if (!streamed.ok) {
        return err({
          code: "send_failed",
          message: streamed.error.message,
        });
      }
      const streamResult = streamed.value;
      const resolvedChatId = chatId;

      const boundary = `mmmred-telegram-${Math.random().toString(16).slice(2)}`;
      const endpoint = `https://api.telegram.org/bot${botToken}/${kind === "photo" ? "sendPhoto" : "sendVideo"}`;
      const fileName =
        input.fileName?.trim() ||
        `${kind}-${input.driveFileId}.${extensionForMimeType(input.mimeType)}`;
      const caption = input.caption?.trim();

      async function* multipartBody(): AsyncGenerator<Uint8Array> {
        const encoder = new TextEncoder();
        const write = (chunk: string) => encoder.encode(chunk);
        const textField = (name: string, value: string) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

        yield write(textField("chat_id", resolvedChatId));
        if (caption) yield write(textField("caption", caption.slice(0, 1024)));
        if (kind === "video") yield write(textField("supports_streaming", "true"));
        yield write(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${kind}"; filename="${fileName}"\r\n` +
            `Content-Type: ${input.mimeType}\r\n\r\n`,
        );
        const reader = streamResult.body.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            if (next.value) yield next.value;
          }
        } finally {
          reader.releaseLock();
        }
        yield write(`\r\n--${boundary}--\r\n`);
      }

      const res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        body: generatorToStream(multipartBody()),
        duplex: "half",
      } as RequestInit & { duplex: "half" });

      if (!res.ok) {
        const details = (await res.text()).trim();
        return err({
          code: "send_failed",
          message: details.length > 0
            ? `Telegram API vrátil HTTP ${res.status}: ${details}`
            : `Telegram API vrátil HTTP ${res.status}.`,
        });
      }

      return ok();
    },
  };
}
