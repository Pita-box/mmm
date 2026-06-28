import { describe, it, expect } from "vitest";
import type { PrismaClient, MediaItem } from "@prisma/client";
import { createMediaService } from "./media-service";
import { isOk } from "@/lib/result";
import type { DriveFileMeta } from "@/services/drive-connector";

/**
 * Unit testy `importFromDrive` (plán 007 — ingest z Drive složky):
 *  - importuje jen podporované typy (foto/video), ostatní (složky/PDF) přeskočí,
 *  - založí média jako `hidden`, bez modelu, width/height 0,
 *  - duplicity dle `driveFileId` přeskočí (skipDuplicates / @unique).
 *
 * In-memory fake PrismaClient implementuje jen `mediaItem.createMany` se
 * `skipDuplicates` (dedup dle `driveFileId`) — jediná metoda, kterou import volá.
 */
class FakePrisma {
  private readonly byDriveFileId = new Map<string, MediaItem>();
  /** Záznamy vložené v rámci createMany — pro asserty. */
  readonly inserted: Array<Record<string, unknown>> = [];

  seedDriveFileId(driveFileId: string): void {
    this.byDriveFileId.set(driveFileId, { driveFileId } as MediaItem);
  }

  readonly mediaItem = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: Array<Record<string, unknown>>;
      skipDuplicates?: boolean;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of data) {
        const key = String(row.driveFileId);
        if (skipDuplicates && this.byDriveFileId.has(key)) continue;
        this.byDriveFileId.set(key, row as unknown as MediaItem);
        this.inserted.push(row);
        count += 1;
      }
      return { count };
    },

    deleteMany: async ({
      where,
    }: {
      where: { driveFileId: { notIn: string[] } };
    }): Promise<{ count: number }> => {
      const keep = new Set(where.driveFileId.notIn);
      let count = 0;
      for (const key of [...this.byDriveFileId.keys()]) {
        if (!keep.has(key)) {
          this.byDriveFileId.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };
}

function makeService() {
  const prisma = new FakePrisma();
  const svc = createMediaService(prisma as unknown as PrismaClient);
  return { prisma, svc };
}

function file(over: Partial<DriveFileMeta> & { driveFileId: string }): DriveFileMeta {
  return {
    driveFileId: over.driveFileId,
    name: over.name ?? `${over.driveFileId}.mp4`,
    mimeType: over.mimeType ?? "video/mp4",
    sizeBytes: over.sizeBytes ?? 1234,
  };
}

describe("importFromDrive (plán 007)", () => {
  it("importuje jen podporované typy a přeskočí ostatní", async () => {
    const { prisma, svc } = makeService();
    const files: DriveFileMeta[] = [
      file({ driveFileId: "a", mimeType: "video/mp4" }),
      file({ driveFileId: "b", mimeType: "image/jpeg" }),
      file({ driveFileId: "c", mimeType: "application/vnd.google-apps.folder" }), // složka
      file({ driveFileId: "d", mimeType: "application/pdf" }), // nepodporováno
    ];

    const res = await svc.importFromDrive(files, "uploader-1");

    expect(isOk(res)).toBe(true);
    if (!isOk(res)) throw new Error("expected ok");
    expect(res.value.imported).toBe(2);
    expect(res.value.skipped).toBe(2);
    expect(prisma.inserted.map((r) => r.driveFileId).sort()).toEqual(["a", "b"]);
  });

  it("zakládá média jako published (viditelná), bez modelu, width/height 0, s uploaderId", async () => {
    const { prisma, svc } = makeService();
    await svc.importFromDrive([file({ driveFileId: "a" })], "uploader-1");

    const row = prisma.inserted[0]!;
    expect(row.status).toBe("published");
    expect(row.publishAt).toBeInstanceOf(Date);
    expect(row.modelId).toBeNull();
    expect(row.width).toBe(0);
    expect(row.height).toBe(0);
    expect(row.uploaderId).toBe("uploader-1");
    expect(row.mediaType).toBe("video");
  });

  it("přeskočí duplicitní driveFileId (skipDuplicates / @unique)", async () => {
    const { prisma, svc } = makeService();
    prisma.seedDriveFileId("a"); // už importováno dříve

    const res = await svc.importFromDrive(
      [file({ driveFileId: "a" }), file({ driveFileId: "b" })],
      null,
    );

    expect(isOk(res)).toBe(true);
    if (!isOk(res)) throw new Error("expected ok");
    expect(res.value.imported).toBe(1); // jen "b"
    expect(res.value.skipped).toBe(1); // "a" duplicitní
  });
});

describe("removeMissing — sync mazání (plán 007)", () => {
  it("smaže média, jejichž driveFileId není v Drive množině", async () => {
    const { prisma, svc } = makeService();
    prisma.seedDriveFileId("a");
    prisma.seedDriveFileId("b");
    prisma.seedDriveFileId("c");

    // Drive obsahuje jen a, c → b se smaže.
    const res = await svc.removeMissing(["a", "c"]);

    expect(isOk(res)).toBe(true);
    if (!isOk(res)) throw new Error("expected ok");
    expect(res.value.removed).toBe(1);
  });

  it("prázdná Drive množina = no-op (pojistka proti hromadnému smazání)", async () => {
    const { prisma, svc } = makeService();
    prisma.seedDriveFileId("a");
    prisma.seedDriveFileId("b");

    const res = await svc.removeMissing([]);

    expect(isOk(res)).toBe(true);
    if (!isOk(res)) throw new Error("expected ok");
    expect(res.value.removed).toBe(0);
  });
});
