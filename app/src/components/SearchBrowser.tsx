"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { FilterBar } from "./FilterBar";
import { BrowsableGrid } from "./BrowsableGrid";
import type { MediaCardItem } from "./MediaCard";
import {
  apply,
  buildFilterMenu,
  type FilterableMediaView,
  type FilterSelection,
  type TagValueView,
} from "@/services/filter-service";
import type { PublicMediaItem } from "@/services/drive-connector";

/**
 * Položka pro stránku Search: veřejná reprezentace média (`PublicMediaItem`)
 * doplněná o štítky strukturované pro filtrování (`FilterableMediaView.tags`).
 * Slouží zároveň jako vstup `Filter_Service.apply` i jako zdroj pro `MediaCard`.
 */
export interface SearchMediaItem extends PublicMediaItem, FilterableMediaView {
  /** Volitelný titulek karty (např. jméno modelu). */
  readonly title?: string;
  /** Náhled přes proxy Streaming_URL (`/api/stream/<token>`); vydává server. */
  readonly thumbnailUrl?: string;
}

export interface SearchBrowserProps {
  /** Fond médií k filtrování (Approved_Media). */
  readonly pool: readonly SearchMediaItem[];
}

/** Převede položku Search na `MediaCardItem` (štítky → pole hodnot pro chips). */
function toCard(item: SearchMediaItem): MediaCardItem {
  const { tags, title, thumbnailUrl, ...pub } = item;
  return { ...pub, title, thumbnailUrl, tags: tags.map((t) => t.value) };
}

/** Sesbírá všechny hodnoty štítků z fondu pro sestavení nabídky filtrů. */
function collectTagValues(
  pool: readonly SearchMediaItem[],
): TagValueView[] {
  return pool.flatMap((item) =>
    item.tags.map((t) => ({ category: t.category, value: t.value })),
  );
}

/**
 * SearchBrowser — klientská část stránky Search (R11, R12).
 *
 * Drží aktuální výběr filtrů, vyhodnocuje jej čistou `Filter_Service.apply`
 * (OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = vše) a podle
 * výsledku vykreslí buď masonry mřížku, nebo explicitní prázdný stav (R11.7),
 * přičemž výběr filtrů zůstává zachován. Nabídka filtrů se sestaví z dostupných
 * hodnot přes `buildFilterMenu` (R11.1, R11.2).
 */
export function SearchBrowser({ pool }: SearchBrowserProps) {
  // Časová reference stabilní po dobu života komponenty (invariant viditelnosti).
  const [now] = useState(() => new Date());
  const [selection, setSelection] = useState<FilterSelection>({});

  const menu = useMemo(() => buildFilterMenu(collectTagValues(pool)), [pool]);

  const results = useMemo(
    () => apply(selection, pool, now),
    [selection, pool, now],
  );

  const cards = useMemo(() => results.map(toCard), [results]);

  return (
    <div className="flex flex-col gap-[var(--spacing-32)]">
      <FilterBar menu={menu} selection={selection} onChange={setSelection} />

      {cards.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-[var(--spacing-8)] py-[var(--spacing-64)] text-center"
        >
          <SearchX aria-hidden size={40} className="text-[color:var(--color-ash)]" />
          <p className="text-[length:var(--text-subheading)] font-medium text-[color:var(--color-chalk-white)]">
            Žádný obsah neodpovídá zvoleným filtrům.
          </p>
          <p className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            Zkuste upravit výběr filtrů.
          </p>
        </div>
      ) : (
        <BrowsableGrid media={cards} />
      )}
    </div>
  );
}
