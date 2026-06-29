import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Handler testy proxy resumable chunku (plán 012/013). Ověřuje obranu:
 * 403 ne-uploader, 400 SSRF guard (cizí cíl), 413 příliš velké tělo,
 * 308 → {done:false}, 200 → {done:true,id}. `fetch` na Google je mockovaný.
 */
const h = vi.hoisted(() => ({
  principal: null as { userId: string; sessionId: string; role: string } | null,
}));

vi.mock("@/lib/session", () => ({
  getSessionPrincipalReadOnly: async () => h.principal,
}));

import { PUT } from "./route";

const GOOGLE = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=X";

/** Fake NextRequest: jen headers.get + arrayBuffer (route víc nepotřebuje). */
function req(
  headers: Record<string, string>,
  bytes = new Uint8Array(8),
): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () => bytes.buffer,
  } as unknown as NextRequest;
}

beforeEach(() => {
  h.principal = { userId: "u1", sessionId: "s1", role: "Distributor" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PUT /api/drive-chunk", () => {
  it("403 bez uploader role", async () => {
    h.principal = { userId: "u1", sessionId: "s1", role: "User" };
    const res = await PUT(req({ "x-upload-url": GOOGLE }));
    expect(res.status).toBe(403);
  });

  it("403 bez přihlášení", async () => {
    h.principal = null;
    expect((await PUT(req({ "x-upload-url": GOOGLE }))).status).toBe(403);
  });

  it("400 když cíl není Google upload endpoint (SSRF guard)", async () => {
    const res = await PUT(req({ "x-upload-url": "https://evil.example.com/steal" }));
    expect(res.status).toBe(400);
  });

  it("413 když je tělo příliš velké (dle content-length)", async () => {
    const res = await PUT(
      req({ "x-upload-url": GOOGLE, "content-length": String(17 * 1024 * 1024) }),
    );
    expect(res.status).toBe(413);
  });

  it("308 → { done: false } (pokračuj dalším chunkem)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 308, ok: false }) as Response));
    const res = await PUT(req({ "x-upload-url": GOOGLE, "x-content-range": "bytes 0-7/16" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: false });
  });

  it("200 → { done: true, id } (hotovo)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ id: "FILE_ID" }) }) as unknown as Response),
    );
    const res = await PUT(req({ "x-upload-url": GOOGLE, "x-content-range": "bytes 0-7/8" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: true, id: "FILE_ID" });
  });
});
