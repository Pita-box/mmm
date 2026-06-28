"use client";

/**
 * PreviewFeed — kompletní úvodní nástěnka Preview / Newsfeed (R10).
 *
 * Skládá Netflix-style layout nad seřazeným fondem Approved_Media (sestupně dle
 * času zveřejnění, R10.1/R10.2 — řadí volající přes `previewOrder`):
 *  1. `Hero` s nejnovějším médiem a CTA „Watch",
 *  2. horizontální `Carousel` řady seskupené podle modelu,
 *  3. masonry mřížka „Procházet vše" s nekonečným scrollem.
 *
 * Všechny tři vrstvy sdílejí jeden `MediaLightbox` — výběr karty i „Watch"
 * otevřou přehrávač (proxy Streaming_URL, R6.6). Prázdný fond → prázdný stav.
 */
import { useMemo, useState } from "react";
import { Hero } from "./Hero";
import { Carousel } from "./Carousel";
import { MasonryGrid, poolLoader } from "./MasonryGrid";
import { MediaLightbox } from "./MediaLightbox";
import type { MediaCardItem } from "./MediaCard";

export interface PreviewFeedProps {
  /** Approved_Media seřazená sestupně dle času zveřejnění (R10.1). */
  readonly media: readonly MediaCardItem[];
}

/** Řada karuselu: titulek (jméno modelu) + jeho média v pořadí fondu. */
interface MediaRow {
  readonly title: string;
  readonly items: readonly MediaCardItem[];
}

/**
 * Seskupí média do alb podle modelu (titulek) se zachováním pořadí fondu.
 * Média BEZ modelu se do alb nezařazují — netvoří karusel, zůstanou jen v
 * mřížce „Procházet vše".
 */
function groupByModel(media: readonly MediaCardItem[]): MediaRow[] {
  const order: string[] = [];
  const byTitle = new Map<string, MediaCardItem[]>();
  for (const item of media) {
    const title = item.title?.trim();
    if (!title) continue; // médium bez modelu → žádné album
    const bucket = byTitle.get(title);
    if (bucket) {
      bucket.push(item);
    } else {
      byTitle.set(title, [item]);
      order.push(title);
    }
  }
  return order.map((title) => ({ title, items: byTitle.get(title)! }));
}

export function PreviewFeed({ media }: PreviewFeedProps) {
  const [selected, setSelected] = useState<MediaCardItem | null>(null);
  const loadPage = useMemo(() => poolLoader(media), [media]);
  const rows = useMemo(() => groupByModel(media.slice(1)), [media]);

  if (media.length === 0) {
    return (
      <section>
        <header className="mb-8">
          <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            Preview
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            Nejnovější obsah seřazený od nejnovějšího.
          </p>
        </header>
        <p className="py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          Zatím tu není žádný obsah.
        </p>
      </section>
    );
  }

  const featured = media[0];

  return (
    <section>
      <Hero item={featured} onWatch={setSelected} />

      {rows.map((row) => (
        <Carousel
          key={row.title}
          title={row.title}
          media={row.items}
          onSelect={setSelected}
        />
      ))}

      <h2 className="mb-4 mt-4 text-[length:var(--text-heading-sm)] font-bold text-[color:var(--color-chalk-white)]">
        Procházet vše
      </h2>
      <MasonryGrid loadPage={loadPage} onSelect={setSelected} />

      <MediaLightbox item={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

export default PreviewFeed;
