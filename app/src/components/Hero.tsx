"use client";

/**
 * Hero — kinematický banner na úvodní nástěnce Preview (R10, design-system-netflix).
 *
 * Zvýrazní jedno „featured" Approved_Media (typicky nejnovější) přes celou
 * šířku: ztlumený full-bleed backdrop, štítky a červené CTA „Watch" (bez
 * titulku — jde čistě o vizuální prohlížení). Backdrop i přehrání jdou výhradně
 * přes proxy `Streaming_URL` (`item.thumbnailUrl` = `/api/stream/<token>`),
 * takže odkaz na Drive nikdy neopustí server.
 *
 * „Watch" otevře přehrávač přes `onWatch` (předá rodič, sdílený `MediaLightbox`).
 * Bez `onWatch` zůstává prostý odkaz na proxy stream jako fallback.
 */
import { Play } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";

export interface HeroProps {
  /** Vybrané Approved_Media k zvýraznění (např. nejnovější). */
  readonly item: MediaCardItem;
  /** Otevření přehrávače pro featured médium (sdílený lightbox rodiče). */
  readonly onWatch?: (item: MediaCardItem) => void;
}

export function Hero({ item, onWatch }: HeroProps) {
  const tags = item.tags ?? [];
  const typeLabel = item.mediaType === "video" ? "Video" : "Foto";

  return (
    <section
      aria-label="Doporučený obsah"
      className="relative mb-12 overflow-hidden rounded-2xl"
    >
      {/* Full-bleed ztlumený backdrop přes proxy Streaming_URL. */}
      <div
        className="relative flex min-h-[420px] items-end"
        style={{ background: "var(--gradient-feature-card)" }}
      >
        {item.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- náhled jde přes proxy /api/thumb, ne přes next/image loader
          <img
            src={item.posterUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Kinematické ztmavení pro čitelnost textu (žádný box-shadow). */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[color:var(--color-deep-space)] via-[color:var(--color-deep-space)]/50 to-transparent"
        />

        <div className="relative z-10 max-w-2xl p-6 sm:p-12">
          <span className="text-[length:var(--text-caption)] font-medium uppercase tracking-wide text-[color:var(--color-silver)]">
            {typeLabel}
          </span>

          {tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-sm bg-[color:var(--color-charcoal)]/80 px-2 py-0.5 text-[length:var(--text-caption)] leading-none text-[color:var(--color-chalk-white)]"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}

          {onWatch ? (
            <button
              type="button"
              onClick={() => onWatch(item)}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-sm bg-[color:var(--color-netflix-red)] px-6 py-3 text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
            >
              <Play aria-hidden size={22} className="fill-current" />
              Watch
            </button>
          ) : (
            item.thumbnailUrl && (
              <a
                href={item.thumbnailUrl}
                className="mt-6 inline-flex items-center gap-2 rounded-sm bg-[color:var(--color-netflix-red)] px-6 py-3 text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
              >
                <Play aria-hidden size={22} className="fill-current" />
                Watch
              </a>
            )
          )}
        </div>
      </div>
    </section>
  );
}

export default Hero;
