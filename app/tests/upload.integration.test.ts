import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integrační testy uploadu média (plán 004, R5.1/R5.4/R5.6).
 *
 * `uploadMediaAction` vytvoří Media_Item + štítky v jedné `prisma.$transaction`.
 * Selže-li cokoli (Drive upload, perzistence, NEBO chyba štítku), nesmí vzniknout
 * osiřelý Media_Item ani osiřelý soubor na Drive. Mockují se jen hranice
 * (Drive úložiště, Prisma, session, revalidace); orchestrace akce běží nezfalšovaná.
 */
import type { Result } from "@/lib/result";
import type { DriveError } from "@/lib/errors";

const h = vi.hoisted(() => ({
  drive: {
    uploadResult: null as unknown as Result<{ driveFileId: string }, DriveError>,
    deleteCalls: [] as string[],
  },
  db: {
    created: [] as Array<Record<string, unknown> & { id: string }>,
    failCreate: false,
    seq: 0,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", role: "Admin" })),
  requireUploader: vi.fn(async () => ({ userId: "admin-1", role: "Admin" })),
}));
vi.mock("@/lib/drive", () => ({
  driveStorage: {
    authenticate: async () => ({ ok: true, value: undefined }),
    upload: async () => h.drive.uploadResult,
    streamFile: async () => ({ ok: false, error: { code: "auth_failed", message: "stub" } }),
    deleteFile: async (driveFileId: string) => {
      h.drive.deleteCalls.push(driveFileId);
      return { ok: true, value: undefined };
    },
  },
}));

// Tx-aware fake Prisma: $transaction(fn) spustí fn a při výjimce zahodí zápisy
// (rollback) — modeluje atomicitu, na které plán 004 stojí.
vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    mediaItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (h.db.failCreate) throw new Error("db unavailable");
        const id = `media-${++h.db.seq}`;
        const row = { id, createdAt: new Date(), ...data };
        h.db.created.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = h.db.created.length;
      try {
        return await fn(prisma);
      } catch (e) {
        h.db.created.length = snapshot; // rollback necommitnutých zápisů
        throw e;
      }
    },
  };
  return { prisma };
});

import { uploadMediaAction } from "@/app/(app)/admin/admin-actions";
import { ok, err } from "@/lib/result";

function fakeFile(): File {
  return {
    type: "image/jpeg",
    size: 1024,
    name: "photo.jpg",
    arrayBuffer: async () => new Uint8Array(8).buffer,
  } as unknown as File;
}

const baseInput = () => ({
  file: fakeFile(),
  modelId: "model-1",
  tags: {} as Record<string, string[]>,
  publishAt: null,
});

beforeEach(() => {
  h.drive.uploadResult = ok({ driveFileId: "drive-xyz" });
  h.drive.deleteCalls = [];
  h.db.created = [];
  h.db.failCreate = false;
  h.db.seq = 0;
});

describe("uploadMediaAction — úspěch (R5.1)", () => {
  it("nahraje soubor a vytvoří Media_Item s driveFileId", async () => {
    h.drive.uploadResult = ok({ driveFileId: "drive-success-1" });
    const result = await uploadMediaAction(baseInput());
    expect(result.ok).toBe(true);
    expect(h.db.created).toHaveLength(1);
    expect(h.db.created[0].driveFileId).toBe("drive-success-1");
    expect(h.db.created[0].status).toBe("published");
    expect(h.drive.deleteCalls).toEqual([]);
  });
});

describe("uploadMediaAction — selhání Drive (R5.4/5.6)", () => {
  it("auth failure → chyba, žádný Media_Item, není co rollbackovat", async () => {
    h.drive.uploadResult = err({ code: "auth_failed", message: "Autentizace selhala." });
    const result = await uploadMediaAction(baseInput());
    expect(result.ok).toBe(false);
    expect(h.db.created).toHaveLength(0);
    expect(h.drive.deleteCalls).toEqual([]);
  });

  it("timeout 120 s → chyba, žádný osiřelý záznam", async () => {
    h.drive.uploadResult = err({ code: "timeout", timeoutMs: 120_000, message: "Timeout 120 s." });
    const result = await uploadMediaAction(baseInput());
    expect(result.ok).toBe(false);
    expect(h.db.created).toHaveLength(0);
    expect(h.drive.deleteCalls).toEqual([]);
  });
});

describe("uploadMediaAction — rollback po úspěšném uploadu (R5.4)", () => {
  it("selhání perzistence → kompenzační smazání souboru, žádný osiřelý záznam", async () => {
    h.drive.uploadResult = ok({ driveFileId: "drive-orphan-1" });
    h.db.failCreate = true;
    const result = await uploadMediaAction(baseInput());
    expect(result.ok).toBe(false);
    expect(h.db.created).toHaveLength(0);
    expect(h.drive.deleteCalls).toEqual(["drive-orphan-1"]);
  });

  it("chyba štítku → transakce rollbackne Media_Item a smaže soubor (R7.2)", async () => {
    h.drive.uploadResult = ok({ driveFileId: "drive-orphan-2" });
    const input = {
      ...baseInput(),
      // Hodnota > 100 znaků → upsertValue vrátí validační chybu.
      tags: { Category: ["x".repeat(101)] },
    };
    const result = await uploadMediaAction(input);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy(); // chyba se vrací, ne polyká
    expect(h.db.created).toHaveLength(0); // žádný osiřelý Media_Item
    expect(h.drive.deleteCalls).toEqual(["drive-orphan-2"]);
  });
});
