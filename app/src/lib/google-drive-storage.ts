/**
 * Reálné úložiště Google Drive (plán 006) — implementace `DriveStorage`.
 *
 * Design note (rozhodnutí spike):
 * 1. **OAuth refresh token, ne Service Account.** `.env` má
 *    `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`. OAuth je tu levnější cesta (creds
 *    existují, není potřeba JSON klíč ani sdílení složky); design.md zmiňoval
 *    Service Account, ale realita prostředí je OAuth.
 *    **SCOPE (důležité):** pro ingest souborů nahraných ručně do Drive složky
 *    (plán 007 Approach A) NESTAČÍ `drive.file` — ten dává přístup jen k souborům,
 *    které vytvořila samotná appka. Aby `listFiles`/`streamFile` viděly i ručně
 *    nahrané soubory, je potřeba refresh token se scope
 *    `https://www.googleapis.com/auth/drive` (plný; umí list/read/upload/delete).
 *    `drive.readonly` stačí jen na čtení (ne na mazání/upload).
 * 2. **Streamování:** `files.get({alt:"media"}, {responseType:"stream"})` vrací
 *    Node `Readable`; převádíme na web `ReadableStream` přes `Readable.toWeb`
 *    (route ho předá do `NextResponse`). HTTP Range/seek = follow-up (viz níže).
 * 3. **Upload cíl:** soubory pod `GDRIVE_ROOT_FOLDER_ID`; limit 500 MB validuje
 *    volající (`validateUpload`) ještě před uploadem. Jméno = `meta.name`.
 * 4. **Timeout:** upload má `timeout: 120_000` ms → chyba mapovaná na `timeout`.
 *
 * Follow-ups (NEděláno): HTTP Range pro přetáčení videa, resumable upload velkých
 * souborů, extrakce width/height. Nikdy nevyhazuje výjimku přes hranici — vrací
 * `Result<…, DriveError>`.
 */
import { Readable } from "node:stream";
import { google } from "googleapis";
import type { DriveError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import type { DriveStorage, DriveUploadMeta, DriveStreamResult, DriveFileMeta, DriveThumbnailResult } from "@/services/drive-connector";

const UPLOAD_TIMEOUT_MS = 120_000;

function driveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return { auth, drive: google.drive({ version: "v3", auth }) };
}

/** Je chyba googleapis timeout? (axios `ECONNABORTED` / hláška „timeout"). */
function isTimeout(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  const msg = (e as { message?: string })?.message ?? "";
  return code === "ECONNABORTED" || /timeout/i.test(msg);
}

