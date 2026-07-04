"use client";

/**
 * MediaCollageCard — kolážová dlaždice pro přehled médií.
 *
 * Pinterest-style collage z posledních (max 3) náhledů + název a počet médií.
 * Náhledy jdou výhradně přes proxy `/api/thumb/<token>` (R6.4); rozbitý náhled
 * (Drive ho ještě nevygeneroval) spadne na gradient placeholder.
 */
import Link from "next/link";
import { useState } from "react";

export interface MediaCollageCardProps {
  /** Cíl odkazu. */
  readonly href: string;
  /** Název položky. */
  readonly title: string;
  /** Počet médií. */
  readonly count: number;
  /** Až 3 proxy náhledové URL (nejnovější první). */
  readonly posters: readonly string[];
}

/** Česká pluralizace „soubor". */
function filesLabel(n: number): string {
  if (n === 1) return "1 soubor";
  if (n >= 2 && n <= 4) return `${n} soubory`;
  return `${n} souborů`;
}

/** Jedna dlaždice collage — náhled přes proxy nebo gradient placeholder. */
function Tile({ src, span }: { readonly src?: string; readonly span: string }) {
  const [err, setErr] = useState(false);
  return (
    <div
      className={`relative overflow-hidden ${span}`}
      style={{ background: "var(--gradient-feature-card)" }}
    >
      {src && !err ? (
        // eslint-disable-next-line @next/next/no-img-element -- náhled přes proxy Streaming_URL, ne next/image
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErr(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

export function MediaCollageCard({ href, title, count, posters }: MediaCollageCardProps) {
  const label = title.trim().length > 0 ? title : "Bez názvu";
  const n = posters.length;

  return (
    <Link
      href={href}
      aria-label={label}
      className="group block w-full text-left transition-transform duration-200 ease-out hover:scale-[1.02] focus-visible:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-netflix-red)]"
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl">
        {n <= 1 ? (
          <Tile src={posters[0]} span="col-span-2 row-span-2" />
        ) : n === 2 ? (
          <>
            <Tile src={posters[0]} span="row-span-2" />
            <Tile src={posters[1]} span="row-span-2" />
          </>
        ) : (
          <>
            <Tile src={posters[0]} span="row-span-2" />
            <Tile src={posters[1]} span="" />
            <Tile src={posters[2]} span="" />
          </>
        )}
      </div>
      <p className="mt-2 truncate text-[length:var(--text-body)] font-bold text-[color:var(--color-chalk-white)]">
        {label}
      </p>
      <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
        {filesLabel(count)}
      </p>
    </Link>
  );
}

export default MediaCollageCard;
