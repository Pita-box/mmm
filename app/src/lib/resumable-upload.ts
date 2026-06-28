/**
 * Klientský resumable upload na Google Drive (plán 007 B / 012). Chunky jdou
 * přes vlastní proxy `/api/drive-chunk` (browser nemůže PUT přímo na Google —
 * CORS). Proxy vrací `{ done, id }`. Bajty serverem jen po chunku (8 MB).
 */

/** Velikost chunku — násobek 256 KB dle Drive protokolu. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export async function uploadResumable(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  let offset = 0;
  let fileId = "";
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
    const res = await fetch("/api/drive-chunk", {
      method: "PUT",
      headers: {
        "x-upload-url": uploadUrl,
        "x-content-range": `bytes ${offset}-${end - 1}/${file.size}`,
      },
      body: file.slice(offset, end),
    });
    if (!res.ok) {
      throw new Error(`Nahrávání selhalo (HTTP ${res.status}).`);
    }
    const data = (await res.json().catch(() => ({}))) as { done?: boolean; id?: string };
    if (data.done) {
      fileId = data.id ?? "";
      offset = file.size;
    } else {
      offset = end;
    }
    onProgress(Math.round((end / file.size) * 100));
  }
  if (!fileId) throw new Error("Drive nevrátil ID souboru.");
  return fileId;
}