export function createGoogleDriveStorage(): DriveStorage {
  return {
    async authenticate(): Promise<Result<void, DriveError>> {
      try {
        await driveClient().auth.getAccessToken();
        return ok();
      } catch (e) {
        return err({
          code: "auth_failed",
          message: `Autentizace Google Drive selhala: ${(e as Error).message}`,
        });
      }
    },

    async upload(
      file: Buffer,
      meta: DriveUploadMeta,
    ): Promise<Result<{ driveFileId: string }, DriveError>> {
      try {
        const { drive } = driveClient();
        const res = await drive.files.create(
          {
            requestBody: {
              name: meta.name,
              parents: process.env.GDRIVE_ROOT_FOLDER_ID
                ? [process.env.GDRIVE_ROOT_FOLDER_ID]
                : undefined,
            },
            media: { mimeType: meta.mimeType, body: Readable.from(file) },
            fields: "id",
          },
          { timeout: UPLOAD_TIMEOUT_MS },
        );
        const id = res.data.id;
        if (!id) {
          return err({ code: "upload_failed", message: "Drive nevrátil ID souboru." });
        }
        return ok({ driveFileId: id });
      } catch (e) {
        if (isTimeout(e)) {
          return err({
            code: "timeout",
            timeoutMs: UPLOAD_TIMEOUT_MS,
            message: "Nahrávání na Google Drive nedoběhlo do 120 s.",
          });
        }
        return err({
          code: "upload_failed",
          message: `Nahrávání na Google Drive selhalo: ${(e as Error).message}`,
        });
      }
    },

    async streamFile(
      driveFileId: string,
      range?: string,
    ): Promise<Result<DriveStreamResult, DriveError>> {
      try {
        const { drive } = driveClient();
        const res = await drive.files.get(
          { fileId: driveFileId, alt: "media" },
          {
            responseType: "stream",
            // Range hlavička → Drive vrátí 206 + Content-Range (seek ve videu).
            headers: range ? { Range: range } : undefined,
          },
        );
        // gaxios vrací headers jako Headers objekt (nutno .get(), ne bracket);
        // ošetříme i případ plain objektu pro jistotu.
        const rawHeaders = res.headers as unknown as {
          get?: (name: string) => string | null;
        } & Record<string, string | undefined>;
        const readHeader = (name: string): string | undefined => {
          if (typeof rawHeaders.get === "function") {
            return rawHeaders.get(name) ?? undefined;
          }
          return rawHeaders[name] ?? undefined;
        };
        const contentRange = readHeader("content-range");
        const contentLength = readHeader("content-length");
        const web = Readable.toWeb(res.data as unknown as Readable);
        // 206 jen s platným Content-Range; jinak 200 (jinak prohlížeč odmítne).
        const status: 200 | 206 = res.status === 206 && contentRange ? 206 : 200;
        return ok({
          body: web as ReadableStream<Uint8Array>,
          status,
          contentLength,
          contentRange,
        });
      } catch (e) {
        return err({
          code: "upload_failed",
          message: `Načtení souboru z Google Drive selhalo: ${(e as Error).message}`,
        });
      }
    },

    async getThumbnail(driveFileId: string): Promise<Result<DriveThumbnailResult, DriveError>> {
      try {
        const { auth, drive } = driveClient();
        const meta = await drive.files.get({
          fileId: driveFileId,
          fields: "thumbnailLink",
          supportsAllDrives: true,
        });
        const link = meta.data.thumbnailLink;
        if (!link) {
          return err({ code: "not_found", message: "Drive nevrátil náhled souboru." });
        }
        const at = await auth.getAccessToken();
        const accessToken = typeof at === "string" ? at : at?.token;
        if (!accessToken) {
          return err({ code: "auth_failed", message: "Chybí Google access token." });
        }
        const res = await fetch(link, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok || !res.body) {
          return err({
            code: "upload_failed",
            message: `Načtení náhledu z Google Drive selhalo (HTTP ${res.status}).`,
          });
        }
        return ok({
          body: res.body as ReadableStream<Uint8Array>,
          contentType: res.headers.get("content-type") ?? "image/jpeg",
        });
      } catch (e) {
        return err({
          code: "upload_failed",
          message: `Načtení náhledu z Google Drive selhalo: ${(e as Error).message}`,
        });
      }
    },

    async listFiles(folderId: string): Promise<Result<DriveFileMeta[], DriveError>> {
      try {
        const { drive } = driveClient();
        const files: DriveFileMeta[] = [];
        let pageToken: string | undefined;
        do {
          const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields:
              "nextPageToken, files(id, name, mimeType, size, imageMediaMetadata(width,height), videoMediaMetadata(width,height,durationMillis))",
            pageSize: 1000,
            pageToken,
            // Sdílené disky (kdyby složka byla na Shared Drive) — neškodí u My Drive.
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          for (const f of res.data.files ?? []) {
            if (!f.id || !f.mimeType) continue;
            const img = f.imageMediaMetadata;
            const vid = f.videoMediaMetadata;
            files.push({
              driveFileId: f.id,
              name: f.name ?? f.id,
              mimeType: f.mimeType,
              sizeBytes: Number(f.size ?? 0) || 0,
              width: vid?.width ?? img?.width ?? 0,
              height: vid?.height ?? img?.height ?? 0,
              durationMs: vid?.durationMillis ? Number(vid.durationMillis) || null : null,
            });
          }
          pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
        return ok(files);
      } catch (e) {
        return err({
          code: "list_failed",
          message: `Výpis souborů z Google Drive selhal: ${(e as Error).message}`,
        });
      }
    },

    async deleteFile(driveFileId: string): Promise<Result<void, DriveError>> {
      try {
        await driveClient().drive.files.delete({ fileId: driveFileId });
        return ok();
      } catch (e) {
        // Soubor už na Drive není → považuj za úspěch (idempotentní delete).
        const status = (e as { code?: number; response?: { status?: number } }).code
          ?? (e as { response?: { status?: number } }).response?.status;
        if (status === 404) return ok();
        return err({
          code: "upload_failed",
          message: `Smazání souboru z Google Drive selhalo: ${(e as Error).message}`,
        });
      }
    },

    async createResumableSession(
      meta: DriveUploadMeta,
    ): Promise<Result<{ uploadUrl: string }, DriveError>> {
      try {
        const { auth } = driveClient();
        const at = await auth.getAccessToken();
        const accessToken = typeof at === "string" ? at : at?.token;
        if (!accessToken) {
          return err({ code: "auth_failed", message: "Chybí Google access token." });
        }
        const folder = process.env.GDRIVE_ROOT_FOLDER_ID;
        const res = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json; charset=UTF-8",
              "x-upload-content-type": meta.mimeType,
            },
            body: JSON.stringify({
              name: meta.name,
              parents: folder ? [folder] : undefined,
            }),
          },
        );
        if (!res.ok) {
          return err({
            code: "upload_failed",
            message: `Inicializace resumable uploadu selhala (HTTP ${res.status}).`,
          });
        }
        const uploadUrl = res.headers.get("location");
        if (!uploadUrl) {
          return err({ code: "upload_failed", message: "Drive nevrátil upload URL." });
        }
        return ok({ uploadUrl });
      } catch (e) {
        return err({
          code: "upload_failed",
          message: `Inicializace resumable uploadu selhala: ${(e as Error).message}`,
        });
      }
    },
  };
}
