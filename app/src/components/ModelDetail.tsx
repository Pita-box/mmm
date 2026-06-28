"use client";

/**
 * ModelDetail — artist page modelu (R13.4, R13.5).
 *
 * Zobrazí jméno modelu, jeho bio a galerii obsahující výhradně Approved_Media
 * přiřazená k modelu (invariant viditelnosti řeší zdroj dat, R13.4). Nemá-li
 * model žádné Approved_Media, vykreslí se prázdná galerie s textovým sdělením
 * (R13.5).
 *
 * Galerie se vykresluje přes `BrowsableGrid` (responzivní masonry mřížka s
 * nekonečným scrollem a napojeným přehrávačem — výběr karty otevře přehrávač).
 *
 * TODO(task 21): média napojit na `Model_Service.getGallery(modelId)` přes
 * server action; tady přicházejí jako props (placeholder data).
 */
import { ImageOff } from "lucide-react";
import { BrowsableGrid } from "./BrowsableGrid";
import type { MediaCardItem } from "./MediaCard";

export interface ModelDetailProps {
  readonly name: string;
  readonly bio: string;
  /** Výhradně Approved_Media modelu (R13.4). */
  readonly media: readonly MediaCardItem[];
}

export function ModelDetail({ name, bio, media }: ModelDetailProps) {
  const hasMedia = media.length > 0;
  const hasBio = bio.trim().length > 0;

  return (
    <section>
      <header className="mb-8">
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          {name}
        </h1>
        {hasBio && (
          <p className="mt-3 max-w-2xl text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            {bio}
          </p>
        )}
      </header>

      {hasMedia ? (
        <BrowsableGrid media={media} />
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <ImageOff aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Tento model zatím nemá žádný obsah.
        </p>
      )}
    </section>
  );
}

export default ModelDetail;
