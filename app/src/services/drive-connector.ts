/**
 * Drive_Connector — streamovací tokeny, serializace médií a proxy (task 9.1).
 *
 * Tento soubor odděluje **čisté jádro** (podpis/ověření streamovacího tokenu,
 * serializace mediální odpovědi) od **I/O adaptéru** ke Google Drive
 * (`DriveStorage`). Čisté funkce jsou bez vedlejších efektů, deterministické
 * (vůči zadanému `secret` a `now`) a přímo testovatelné generátory (PBT tasky
 * 9.2–9.3). Skutečná autentizace a streamování přes Service Account
 * (`googleapis`) jsou skryté za rozhraním `DriveStorage` a budou napojené
 * v tasku 21.2; zde je k dispozici pouze stub.
 *
 * Bezpečnostní invarianty (R6):
 *  - Streamovací token je podepsaný (HMAC-SHA256) a vyprší nejpozději za 300 s
 *    od vydání (R6.1). Ověření uspěje právě když `now <= exp` (R6.5).
 *  - Neautorizovaný požadavek na přehrání nevygeneruje žádný token (R6.2).
 *  - Serializovaná mediální odpověď nikdy neobsahuje trvalý odkaz na soubor
 *    v Google Drive (`driveFileId` ani drive doménu) (R6.3, R6.4).
 *  - Obsah se klientovi doručuje výhradně proxy streamem bajtů přes Service
 *    Account, nikdy přímým (trvalým) odkazem na Drive (R6.3, R6.4).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MediaType, MediaStatus } from "@/lib/domain";
import type { DriveError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";

// ─── Konstanty ──────────────────────────────────────────────────────────────

/** Maximální (a používaná) platnost streamovacího tokenu v sekundách (R6.1). */
export const STREAMING_TOKEN_TTL_SECONDS = 300;

/**
 * Domény Google Drive, které se nikdy nesmí objevit v odpovědi klientovi
 * (R6.4). Slouží k defenzivní kontrole v testech serializace. Definice žije v
 * klient-safe modulu `@/lib/drive-domains`; zde se jen re-exportuje pro
 * zpětnou kompatibilitu importů.
 */
export { DRIVE_DOMAINS } from "@/lib/drive-domains";

// ─── Typy tokenu ──────────────────────────────────────────────────────────────

/** Obsah (payload) streamovacího tokenu. `exp` je čas vypršení v epoch sekundách. */
export interface StreamingTokenPayload {
  readonly mediaId: string;
  readonly userId: string;
  /** Čas vypršení v epoch sekundách (UTC). */
  readonly exp: number;
}

/** Podepsaný streamovací token (kompaktní `payload.signature`, oba base64url). */
export type StreamingToken = string;

/** Parametry vydání tokenu. `userId` určuje autorizaci požadavku (R6.2). */
export interface IssueTokenParams {
  readonly mediaId: string;
  /** Identita autentizovaného uživatele; prázdná/chybějící = neautorizováno. */
  readonly userId?: string | null;
  readonly now: Date;
}

// ─── Čisté jádro: podpis a ověření tokenu ─────────────────────────────────────

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** Je `value` neprázdný řetězec (po odstranění okrajových mezer)? */
function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Podepíše payload a vrátí kompaktní token `base64url(json).base64url(hmac)`.
 * Čistá funkce — žádné I/O, deterministická vůči `secret`.
 */
export function signStreamingToken(payload: StreamingTokenPayload, secret: string): StreamingToken {
  const encoded = base64urlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Vydá streamovací token pro autorizovaný požadavek (R6.1, R6.2).
 *
 * Token vyprší přesně za `STREAMING_TOKEN_TTL_SECONDS` (≤ 300 s, R6.1).
 * Neautorizovaný požadavek (chybějící/prázdný `userId`) nevygeneruje žádný
 * token a vrátí chybu `unauthorized` (R6.2).
 */
export function issueStreamingToken(
  params: IssueTokenParams,
  secret: string,
): Result<StreamingToken, DriveError> {
  if (!isNonEmpty(params.userId)) {
    return err({
      code: "unauthorized",
      message: "Neautorizovaný požadavek nevygeneruje streamovací token.",
    });
  }
  const nowSeconds = Math.floor(params.now.getTime() / 1000);
  const payload: StreamingTokenPayload = {
    mediaId: params.mediaId,
    userId: params.userId,
    exp: nowSeconds + STREAMING_TOKEN_TTL_SECONDS,
  };
  return ok(signStreamingToken(payload, secret));
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Ověří streamovací token (R6.5).
 *
 * Uspěje právě když je podpis platný a `now <= exp` (porovnání v sekundách).
 * Po vypršení vrací `token_expired`; poškozený/podvržený token `token_invalid`.
 */
export function verifyStreamingToken(
  token: StreamingToken,
  now: Date,
  secret: string,
): Result<StreamingTokenPayload, DriveError> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return err({ code: "token_invalid", message: "Neplatný formát tokenu." });
  }
  const [encodedPayload, signature] = parts;
  if (!safeEqual(signature, sign(encodedPayload, secret))) {
    return err({ code: "token_invalid", message: "Neplatný podpis tokenu." });
  }

  let payload: StreamingTokenPayload;
  try {
    const parsed = JSON.parse(base64urlDecode(encodedPayload)) as Partial<StreamingTokenPayload>;
    if (
      typeof parsed.mediaId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.exp !== "number" ||
      !Number.isFinite(parsed.exp)
    ) {
      return err({ code: "token_invalid", message: "Neúplný obsah tokenu." });
    }
    payload = { mediaId: parsed.mediaId, userId: parsed.userId, exp: parsed.exp };
  } catch {
    return err({ code: "token_invalid", message: "Obsah tokenu nelze přečíst." });
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds > payload.exp) {
    return err({ code: "token_expired", message: "Platnost streamovacího odkazu vypršela." });
  }
  return ok(payload);
}

