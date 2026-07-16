"use client";

/**
 * BrowsableGrid — masonry mřížka médií s napojeným přehrávačem (R12 + R6.6).
 *
 * Spojuje `MasonryGrid` (nekonečný scroll nad statickým fondem přes `poolLoader`)
 * s `MediaLightbox`: výběr karty otevře přehrávač pro dané médium. Sjednocuje
 * opakovaný pattern stránek Search / Models / detail modelu.
 */
import { useMemo, useState } from "react";
import { MasonryGrid, poolLoader } from "./MasonryGrid";
import { MediaLightbox } from "./MediaLightbox";
import type { MediaCardItem } from "./MediaCard";

export interface BrowsableGridProps {
  /** Fond médií k zobrazení (Approved_Media). */
  readonly media: readonly MediaCardItem[];
  readonly canEdit?: boolean;
}

export function BrowsableGrid({ media, canEdit = false }: BrowsableGridProps) {
  const [selected, setSelected] = useState<MediaCardItem | null>(null);
  const loadPage = useMemo(() => poolLoader(media), [media]);

  return (
    <>
      <MasonryGrid loadPage={loadPage} onSelect={setSelected} />
      <MediaLightbox
        item={selected}
        sequence={media}
        onClose={() => setSelected(null)}
        canEdit={canEdit}
        onPrev={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i > 0 ? () => setSelected(media[i - 1]) : undefined;
        })()}
        onNext={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i >= 0 && i < media.length - 1 ? () => setSelected(media[i + 1]) : undefined;
        })()}
      />
    </>
  );
}

export default BrowsableGrid;
