/**
 * Preview / Newsfeed — úvodní nástěnka přihlášeného uživatele (R10).
 *
 * Zobrazuje Approved_Media seřazená sestupně podle času zveřejnění (R10.1).
 * Data se čtou z Media_Service / DB pro aktuální relaci; řazení a invariant
 * viditelnosti (pouze published s `publishAt <= now`) zajišťuje čistá
 * `previewOrder` (R10.2). Náhledy jdou přes proxy Streaming_URL (R6.4).
 */
import { PreviewFeed } from "@/components/PreviewFeed";
import { previewOrder } from "@/services/media-service";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { toCardItem } from "@/lib/media-presentation";

export default async function Preview() {
  const principal = await requireSession();
  const now = new Date();

  const rows = await prisma.mediaItem.findMany({
    where: { status: "published", publishAt: { lte: now } },
    include: { model: true, tags: { include: { tagValue: true } } },
  });

  // Approved_Media seřazená sestupně dle času zveřejnění (R10.1, R10.2).
  // `previewOrder` zachová původní řádky (s include model + tags), jen je
  // vyfiltruje na Approved a seřadí.
  const media = previewOrder(rows, now).map((row) =>
    toCardItem(
      row,
      principal.userId,
      {
        title: row.model?.name,
        tags: row.tags.map((t) => t.tagValue.value),
      },
      now,
    ),
  );

  // Nejnovější Approved_Media slouží jako featured hero (R10.1); zbytek jde do
  // karuselů a masonry mřížky. Vše skládá klientský PreviewFeed.
  return <PreviewFeed media={media} />;
}