// ─── Čisté jádro: serializace mediální odpovědi ───────────────────────────────

/**
 * Strukturální záznam média (podmnožina Prisma `MediaItem`) potřebná k
 * serializaci. `driveFileId` je trvalý odkaz na Drive — nikdy nesmí opustit
 * server (R6.4).
 */
export interface MediaItemRecord {
  readonly id: string;
  readonly modelId: string | null;
  readonly driveFileId: string;
  readonly mediaType: MediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: MediaStatus;
  readonly publishAt: Date | null;
  readonly width: number;
  readonly height: number;
  readonly durationMs?: number | null;
  readonly createdAt: Date;
}

/**
 * Veřejná (klientovi serializovaná) reprezentace média. Záměrně **neobsahuje**
 * `driveFileId` ani žádný odkaz na doménu Google Drive (R6.3, R6.4). Přehrávání
 * probíhá výhradně přes proxy `/api/stream/<token>`, kde token vydá server.
 */
export interface PublicMediaItem {
  readonly id: string;
  readonly modelId: string | null;
  readonly mediaType: MediaType;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: MediaStatus;
  readonly publishAt: Date | null;
  readonly width: number;
  readonly height: number;
  readonly durationMs?: number | null;
  readonly createdAt: Date;
}

/**
 * Serializuje Media_Item do veřejné podoby bez trvalého odkazu na Drive.
 * `driveFileId` je vynechán, žádná drive doména se nepřidává (R6.3, R6.4).
 */
export function toPublicMedia(item: MediaItemRecord): PublicMediaItem {
  // Explicitní destructuring zajišťuje, že `driveFileId` je vynechán i kdyby
  // do `item` přibyla další pole.
  const {
    id,
    modelId,
    mediaType,
    mimeType,
    sizeBytes,
    status,
    publishAt,
    width,
    height,
    durationMs,
    createdAt,
  } = item;
  return {
    id,
    modelId,
    mediaType,
    mimeType,
    sizeBytes,
    status,
    publishAt,
    width,
    height,
    durationMs,
    createdAt,
  };
}

// ─── I/O adaptér: úložiště Google Drive (Service Account) ─────────────────────

/** Metadata souboru pro upload na Drive. */
export interface DriveUploadMeta {
  readonly mimeType: string;
  readonly name: string;
}

/** Metadata existujícího souboru na Drive (pro ingest z Drive složky, plán 007). */
export interface DriveFileMeta {
  readonly driveFileId: string;
  readonly name: string;
  readonly mimeType: string;
  /** Velikost v bajtech (Drive vrací jako string → parsujeme na number). */
  readonly sizeBytes: number;
  /** Rozměry z Drive image/video metadat (0 když Drive nemá k dispozici). */
  readonly width?: number;
  readonly height?: number;
  /** Délka videa v ms z `videoMediaMetadata.durationMillis` (null u fotek). */
  readonly durationMs?: number | null;
}

/**
 * Výsledek streamování: tělo + stav (200 celé / 206 částečné pro Range) a
 * volitelné hlavičky k propsání klientovi (pro seek ve videu).
 */
export interface DriveStreamResult {
  readonly body: ReadableStream<Uint8Array>;
  readonly status: 200 | 206;
  readonly contentLength?: string;
  readonly contentRange?: string;
}

/**
 * Výsledek načtení náhledu (thumbnail) z Drive: malý obrázek + jeho typ.
 * Slouží pro karty/Hero přes proxy `/api/thumb/<token>` — `driveFileId` ani
 * Drive doména se nikdy nedostanou ke klientovi (R6.4).
 */
export interface DriveThumbnailResult {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
}

/**
 * Port k úložišti Google Drive přes Service Account. Skutečná implementace
 * (`googleapis`) bude napojena v tasku 21.2; zde existuje pouze stub.
 * Streamování vrací proxy bajty — nikdy trvalý odkaz na Drive (R6.3, R6.4).
 * `range` (HTTP Range hlavička) umožní seek ve videu (částečný obsah, 206).
 */
