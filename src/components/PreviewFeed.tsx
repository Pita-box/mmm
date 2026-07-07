"use client";

/**
 * PreviewFeed — kompletní úvodní nástěnka Preview / Newsfeed (R10).
 *
 * Skládá Netflix-style layout nad seřazeným fondem Approved_Media (sestupně dle
 * času zveřejnění, R10.1/R10.2 — řadí volající přes `previewOrder`):
 *  1. horizontální `Carousel` řady seskupené podle modelu,
 *  2. masonry mřížka „Procházet vše" s nekonečným scrollem.
 *
 * Pro uploadery (Admin/Distributor) navíc: plovoucí „+" otevře upload popup
 * (stejný wizard jako stránka /upload) a soubory lze přetáhnout kamkoliv na
 * stránku — drop otevře popup s nahráváním (plán 012).
 */
import { useEffect, useMemo, useState } from "react";
import { Carousel } from "./Carousel";
import { MasonryGrid, poolLoader } from "./MasonryGrid";
import { MediaLightbox } from "./MediaLightbox";
import { MediaUploadLauncher } from "./MediaUploadLauncher";
import type { ModelOption } from "./admin/upload-wizard";
import type { MediaCardItem } from "./MediaCard";

export interface PreviewFeedProps {
  /** Approved_Media seřazená sestupně dle času zveřejnění (R10.1). */
  readonly media: readonly MediaCardItem[];
  /** Uploader (Admin/Distributor) → upload popup + drop kamkoliv (plán 012). */
  readonly canUpload?: boolean;
  /** Modely a hodnoty štítků pro upload wizard (jen když canUpload). */
  readonly models?: readonly ModelOption[];
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
}

/** Řada karuselu: titulek (jméno modelu) + jeho média v pořadí fondu. */
interface MediaRow {
  readonly title: string;
  readonly href: string;
  readonly items: MediaCardItem[];
}

/**
 * Seskupí média do alb podle modelu (titulek) se zachováním pořadí fondu.
 * Média BEZ modelu se do alb nezařazují — netvoří karusel, zůstanou jen v
 * mřížce „Procházet vše".
 */
function groupByModel(media: readonly MediaCardItem[]): MediaRow[] {
  const order: string[] = [];
  const byTitle = new Map<string, MediaRow>();
  for (const item of media) {
    const title = item.title?.trim();
    if (!title || !item.modelId) continue; // médium bez modelu → žádné album
    const bucket = byTitle.get(title);
    if (bucket) {
      bucket.items.push(item);
    } else {
      byTitle.set(title, {
        title,
        href: `/models/${item.modelId}`,
        items: [item],
      });
      order.push(title);
    }
  }
  return order.map((title) => byTitle.get(title)!);
}

export function PreviewFeed({
  media,
  canUpload = false,
  models = [],
  tagSuggestions = {},
}: PreviewFeedProps) {
  const [selected, setSelected] = useState<MediaCardItem | null>(null);
  const loadPage = useMemo(() => poolLoader(media), [media]);
  // Karusely modelů ze VŠECH médií (ne slice(1)) — nejnovější médium tak
  // nechybí ve své modelové řadě.
  const rows = useMemo(() => groupByModel(media), [media]);

  // Sdílený odkaz: otevři lightbox z ?m=<id> při načtení (bez navigace).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("m");
    if (!id) return;
    const found = media.find((x) => x.id === id);
    if (found) setSelected(found);
    // jen při mountu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drž URL v souladu s otevřeným médiem (sdílení), bez přechodu na novou stránku.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (selected) u.searchParams.set("m", selected.id);
    else u.searchParams.delete("m");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [selected]);

  if (media.length === 0) {
    return (
      <section>
        <header className="mb-8">
          <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            Preview
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            The latest content, newest first.
          </p>
        </header>
        <p className="py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          No content here yet.
        </p>
        {canUpload ? <MediaUploadLauncher models={models} tagSuggestions={tagSuggestions} /> : null}
      </section>
    );
  }

  return (
    <section>
      {rows.map((row, index) => (
        <Carousel
          key={row.title}
          title={row.title}
          href={row.href}
          media={row.items}
          onSelect={setSelected}
          priority={index === 0}
        />
      ))}

      <h2 className="mb-4 mt-4 text-[length:var(--text-heading-sm)] font-bold text-[color:var(--color-chalk-white)]">
        Browse all
      </h2>
      {/* Masonry je až pod karusely → není above-the-fold; vše lazy (dotáhne se scrollem). */}
      <MasonryGrid loadPage={loadPage} onSelect={setSelected} priority={false} />

      <MediaLightbox
        item={selected}
        sequence={media}
        onClose={() => setSelected(null)}
        canEdit={canUpload}
        models={models}
        tagSuggestions={tagSuggestions}
        onPrev={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i > 0 ? () => setSelected(media[i - 1]) : undefined;
        })()}
        onNext={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i >= 0 && i < media.length - 1 ? () => setSelected(media[i + 1]) : undefined;
        })()}
      />
      {canUpload ? <MediaUploadLauncher models={models} tagSuggestions={tagSuggestions} /> : null}
    </section>
  );
}

export default PreviewFeed;
