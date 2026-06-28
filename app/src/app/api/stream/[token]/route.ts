/**
 * Streamovací proxy (task 21.2, R6.1/R6.3/R6.4/R6.5).
 *
 * Ověří krátkodobý podepsaný token (`verifyStreamingToken`), dohledá Media_Item
 * a streamuje jeho bajty přes Service Account (`DriveStorage.streamFile`).
 * `driveFileId` se nikdy neodešle klientovi — slouží jen interně k vyzvednutí
 * obsahu. Vypršelý token → 410, neplatný → 401, neznámé médium → 404.
 *
 * POZOR: middleware matcher vylučuje cesty s tečkou (token = `payload.signature`
 * tečku obsahuje), takže Edge auth tuto route NEhlídá. Route si proto vynucuje
 * vlastní obranu: vyžaduje přihlášenou relaci, ověří, že token patří TOMUTO
 * uživateli (`userId`), a streamuje jen Approved_Media (plán 003).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { getDriveConnector, driveStorage } from "@/lib/drive";
import { getSessionPrincipalReadOnly } from "@/lib/session";
import { isApproved } from "@/services/media-service";

// Prisma a node:crypto (podpis tokenu) vyžadují Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  // Edge middleware tuto route nehlídá (token obsahuje tečku) → kontrola zde.
  // Read-only: stream je hot path (Range = mnoho requestů), relaci jen ověříme
  // bez posunu lastActivityAt (plán 009 — write-amplifikace).
  const principal = await getSessionPrincipalReadOnly();
  if (principal === null) {
    return NextResponse.json(
      { error: "unauthorized", message: "Přihlášení vyžadováno." },
      { status: 401 },
    );
  }

  const { token } = await context.params;

  const verified = getDriveConnector().verifyStreamingToken(
    decodeURIComponent(token),
    new Date(),
  );
  if (isErr(verified)) {
    // Vypršelá platnost → 410 Gone; jinak neplatný token → 401.
    const status = verified.error.code === "token_expired" ? 410 : 401;
    return NextResponse.json(
      { error: verified.error.code, message: verified.error.message },
      { status },
    );
  }

  // Token musí být vydán právě tomuto uživateli (není přenosný, plán 003).
  if (verified.value.userId !== principal.userId) {
    return NextResponse.json(
      { error: "forbidden", message: "Token nepatří tomuto uživateli." },
      { status: 403 },
    );
  }

  const media = await prisma.mediaItem.findUnique({
    where: { id: verified.value.mediaId },
  });
  // Neznámé i neschválené médium (skryté/naplánované) → 404 (neprozrazujeme stav).
  if (media === null || !isApproved(media, new Date())) {
    return NextResponse.json(
      { error: "not_found", message: "Médium nebylo nalezeno." },
      { status: 404 },
    );
  }

  // driveFileId zůstává na serveru; klient dostane jen proudící bajty (R6.4).
  // Range hlavička se propíše do Drive → 206 + Content-Range (seek ve videu).
  const range = request.headers?.get("range") ?? undefined;
  const stream = await driveStorage.streamFile(media.driveFileId, range);
  if (isErr(stream)) {
    return NextResponse.json(
      { error: stream.error.code, message: stream.error.message },
      { status: 502 },
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": media.mimeType,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  if (stream.value.contentLength) headers["Content-Length"] = stream.value.contentLength;
  if (stream.value.contentRange) headers["Content-Range"] = stream.value.contentRange;

  return new NextResponse(stream.value.body, {
    status: stream.value.status,
    headers,
  });
}
