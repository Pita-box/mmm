"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "./FilterBar";
import { BrowsableGrid } from "./BrowsableGrid";
import { ProfileAvatarImage } from "./ProfileAvatarImage";
import type { MediaCardItem } from "./MediaCard";
import {
  apply,
  buildFilterMenu,
  type FilterMode,
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
  /** Menší poster pro karty / avatary profilů. */
  readonly posterUrl?: string;
  /** Volitelný explicitní avatar profilu. */
  readonly profileAvatarUrl?: string;
  readonly profileAvatarCropX?: number | null;
  readonly profileAvatarCropY?: number | null;
  readonly profileAvatarZoom?: number | null;
  readonly profileAvatarWidth?: number | null;
  readonly profileAvatarHeight?: number | null;
}

export interface SearchBrowserProps {
  /** Fond médií k filtrování (Approved_Media). */
  readonly pool: readonly SearchMediaItem[];
}

/** Převede položku Search na `MediaCardItem` (štítky → pole hodnot pro chips). */
function toCard(item: SearchMediaItem): MediaCardItem {
  const { tags, title, thumbnailUrl, posterUrl, ...pub } = item;
  return { ...pub, title, thumbnailUrl, posterUrl, tags: tags.map((t) => t.value) };
}

/** Sesbírá všechny hodnoty štítků z fondu pro sestavení nabídky filtrů. */
function collectTagValues(
  pool: readonly SearchMediaItem[],
): TagValueView[] {
  return pool.flatMap((item) =>
    item.tags.map((t) => ({ category: t.category, value: t.value })),
  );
}

interface SearchProfileResult {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  readonly avatarUrl?: string;
  readonly avatarCropX?: number | null;
  readonly avatarCropY?: number | null;
  readonly avatarZoom?: number | null;
  readonly avatarWidth?: number | null;
  readonly avatarHeight?: number | null;
  readonly matchCount: number;
}

function buildProfileResults(
  results: readonly SearchMediaItem[],
): SearchProfileResult[] {
  const grouped = new Map<string, SearchProfileResult>();
  for (const item of results) {
    if (!item.modelId || !item.title) continue;
    const existing = grouped.get(item.modelId);
    if (existing) {
      grouped.set(item.modelId, {
        ...existing,
        matchCount: existing.matchCount + 1,
        avatarUrl: existing.avatarUrl ?? item.profileAvatarUrl ?? item.posterUrl,
        avatarWidth: existing.avatarWidth ?? item.profileAvatarWidth ?? item.width,
        avatarHeight: existing.avatarHeight ?? item.profileAvatarHeight ?? item.height,
      });
      continue;
    }
    grouped.set(item.modelId, {
      id: item.modelId,
      name: item.title,
      href: `/models/${item.modelId}`,
      avatarUrl: item.profileAvatarUrl ?? item.posterUrl,
      avatarCropX: item.profileAvatarCropX ?? null,
      avatarCropY: item.profileAvatarCropY ?? null,
      avatarZoom: item.profileAvatarZoom ?? null,
      avatarWidth: item.profileAvatarWidth ?? item.width,
      avatarHeight: item.profileAvatarHeight ?? item.height,
      matchCount: 1,
    });
  }
  return Array.from(grouped.values()).sort(
    (a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name),
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
  const [draftSelection, setDraftSelection] = useState<FilterSelection>({});
  const [appliedSelection, setAppliedSelection] = useState<FilterSelection>({});
  const [draftMode, setDraftMode] = useState<FilterMode>("and");
  const [appliedMode, setAppliedMode] = useState<FilterMode>("and");

  const menu = useMemo(() => buildFilterMenu(collectTagValues(pool)), [pool]);

  const results = useMemo(
    () => apply(appliedSelection, pool, now, appliedMode),
    [appliedSelection, pool, now, appliedMode],
  );

  const cards = useMemo(() => results.map(toCard), [results]);
  const profiles = useMemo(() => buildProfileResults(results), [results]);

  const applyFilters = () => {
    setAppliedSelection(draftSelection);
    setAppliedMode(draftMode);
  };

  const resetFilters = () => {
    setDraftSelection({});
    setAppliedSelection({});
    setDraftMode("and");
    setAppliedMode("and");
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-32)]">
      <FilterBar
        menu={menu}
        draftSelection={draftSelection}
        appliedSelection={appliedSelection}
        draftMode={draftMode}
        appliedMode={appliedMode}
        onSelectionChange={setDraftSelection}
        onModeChange={setDraftMode}
        onApply={applyFilters}
        onReset={resetFilters}
        profileCount={profiles.length}
        mediaCount={cards.length}
      />

      {cards.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-[var(--spacing-8)] py-[var(--spacing-64)] text-center"
        >
          <SearchX aria-hidden size={40} className="text-[color:var(--color-ash)]" />
          <p className="text-[length:var(--text-subheading)] font-medium text-[color:var(--color-chalk-white)]">
            No content matches the selected filters.
          </p>
          <p className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            Try adjusting your filter selection.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--spacing-32)]">
          {profiles.length > 0 ? (
            <section className="flex flex-col gap-[var(--spacing-16)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                    Profiles
                  </h2>
                  <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                    Models matching the current filter result.
                  </p>
                </div>
                <span className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                  {profiles.length} results
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {profiles.map((profile) => {
                  return (
                  <Link
                    key={profile.id}
                    href={profile.href}
                    className="group flex flex-col items-center gap-3 rounded-[var(--radius-2xl)] border border-[color:var(--color-charcoal)] bg-[color:var(--color-deep-space)]/70 px-4 py-5 text-center transition-colors hover:border-[color:var(--color-netflix-red)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)]"
                  >
                    <div className="relative aspect-square h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[color:var(--color-graphite)] ring-1 ring-[color:var(--color-charcoal)]">
                      {profile.avatarUrl ? (
                        <ProfileAvatarImage
                          src={profile.avatarUrl}
                          alt={profile.name}
                          crop={{
                            avatarCropX: profile.avatarCropX,
                            avatarCropY: profile.avatarCropY,
                            avatarZoom: profile.avatarZoom,
                          }}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[length:var(--text-subheading)] font-bold text-[color:var(--color-silver)]">
                          {profile.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="line-clamp-1 text-[length:var(--text-body)] font-semibold text-[color:var(--color-chalk-white)]">
                        {profile.name}
                      </p>
                      <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                        {profile.matchCount} matches
                      </p>
                    </div>
                  </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-[var(--spacing-16)]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                  Media
                </h2>
                <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                  Photos and videos matching the applied filters.
                </p>
              </div>
              <span className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                {cards.length} results
              </span>
            </div>

            <BrowsableGrid media={cards} />
          </section>
        </div>
      )}
    </div>
  );
}
