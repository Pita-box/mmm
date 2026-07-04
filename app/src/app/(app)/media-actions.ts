"use server";

import { requireSession } from "@/lib/session";
import { streamingUrlFor } from "@/lib/media-presentation";

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

/**
 * Vydá čerstvou proxy stream URL pro aktuálně přihlášeného uživatele.
 * Lightbox ji používá při otevření média, aby nevisel na tokenu vydaném už při renderu stránky.
 */
export async function issueStreamingUrlAction(
  mediaId: string,
): Promise<StreamingUrlActionResult> {
  const principal = await requireSession();
  const url = streamingUrlFor(mediaId, principal.userId, new Date());
  if (!url) {
    return { ok: false, message: "Streamovací odkaz se nepodařilo vytvořit." };
  }
  return { ok: true, url };
}

/**
 * Vydá čerstvé proxy stream URL pro malou dávku médií stejného uživatele.
 * Lightbox ji používá pro prefetch dalších fotek v pořadí.
 */
export async function issueStreamingUrlsAction(
  mediaIds: readonly string[],
): Promise<StreamingUrlsActionResult> {
  const principal = await requireSession();
  const ids = Array.from(
    new Set(mediaIds.filter((id) => typeof id === "string" && id.trim().length > 0)),
  ).slice(0, 3);

  const urls: Record<string, string> = {};
  for (const mediaId of ids) {
    const url = streamingUrlFor(mediaId, principal.userId, new Date());
    if (url) urls[mediaId] = url;
  }

  return { ok: true, urls };
}
