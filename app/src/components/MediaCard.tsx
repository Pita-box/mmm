import type { PublicMediaItem } from "@/services/drive-connector";
import { Play } from "lucide-react";

/** Délka videa „m:ss" z ms, nebo `null` (žádný badge). */
function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Položka zobrazitelná v `MediaCard`. Rozšiřuje serializovanou veřejnou
 * reprezentaci média (`PublicMediaItem`, bez `driveFileId`) o volitelná
 * zobrazovaná pole. Náhled i přehrávání běží výhradně přes proxy
 * `/api/stream/<token>` (drátování je v pozdějších taskech).
 */
export interface MediaCardItem extends PublicMediaItem {
  /** Volitelné štítky zobrazené jako chips přes spodní hranu karty. */
  readonly tags?: readonly string[];
  /** Volitelný titulek (např. jméno modelu) použitý i jako alt text. */
  readonly title?: string;
  /** Náhledový obrázek přes proxy Streaming_URL; drátuje se později. */
  readonly thumbnailUrl?: string;
  /**
   * Malý náhled (poster) přes proxy `/api/thumb/<token>` (plán 010). Použij ho
   * pro `<img>` na kartách/Hero — `thumbnailUrl` (plný stream) je pro přehrávač.
   */
  readonly posterUrl?: string;
}

export interface MediaCardProps {
  readonly item: MediaCardItem;
  /** Volitelná akce při výběru karty (otevření detailu / přehrávače). */
  readonly onSelect?: (item: MediaCardItem) => void;
}

/** Centrovaný play overlay pro video média. */
function PlayOverlay() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--color-deep-space)]/60 ring-1 ring-[color:var(--color-chalk-white)]/40 transition-transform group-hover:scale-110">
        <Play
          aria-hidden
          size={24}
          className="ml-0.5 fill-[color:var(--color-chalk-white)] text-[color:var(--color-chalk-white)]"
        />
      </span>
    </span>
  );
}

/**
 * Karta jednoho média v masonry mřížce (R12.1, R12.3).
 *
 * Rezervuje místo podle poměru stran zdrojového média (`aspectRatio`), takže se
 * při dokreslení náhledu rozložení neposouvá (CLS ≤ 0,1, R12.3). U videa
 * zobrazuje play overlay, štítky jako chips a jemné hover zvětšení.
 */
export function MediaCard({ item, onSelect }: MediaCardProps) {
  const ratio =
    item.width > 0 && item.height > 0 ? item.width / item.height : 1;
  const isVideo = item.mediaType === "video";
  const label = isVideo ? "Video" : "Fotografie";
  const tags = item.tags ?? [];
  const duration = formatDuration(item.durationMs);

  const visual = (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{ aspectRatio: String(ratio), background: "var(--gradient-feature-card)" }}
    >
      {item.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- náhled jde přes proxy /api/thumb, ne přes next/image loader
        <img
          src={item.posterUrl}
          alt={label}
          width={item.width || undefined}
          height={item.height || undefined}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: "var(--gradient-feature-card)" }}
        />
      )}

      {isVideo && <PlayOverlay />}

      {duration && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-sm bg-[color:var(--color-deep-space)]/70 px-1.5 py-0.5 text-[length:var(--text-caption)] font-medium leading-none text-[color:var(--color-chalk-white)]">
          {duration}
        </span>
      )}

      {tags.length > 0 && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-[color:var(--color-deep-space)]/80 to-transparent p-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-sm bg-[color:var(--color-charcoal)]/80 px-2 py-0.5 text-[length:var(--text-caption)] leading-none text-[color:var(--color-chalk-white)]"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  );

  const className =
    "group block w-full text-left transition-transform duration-200 ease-out hover:scale-[1.03] focus-visible:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)]";

  if (onSelect) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => onSelect(item)}
        className={`${className} cursor-pointer`}
      >
        {visual}
      </button>
    );
  }

  return (
    <article aria-label={label} className={className}>
      {visual}
    </article>
  );
}
