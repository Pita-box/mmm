import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Handler testy náhledové proxy (plán 010). Stejná obrana jako stream route:
 * 401 bez relace, 403 cizí token, 410/401 vadný token, 404 neschválené médium,
 * 200 happy path s image/* a bez úniku driveFileId. (R6.1/6.2/6.4)
 */
import { ok, err, type Result } from "@/lib/result";
import type { DriveError } from "@/lib/errors";

const h = vi.hoisted(() => ({
  principal: null as { userId: string; sessionId: string } | null,
  verify: null as unknown as Result<{ mediaId: string; userId: string; exp: number }, DriveError>,
  media: null as { id: string; driveFileId: string; status: string; publishAt: Date | null; mimeType: string } | null,
  optimizeImage: vi.fn(async () => Buffer.from("optimized")),
}));

vi.mock("@/lib/session", () => ({
  getSessionPrincipalReadOnly: async () => h.principal,
}));
vi.mock("@/lib/drive", () => ({
  getDriveConnector: () => ({ verifyStreamingToken: () => h.verify }),
  driveStorage: {
    getThumbnail: async () =>
      ok({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
        contentType: "image/jpeg",
      }),
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { mediaItem: { findUnique: async () => h.media } },
}));
vi.mock("next/dist/server/image-optimizer", () => ({
  optimizeImage: h.optimizeImage,
}));

import { GET } from "./route";

const ctx = (token = "payload.sig") => ({ params: Promise.resolve({ token }) });
const req = {} as NextRequest;
const APPROVED = {
  id: "m1",
  driveFileId: "DRIVE_SECRET_FILE_ID",
  status: "published",
  publishAt: new Date(Date.now() - 1000),
  mimeType: "video/mp4",
};

beforeEach(() => {
  h.principal = { userId: "u1", sessionId: "s1" };
  h.verify = ok({ mediaId: "m1", userId: "u1", exp: Math.floor(Date.now() / 1000) + 100 });
  h.media = { ...APPROVED };
});

describe("GET /api/thumb/[token]", () => {
  it("401 bez přihlášené relace", async () => {
    h.principal = null;
    expect((await GET(req, ctx())).status).toBe(401);
  });

  it("403 když token patří jinému uživateli", async () => {
    h.verify = ok({ mediaId: "m1", userId: "someone-else", exp: Math.floor(Date.now() / 1000) + 100 });
    expect((await GET(req, ctx())).status).toBe(403);
  });

  it("410 pro vypršelý token", async () => {
    h.verify = err({ code: "token_expired", message: "exp" });
    expect((await GET(req, ctx())).status).toBe(410);
  });

  it("404 pro neschválené médium", async () => {
    h.media = { ...APPROVED, status: "hidden" };
    expect((await GET(req, ctx())).status).toBe(404);
  });

  it("200 happy path: vrátí image/* a nikdy neodhalí driveFileId", async () => {
    const res = await GET(req, ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^image\//);
    expect(JSON.stringify([...res.headers])).not.toContain(APPROVED.driveFileId);
  });

  it("u fotky preferuje modernější výstupní formát", async () => {
    h.media = { ...APPROVED, mimeType: "image/jpeg" };
    const res = await GET({ headers: new Headers({ accept: "image/avif,image/webp" }) } as NextRequest, ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/avif");
    expect(h.optimizeImage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/avif", width: 1024 }),
    );
  });
});
