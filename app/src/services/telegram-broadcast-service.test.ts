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
    ).toBe("Alice\nNew photo");
  });

  it("falls back to a generic label", () => {
    expect(buildTelegramUploadCaption({ mimeType: "video/mp4" })).toBe("New video");
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
      createResumableSession: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as DriveStorage;

    const fetchFn: typeof fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const body = await readBody(init?.body);
      expect(body).toContain('name="chat_id"');
      expect(body).toContain("-100123");
      expect(body).toContain('name="caption"');
      expect(body).toContain("Alice\nNew photo");
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
      caption: "Alice\nNew photo",
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
});
