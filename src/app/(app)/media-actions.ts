"use server";

import { requireSession } from "@/lib/session";
import { streamingUrlFor, thumbUrlFor } from "@/lib/media-presentation";
import type { MediaType } from "@/lib/domain";

export interface StreamingUrlActionResult {
  readonly ok: boolean;
  readonly url?: string;
  readonly message?: string;
}

export interface StreamingUrlsActionResult {
  readonly ok: boolean;
  readonly urls?: Record<string, string>;
  readonly message?: string;
}

function displayUrlFor(
  mediaId: string,
  mediaType: MediaType,
  userId: string,
): string | undefined {
  return mediaType === "photo"
    ? thumbUrlFor(mediaId, userId, new Date(), { size: 2048 })
    : streamingUrlFor(mediaId, userId, new Date());
}

/**
 * Vydá čerstvou proxy stream URL pro aktuálně přihlášeného uživatele.
 * Lightbox ji používá při otevření média, aby nevisel na tokenu vydaném už při renderu stránky.
 */
export async function issueStreamingUrlAction(
  mediaId: string,
  mediaType: MediaType = "video",
): Promise<StreamingUrlActionResult> {
  const principal = await requireSession();
  const url = displayUrlFor(mediaId, mediaType, principal.userId);
  if (!url) {
    return { ok: false, message: "Failed to create the streaming link." };
  }
  return { ok: true, url };
}

/**
 * Vydá čerstvé proxy stream URL pro malou dávku médií stejného uživatele.
 * Lightbox ji používá pro prefetch dalších fotek v pořadí.
 */
export async function issueStreamingUrlsAction(
  media: readonly { id: string; mediaType: MediaType }[],
): Promise<StreamingUrlsActionResult> {
  const principal = await requireSession();
  const items = media
    .filter(
      (item): item is { id: string; mediaType: MediaType } =>
        typeof item?.id === "string" && item.id.trim().length > 0,
    )
    .filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 3);

  const urls: Record<string, string> = {};
  for (const item of items) {
    const url = displayUrlFor(item.id, item.mediaType, principal.userId);
    if (url) urls[item.id] = url;
  }

  return { ok: true, urls };
}
