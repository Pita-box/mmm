import { describe, it, expect } from "vitest";
import { isOk, isErr } from "@/lib/result";
import {
  STREAMING_TOKEN_TTL_SECONDS,
  DRIVE_DOMAINS,
  issueStreamingToken,
  verifyStreamingToken,
  signStreamingToken,
  toPublicMedia,
  createDriveConnector,
  createStubDriveStorage,
  type MediaItemRecord,
} from "./drive-connector";

const SECRET = "test-streaming-secret";

function at(seconds: number): Date {
  return new Date(seconds * 1000);
}

const sampleMedia: MediaItemRecord = {
  id: "media-1",
  modelId: "model-1",
  driveFileId: "1AbCDriveFileId_secret",
  mediaType: "photo",
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  status: "published",
  publishAt: at(1000),
  width: 800,
  height: 600,
  createdAt: at(900),
};

describe("issueStreamingToken", () => {
  it("vydá token pro autorizovaný požadavek s exp = now + 300 s", () => {
    const now = at(1_000_000);
    const result = issueStreamingToken({ mediaId: "media-1", userId: "user-1", now }, SECRET);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const verified = verifyStreamingToken(result.value, now, SECRET);
    expect(isOk(verified)).toBe(true);
    if (!isOk(verified)) return;
    expect(verified.value.mediaId).toBe("media-1");
    expect(verified.value.userId).toBe("user-1");
    expect(verified.value.exp).toBe(1_000_000 + STREAMING_TOKEN_TTL_SECONDS);
  });

  it("token nikdy nevyprší později než za 300 s", () => {
    const now = at(42);
    const result = issueStreamingToken({ mediaId: "m", userId: "u", now }, SECRET);
    if (!isOk(result)) throw new Error("expected token");
    const verified = verifyStreamingToken(result.value, now, SECRET);
    if (!isOk(verified)) throw new Error("expected valid");
    expect(verified.value.exp).toBeLessThanOrEqual(42 + STREAMING_TOKEN_TTL_SECONDS);
  });

  it("neautorizovaný požadavek (chybějící userId) nevygeneruje token", () => {
    const now = at(1_000_000);
    for (const userId of [undefined, null, "", "   "]) {
      const result = issueStreamingToken({ mediaId: "media-1", userId, now }, SECRET);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe("unauthorized");
    }
  });
});

describe("verifyStreamingToken", () => {
  it("uspěje právě když now <= exp", () => {
    const issuedAt = at(1_000_000);
    const result = issueStreamingToken({ mediaId: "m", userId: "u", now: issuedAt }, SECRET);
    if (!isOk(result)) throw new Error("expected token");
    const token = result.value;
    const exp = 1_000_000 + STREAMING_TOKEN_TTL_SECONDS;

    // přesně v okamžiku vypršení (now == exp) → stále platný
    expect(isOk(verifyStreamingToken(token, at(exp), SECRET))).toBe(true);
    // o sekundu později → vypršelo
    const expired = verifyStreamingToken(token, at(exp + 1), SECRET);
    expect(isErr(expired)).toBe(true);
    if (isErr(expired)) expect(expired.error.code).toBe("token_expired");
  });

  it("odmítne podvržený / poškozený token", () => {
    const now = at(1_000_000);
    const result = issueStreamingToken({ mediaId: "m", userId: "u", now }, SECRET);
    if (!isOk(result)) throw new Error("expected token");

    const tampered = result.value.slice(0, -1) + (result.value.endsWith("A") ? "B" : "A");
    const bad = verifyStreamingToken(tampered, now, SECRET);
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) expect(bad.error.code).toBe("token_invalid");

    expect(isErr(verifyStreamingToken("garbage", now, SECRET))).toBe(true);
    expect(isErr(verifyStreamingToken("a.b.c", now, SECRET))).toBe(true);
  });

  it("odmítne token podepsaný jiným klíčem", () => {
    const now = at(1_000_000);
    const token = signStreamingToken({ mediaId: "m", userId: "u", exp: 1_000_300 }, "other-secret");
    const result = verifyStreamingToken(token, now, SECRET);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("token_invalid");
  });
});

describe("toPublicMedia", () => {
  it("vynechá driveFileId", () => {
    const pub = toPublicMedia(sampleMedia);
    expect("driveFileId" in pub).toBe(false);
    expect(JSON.stringify(pub)).not.toContain(sampleMedia.driveFileId);
  });

  it("neobsahuje žádnou doménu Google Drive", () => {
    const serialized = JSON.stringify(toPublicMedia(sampleMedia)).toLowerCase();
    for (const domain of DRIVE_DOMAINS) {
      expect(serialized).not.toContain(domain.toLowerCase());
    }
  });

  it("zachová ostatní zobrazitelná pole", () => {
    const pub = toPublicMedia(sampleMedia);
    expect(pub).toMatchObject({
      id: "media-1",
      modelId: "model-1",
      mediaType: "photo",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      status: "published",
    });
  });
});

describe("createDriveConnector", () => {
  it("selže fail-fast bez tajného klíče", () => {
    expect(() => createDriveConnector({ secret: "" })).toThrow();
  });

  it("round-trip vydání a ověření tokenu přes connector", () => {
    const connector = createDriveConnector({ secret: SECRET });
    const now = at(1_000_000);
    const issued = connector.issueStreamingToken({ mediaId: "media-9", userId: "u", now });
    if (!isOk(issued)) throw new Error("expected token");
    const verified = connector.verifyStreamingToken(issued.value, now);
    if (!isOk(verified)) throw new Error("expected valid");
    expect(verified.value.mediaId).toBe("media-9");
  });

  it("stub úložiště vrací chybu místo trvalého odkazu", async () => {
    const connector = createDriveConnector({ secret: SECRET, storage: createStubDriveStorage() });
    const stream = await connector.streamFile("drive-file-id");
    expect(isErr(stream)).toBe(true);
  });
});
