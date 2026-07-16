import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/result";
import type { DriveStorage } from "./drive-connector";
import {
  buildTelegramUploadCaption,
  createTelegramBroadcastService,
} from "./telegram-broadcast-service";

function makeBody(bytes: readonly number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

async function readBody(body: unknown): Promise<string> {
  const parts: Buffer[] = [];
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        parts.push(Buffer.from(next.value));
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      parts.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }
  }
  return Buffer.concat(parts).toString("utf8");
}

describe("buildTelegramUploadCaption", () => {
  it("uses model name when available", () => {
    expect(
      buildTelegramUploadCaption({ mimeType: "image/jpeg", modelName: "Alice" }),
    ).toBe("Model: Alice");
  });

  it("without model returns empty caption", () => {
    expect(buildTelegramUploadCaption({ mimeType: "video/mp4" })).toBe("");
  });
});

describe("createTelegramBroadcastService", () => {
  it("sends photos to sendPhoto with multipart form-data", async () => {
    const storage: DriveStorage = {
      authenticate: vi.fn(),
      upload: vi.fn(),
      streamFile: vi.fn().mockResolvedValue(
        ok({
          body: makeBody([1, 2, 3]),
          status: 200,
        }),
      ),
      getThumbnail: vi.fn(),
      listFiles: vi.fn(),
      listFilesRecursive: vi.fn(),
      ensureFolder: vi.fn(),
      moveFileToFolder: vi.fn(),
      createResumableSession: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as DriveStorage;

    const fetchFn: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const body = await readBody(init?.body);
      expect(body).toContain('name="chat_id"');
      expect(body).toContain("-100123");
      expect(body).toContain('name="caption"');
      expect(body).toContain("Model: Alice");
      expect(body).toContain('name="photo"; filename="photo-file.jpg"');
      return new Response("ok", { status: 200 });
    });

    const service = createTelegramBroadcastService({
      storage,
      config: { botToken: "bot-token", chatId: "-100123" },
      fetchFn,
    });

    const result = await service.sendMedia({
      driveFileId: "drive-1",
      mimeType: "image/jpeg",
      caption: "Model: Alice",
      fileName: "photo-file.jpg",
    });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendPhoto",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends videos to sendVideo and includes supports_streaming", async () => {
    const storage: DriveStorage = {
      authenticate: vi.fn(),
      upload: vi.fn(),
      streamFile: vi.fn().mockResolvedValue(
        ok({
          body: makeBody([4, 5, 6]),
          status: 200,
        }),
      ),
      getThumbnail: vi.fn(),
      listFiles: vi.fn(),
      listFilesRecursive: vi.fn(),
      ensureFolder: vi.fn(),
      moveFileToFolder: vi.fn(),
      createResumableSession: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as DriveStorage;

    const fetchFn: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const body = await readBody(init?.body);
      expect(body).toContain('name="supports_streaming"');
      expect(body).toContain("true");
      expect(body).toContain('name="video"; filename="clip.mp4"');
      return new Response("ok", { status: 200 });
    });

    const service = createTelegramBroadcastService({
      storage,
      config: { botToken: "bot-token", chatId: "-100123" },
      fetchFn,
    });

    const result = await service.sendMedia({
      driveFileId: "drive-2",
      mimeType: "video/mp4",
      fileName: "clip.mp4",
    });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendVideo",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends text messages without drive storage", async () => {
    const fetchFn: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          chat_id: "-100123",
          text: "Hello",
          message_thread_id: 77,
        }),
      );
      return new Response("ok", { status: 200 });
    });

    const service = createTelegramBroadcastService({
      config: { botToken: "bot-token", chatId: "-100123", defaultThreadId: 77 },
      fetchFn,
    });

    const result = await service.sendMessage({
      chatId: "-100123",
      text: "Hello",
      threadId: 77,
    });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("adds an inline URL button when requested", async () => {
    const fetchFn: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          chat_id: "123",
          text: "Welcome",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔥 Join group", url: "https://t.me/+nKmAUZEMd9lkZTk8" },
            ]],
          },
        }),
      );
      return new Response("ok", { status: 200 });
    });

    const service = createTelegramBroadcastService({
      config: { botToken: "bot-token" },
      fetchFn,
    });

    const result = await service.sendMessage({
      chatId: 123,
      text: "Welcome",
      inlineButton: {
        text: "🔥 Join group",
        url: "https://t.me/+nKmAUZEMd9lkZTk8",
      },
    });

    expect(result.ok).toBe(true);
  });

  it("retries text message without thread when Telegram rejects the topic", async () => {
    const fetchFn: typeof fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("Bad Request: message thread not found", { status: 400 }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const service = createTelegramBroadcastService({
      config: { botToken: "bot-token", chatId: "-100123", defaultThreadId: 77 },
      fetchFn,
    });

    const result = await service.sendMessage({
      chatId: "-100123",
      text: "Hello",
      threadId: 77,
    });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: "-100123",
          text: "Hello",
          message_thread_id: 77,
        }),
      }),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: "-100123",
          text: "Hello",
        }),
      }),
    );
  });
});
