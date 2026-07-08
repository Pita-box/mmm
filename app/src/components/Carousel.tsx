"use client";

/**
 * Carousel — horizontálně scrollovatelná řada médií (Netflix-style content row).
 *
 * Vykreslí titulek řady a vodorovný pás karet `MediaCard` s plynulým scrollem a
 * šipkami vlevo/vpravo. Karty mají pevnou šířku (poster), výška se odvodí z
 * poměru stran média. Výběr karty deleguje na `onSelect` (otevření přehrávače).
 *
 * ponytail: scroll řeší nativní `overflow-x` + `scrollBy`; žádná virtualizace
 * ani vlastní drag — pás je krátký (jednotky až desítky položek).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard, type MediaCardItem } from "./MediaCard";

const MAX_MEDIA_ITEMS = 5;

export interface CarouselProps {
  /** Titulek řady (např. jméno modelu nebo „Nejnovější"). */
  readonly title: string;
  /** Cíl CTA dlaždice „View more". */
  readonly href?: string;
  /** Média v řadě (Approved_Media). */
  readonly media: readonly MediaCardItem[];
  /** Akce při výběru karty (otevření přehrávače). */
  readonly onSelect?: (item: MediaCardItem) => void;
  /**
   * Je tato řada nad ohybem (above-the-fold)? Jen tehdy se první karty načtou
   * eager/high; jinak vše lazy (dotáhne se při scrollu do view). Výchozí false —
   * na stránce s více karusely má prioritu jen ten první.
   */
  readonly priority?: boolean;
}

export function Carousel({ title, href, media, onSelect, priority = false }: CarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const hasMore = Boolean(href && media.length > MAX_MEDIA_ITEMS);
  const visibleItems = hasMore ? media.slice(0, MAX_MEDIA_ITEMS) : media;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 1);
      setCanPrev(el.scrollLeft > 1);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [visibleItems.length, hasMore]);

  if (media.length === 0) return null;

  function scrollByDirection(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (el) {
      el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
    }
  }

  const arrowBase =
    "flex h-8 w-8 items-center justify-center rounded-sm bg-[color:var(--color-charcoal)]/80 text-[color:var(--color-chalk-white)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]";
  const arrowEnabled = "cursor-pointer hover:bg-[color:var(--color-netflix-red)]";
  const arrowDisabled = "cursor-default opacity-40";

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[length:var(--text-heading-sm)] font-bold text-[color:var(--color-chalk-white)]">
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--color-netflix-red)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)]"
            >
              <span>{title}</span>
              <ChevronRight aria-hidden size={18} />
            </Link>
          ) : (
            title
          )}
        </h2>
        {/* Šipky jen když je co scrollovat; na kraji disabled (bez hoveru). */}
        {overflow && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollByDirection(-1)}
              disabled={!canPrev}
              aria-label="Previous"
              className={`${arrowBase} ${canPrev ? arrowEnabled : arrowDisabled}`}
            >
              <ChevronLeft aria-hidden size={20} />
            </button>
            <button
              type="button"
              onClick={() => scrollByDirection(1)}
              disabled={!canNext}
              aria-label="Next"
              className={`${arrowBase} ${canNext ? arrowEnabled : arrowDisabled}`}
            >
              <ChevronRight aria-hidden size={20} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleItems.map((item, index) => (
          <div
            key={item.id}
            className="w-40 shrink-0 snap-start sm:w-48 md:w-56"
          >
            <MediaCard
              item={item}
              onSelect={onSelect}
              imageLoading={priority && index < 3 ? "eager" : "lazy"}
              imageFetchPriority={priority && index < 3 ? "high" : "auto"}
            />
          </div>
        ))}
        {hasMore && href ? (
          <Link
            href={href}
            className="group flex w-40 shrink-0 snap-start flex-col justify-between rounded-2xl border border-[color:var(--color-charcoal)] bg-[color:var(--color-deep-space)]/70 p-5 text-left transition-colors hover:border-[color:var(--color-netflix-red)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)] sm:w-48 md:w-56"
          >
            <div className="flex aspect-[3/4] items-end rounded-[var(--radius-xl)] bg-[color:var(--color-graphite)] p-4">
              <span className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                View more
              </span>
            </div>
            <span className="mt-4 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
              Open full model gallery
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default Carousel;
