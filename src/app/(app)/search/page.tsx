/**
 * Search (Browser) — vyhledávání kombinací chytrých filtrů (R11, R12).
 *
 * Hledá se výhradně přes multi-select filtry nad pevnými kategoriemi štítků;
 * žádné fulltextové pole (R11.8). Server načte fond Approved_Media (s jejich
 * štítky a proxy náhledem) a předá ho klientské `SearchBrowser`, která drží
 * výběr a vyhodnocuje filtr čistou `Filter_Service.apply` — změna výběru
 * aktualizuje výsledky okamžitě, tedy do 2 s (R11.6).
 */
import { SearchBrowser, type SearchMediaItem } from "@/components/SearchBrowser";
import type { TagCategory } from "@/lib/domain";
import { toPublicMedia } from "@/services/drive-connector";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { membershipGate } from "@/lib/membership-gate";
import { streamingUrlFor, thumbUrlFor } from "@/lib/media-presentation";

export default async function SearchPage() {
  const principal = await requireSession();
  await requireVisibleSection("search", principal.role);
  const gate = await membershipGate(principal);
  if (gate) return gate;
  const now = new Date();

  const rows = await prisma.mediaItem.findMany({
    where: { status: "published", publishAt: { lte: now } },
    orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
    include: { model: true, tags: { include: { tagValue: true } } },
  });
  const profileMediaIds = Array.from(
    new Set(
      rows
        .map((row) => row.model?.profileMediaId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const profileMedia =
    profileMediaIds.length > 0
      ? await prisma.mediaItem.findMany({
          where: { id: { in: profileMediaIds } },
          select: { id: true, width: true, height: true },
        })
      : [];
  const profileMediaById = new Map(profileMedia.map((item) => [item.id, item]));

  const pool: SearchMediaItem[] = rows.map((row) => ({
    ...toPublicMedia(row),
    title: row.model?.name,
    tags: row.tags.map((t) => ({
      category: t.tagValue.category as TagCategory,
      value: t.tagValue.value,
    })),
    thumbnailUrl: streamingUrlFor(row.id, principal.userId, now),
    posterUrl: thumbUrlFor(row.id, principal.userId, now),
    profileAvatarUrl: row.model?.profileMediaId
      ? thumbUrlFor(row.model.profileMediaId, principal.userId, now)
      : undefined,
    profileAvatarCropX: row.model?.avatarCropX ?? null,
    profileAvatarCropY: row.model?.avatarCropY ?? null,
    profileAvatarZoom: row.model?.avatarZoom ?? null,
    profileAvatarWidth: row.model?.profileMediaId
      ? (profileMediaById.get(row.model.profileMediaId)?.width ?? null)
      : null,
    profileAvatarHeight: row.model?.profileMediaId
      ? (profileMediaById.get(row.model.profileMediaId)?.height ?? null)
      : null,
  }));

  return (
    <section className="flex flex-col gap-[var(--spacing-32)]">
      <SearchBrowser pool={pool} />
    </section>
  );
}