export interface DriveStorage {
  authenticate(): Promise<Result<void, DriveError>>;
  upload(file: Buffer, meta: DriveUploadMeta): Promise<Result<{ driveFileId: string }, DriveError>>;
  streamFile(driveFileId: string, range?: string): Promise<Result<DriveStreamResult, DriveError>>;
  /**
   * Načte malý náhled (thumbnail) souboru z Drive (`thumbnailLink`) a streamuje
   * jeho bajty. Pro karty/Hero přes proxy — video i foto mají levný náhled,
   * který se nesmí stahovat jako celý soubor (plán 010). `driveFileId` ani Drive
   * doména nikdy neopustí server (R6.4).
   */
  getThumbnail(driveFileId: string): Promise<Result<DriveThumbnailResult, DriveError>>;
  /**
   * Vylistuje soubory v dané Drive složce (ingest z Drive, plán 007). Vrací jen
   * netrashed soubory v té složce; stránkování řeší implementace.
   */
  listFiles(folderId: string): Promise<Result<DriveFileMeta[], DriveError>>;
  /**
   * Vytvoří resumable upload session (plán 007 — Approach B): vrátí `uploadUrl`,
   * na který klient nahraje soubor po částech PŘÍMO do Googlu (bajty nejdou přes
   * náš server). Refresh/access token zůstává na serveru.
   */
  createResumableSession(
    meta: DriveUploadMeta,
  ): Promise<Result<{ uploadUrl: string }, DriveError>>;
  /**
   * Kompenzační smazání souboru z Drive — používá se pro rollback, když po
   * úspěšném uploadu selže perzistence Media_Item (R5.4: žádný osiřelý záznam,
   * a obráceně žádný osiřelý soubor na Drive).
   */
  deleteFile(driveFileId: string): Promise<Result<void, DriveError>>;
}

/**
 * Stub úložiště pro fázi před napojením Service Account (task 21.2). Dokud
 * nejsou nakonfigurované přihlašovací údaje, vrací chybu autentizace místo
 * toho, aby vyhazoval výjimku přes hranici služby.
 */
export function createStubDriveStorage(): DriveStorage {
  const notConfigured: DriveError = {
    code: "auth_failed",
    message: "Google Drive Service Account není nakonfigurován (stub, napojení v tasku 21.2).",
  };
  return {
    async authenticate() {
      return err(notConfigured);
    },
    async upload() {
      return err(notConfigured);
    },
    async streamFile() {
      return err(notConfigured);
    },
    async getThumbnail() {
      return err(notConfigured);
    },
    async listFiles() {
      return err(notConfigured);
    },
    async createResumableSession() {
      return err(notConfigured);
    },
    async deleteFile() {
      // Rollback no-op pro stub: bez nakonfigurovaného účtu nikdy nevznikne
      // soubor k odstranění (upload vrací chybu dříve). Vracíme ok, aby
      // kompenzační větev v upload akci nehlásila falešné selhání.
      return ok();
    },
  };
}

// ─── Connector (váže secret z prostředí a I/O adaptér) ────────────────────────

export interface DriveConnector {
  /** Vydá podepsaný streamovací token; neautorizovaný požadavek nevygeneruje token. */
  issueStreamingToken(params: IssueTokenParams): Result<StreamingToken, DriveError>;
  /** Ověří token (úspěch ⇔ platný podpis a now ≤ exp). */
  verifyStreamingToken(token: StreamingToken, now: Date): Result<StreamingTokenPayload, DriveError>;
  /** Serializuje médium bez trvalého odkazu na Drive. */
  serializeMedia(item: MediaItemRecord): PublicMediaItem;
  /** Proxy stream bajtů přes Service Account — klientovi se nikdy nepošle trvalý odkaz. */
  streamFile(driveFileId: string, range?: string): Promise<Result<DriveStreamResult, DriveError>>;
}

export interface DriveConnectorOptions {
  /** Tajný klíč pro podpis tokenu. Výchozí z `process.env.STREAMING_TOKEN_SECRET`. */
  readonly secret?: string;
  /** I/O úložiště. Výchozí stub do napojení v tasku 21.2. */
  readonly storage?: DriveStorage;
}

/**
 * Vytvoří Drive_Connector. Tajný klíč pro podpis tokenu se čte z prostředí
 * (`STREAMING_TOKEN_SECRET`), pokud není předán explicitně — chybí-li, selže
 * fail-fast, aby se nikdy nepodepisovalo prázdným klíčem.
 */
export function createDriveConnector(options: DriveConnectorOptions = {}): DriveConnector {
  const secret = options.secret ?? process.env.STREAMING_TOKEN_SECRET;
  if (!isNonEmpty(secret)) {
    throw new Error(
      "STREAMING_TOKEN_SECRET není nastaven — nelze podepisovat streamovací tokeny.",
    );
  }
  const storage = options.storage ?? createStubDriveStorage();

  return {
    issueStreamingToken: (params) => issueStreamingToken(params, secret),
    verifyStreamingToken: (token, now) => verifyStreamingToken(token, now, secret),
    serializeMedia: toPublicMedia,
    streamFile: (driveFileId, range) => storage.streamFile(driveFileId, range),
  };
}
