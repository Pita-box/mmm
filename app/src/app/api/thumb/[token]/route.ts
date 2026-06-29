/**
 * Náhledová proxy (plán 010, R6.1/R6.3/R6.4/R6.5).
 *
 * Stejná ochrana jako streamovací proxy (`/api/stream/[token]`), ale místo
 * celého souboru vrací malý Drive náhled (`thumbnailLink`). Karty a Hero tak
 * mají skutečný náhled (i u videí) a netahají celý soubor. `driveFileId` ani
 * googleusercontent/Drive doména se nikdy nepošlou klientovi (R6.4).
 *
 * POZOR: middleware matcher vylučuje cesty s tečkou (token = `payload.signature`)
 * → route si vynucuje vlastní obranu: přihlášená relace (read-only, bez posunu
 * lastActivityAt — plán 009), token vázaný na uživatele a jen Approved_Media.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isErr } from "@/lib/result";
import { getDriveConnector, driveStorage } from "@/lib/drive";
import { getSessionPrincipalReadOnly } from "@/lib/session";
import { isApproved } from "@/services/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  // Hot path (mřížka karet) → relaci jen ověříme bez zápisu (plán 009).
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
  if (media === null || !isApproved(media, new Date())) {
    return NextResponse.json(
      { error: "not_found", message: "Médium nebylo nalezeno." },
      { status: 404 },
    );
  }

  // Video s vlastním posterem (snímek z 1/3 délky): servíruj přímo ten malý
  // obrázek místo Drive náhledu (Drive u videí náhled občas nevygeneruje).
  if (media.mediaType === "video" && media.posterDriveFileId) {
    const poster = await driveStorage.streamFile(media.posterDriveFileId);
    if (!isErr(poster)) {
      return new NextResponse(poster.value.body, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    // Selhání → spadni na Drive náhled níže.
  }

  // Náhled se vyzvedne server-side; klient dostane jen obrázkové bajty (R6.4).
  // Velikost dle DPR: ne-retina (dpr=1) → menší (úspora), jinak retina 1024.
  const maxSize = request.nextUrl?.searchParams?.get("dpr") === "1" ? 512 : 1024;
  const thumb = await driveStorage.getThumbnail(media.driveFileId, maxSize);
  if (isErr(thumb)) {
    const status = thumb.error.code === "not_found" ? 404 : 502;
    return NextResponse.json(
      { error: thumb.error.code, message: thumb.error.message },
      { status },
    );
  }

  return new NextResponse(thumb.value.body, {
    status: 200,
    headers: {
      "Content-Type": thumb.value.contentType,
      // Náhledy se nemění; krátká privátní cache sníží zátěž. Token má ≤300 s
      // platnost (R6.1), takže cache neobchází autorizaci.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
