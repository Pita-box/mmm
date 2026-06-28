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
import { streamingUrlFor } from "@/lib/media-presentation";

export default async function SearchPage() {
  const principal = await requireSession();
  const now = new Date();

  const rows = await prisma.mediaItem.findMany({
    where: { status: "published", publishAt: { lte: now } },
    include: { model: true, tags: { include: { tagValue: true } } },
  });

  const pool: SearchMediaItem[] = rows.map((row) => ({
    ...toPublicMedia(row),
    title: row.model?.name,
    tags: row.tags.map((t) => ({
      category: t.tagValue.category as TagCategory,
      value: t.tagValue.value,
    })),
    thumbnailUrl: streamingUrlFor(row.id, principal.userId, now),
  }));

  return (
    <section className="flex flex-col gap-[var(--spacing-32)]">
      <header>
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          Search
        </h1>
        <p className="mt-[var(--spacing-8)] text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          Hledejte kombinací filtrů — vyberte hodnoty napříč kategoriemi.
        </p>
      </header>

      <SearchBrowser pool={pool} />
    </section>
  );
}
