/**
 * Serverová prezentační vrstva médií (task 21.2).
 *
 * Převádí perzistované Media_Item na klientovi bezpečnou podobu: serializace
 * vynechá trvalý `driveFileId` (R6.3/R6.4) a místo něj připojí krátkodobou
 * proxy `Streaming_URL` (`/api/stream/<token>`), kterou podepíše server pro
 * konkrétního uživatele (R6.1). Klient tak nikdy nevidí odkaz na Google Drive.
 */
import { isOk } from "./result";
import { getDriveConnector } from "./drive";
import { toPublicMedia, type MediaItemRecord } from "@/services/drive-connector";
import type { MediaCardItem } from "@/components/MediaCard";

/**
 * Vydá proxy Streaming_URL pro dané médium a uživatele, nebo `undefined`,
 * pokud token nelze vydat (např. neautorizováno). Platnost ≤ 300 s (R6.1).
 */
export function streamingUrlFor(
  mediaId: string,
  userId: string,
  now: Date = new Date(),
): string | undefined {
  const token = getDriveConnector().issueStreamingToken({ mediaId, userId, now });
  return isOk(token) ? `/api/stream/${encodeURIComponent(token.value)}` : undefined;
}

/**
 * Vydá proxy náhledovou URL (`/api/thumb/<token>`) — malý Drive thumbnail pro
 * karty/Hero (plán 010). Používá stejný streamovací token jako `streamingUrlFor`,
 * jen jiný endpoint (náhled místo celého souboru).
 */
/**
 * Bucketování náhledového tokenu na hodinu (+2h životnost) → URL je v rámci
 * hodiny STABILNÍ, takže prohlížeč cache (`max-age=3600` v thumb route) reálně
 * trefí a náhled se při další navigaci/refresh nevytahuje znovu z Drive ani
 * netranskóduje sharpem. To je hlavní zrychlení vnímané uživatelem.
 *
 * ponytail: náhledy jsou málo citlivé (malé optimalizované obrázky Approved_Media
 * vázané na uživatele), proto delší token snese. Strop: náhledový token žije až
 * ~2 h (stream celého souboru zůstává 300 s). Upgrade: sdílená CDN cache
 * (`public`/`s-maxage`) by vyžadovala odpojit token od `userId`.
 */
const THUMB_BUCKET_MS = 60 * 60 * 1000;
const THUMB_TTL_SECONDS = 2 * 60 * 60;

export function thumbUrlFor(
  mediaId: string,
  userId: string,
  now: Date = new Date(),
  options?: { size?: number; dpr?: number },
): string | undefined {
  const bucketedNow = new Date(Math.floor(now.getTime() / THUMB_BUCKET_MS) * THUMB_BUCKET_MS);
  const token = getDriveConnector().issueStreamingToken({
    mediaId,
    userId,
    now: bucketedNow,
    ttlSeconds: THUMB_TTL_SECONDS,
  });
  if (!isOk(token)) return undefined;
  const params = new URLSearchParams();
  if (typeof options?.size === "number" && Number.isFinite(options.size)) {
    params.set("size", String(Math.round(options.size)));
  }
  if (typeof options?.dpr === "number" && Number.isFinite(options.dpr)) {
    params.set("dpr", String(Math.round(options.dpr)));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `/api/thumb/${encodeURIComponent(token.value)}${query}`;
}

/** Doplňková zobrazovaná pole karty (titulek, štítky). */
export interface CardPresentation {
  readonly title?: string;
  readonly tags?: readonly string[];
  /** Štítky s ID pro editaci v lightboxu (jen kde je edit povolen). */
  readonly editTags?: readonly { id: string; category: string; value: string }[];
}

/**
 * Serializuje Media_Item do `MediaCardItem` s proxy náhledem pro daného
 * uživatele. `driveFileId` se nikdy nedostane do výstupu (R6.4).
 */
export function toCardItem(
  item: MediaItemRecord,
  userId: string,
  presentation: CardPresentation = {},
  now: Date = new Date(),
): MediaCardItem {
  return {
    ...toPublicMedia(item),
    title: presentation.title,
    tags: presentation.tags,
    editTags: presentation.editTags,
    // posterUrl = malý náhled pro <img> na kartách/Hero (plán 010);
    // thumbnailUrl = plný stream pro přehrávač.
    posterUrl: thumbUrlFor(item.id, userId, now),
    thumbnailUrl: streamingUrlFor(item.id, userId, now),
  };
}
