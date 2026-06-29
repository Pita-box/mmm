/**
 * Proxy resumable chunku na Google Drive (plán 012). Browser nemůže PUT přímo
 * na `googleapis.com/upload` (CORS → „Failed to fetch"), takže chunk pošle sem
 * a server ho přepošle na session URL. Bajty jdou přes server jen po chunku
 * (8 MB), ne celý soubor v paměti.
 *
 * ponytail: proxy obchází CORS; pro extrémně velká videa je úspornější ingest
 * z Drive složky („Synchronizovat z Drive"). SSRF guard: cíl musí být Google
 * upload endpoint. Jen uploadeři (Admin/Distributor).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionPrincipalReadOnly } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIX = "https://www.googleapis.com/upload/";

/** Strop těla: chunk je 8 MB (resumable-upload), necháme rezervu na 16 MB. */
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;

export async function PUT(request: NextRequest): Promise<Response> {
  const principal = await getSessionPrincipalReadOnly();
  if (principal === null || (principal.role !== "Admin" && principal.role !== "Distributor")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const uploadUrl = request.headers.get("x-upload-url") ?? "";
  const range = request.headers.get("x-content-range") ?? "";
  // SSRF guard: přeposíláme jen na Google resumable upload endpoint.
  if (!uploadUrl.startsWith(ALLOWED_PREFIX)) {
    return NextResponse.json({ error: "bad_upload_url" }, { status: 400 });
  }

  // Strop velikosti: nejdřív dle hlavičky (ať se obří tělo nebufferuje), pak
  // ověř skutečnou délku (hlavičku lze podvrhnout). Pořadí: auth → SSRF → velikost.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: range ? { "Content-Range": range } : {},
      body,
      redirect: "manual", // 308 = resume incomplete (nepřesměrovávat)
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // 308 = pokračuj dalším chunkem; 200/201 = hotovo (vrací file id).
  if (res.status === 308) {
    return NextResponse.json({ done: false });
  }
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return NextResponse.json({ done: true, id: data.id ?? "" });
  }
  return NextResponse.json({ error: `drive_${res.status}` }, { status: 502 });
}
