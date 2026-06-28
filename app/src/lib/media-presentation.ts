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
export function thumbUrlFor(
  mediaId: string,
  userId: string,
  now: Date = new Date(),
): string | undefined {
  const token = getDriveConnector().issueStreamingToken({ mediaId, userId, now });
  return isOk(token) ? `/api/thumb/${encodeURIComponent(token.value)}` : undefined;
}

/** Doplňková zobrazovaná pole karty (titulek, štítky). */
export interface CardPresentation {
  readonly title?: string;
  readonly tags?: readonly string[];
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
    // posterUrl = malý náhled pro <img> na kartách/Hero (plán 010);
    // thumbnailUrl = plný stream pro přehrávač.
    posterUrl: thumbUrlFor(item.id, userId, now),
    thumbnailUrl: streamingUrlFor(item.id, userId, now),
  };
}
