"use client";

/**
 * MembershipGate — server-side bariéra obsahu pro uživatele bez platného členství.
 *
 * Renderuje se MÍSTO skutečného obsahu stránky (layout `{children}` se vůbec
 * nevykreslí), takže reálná data se na klienta nikdy nepošlou — bariéru nelze
 * obejít smazáním elementu z DOM (adblock / inspect element). Na pozadí běží
 * **rozmazaná** masonry mřížka reálných „sample" náhledů (admin je vybírá v
 * `/admin/membership-gate`), přes ni výzva s informací o členství. Náhledy jsou
 * jen thumbnaily — bez lightboxu (`MasonryGrid` bez `onSelect`).
 */
import { useMemo } from "react";
import { Lock, Send } from "lucide-react";
import { MasonryGrid, poolLoader } from "./MasonryGrid";
import type { MediaCardItem } from "./MediaCard";

export interface MembershipGateProps {
  /** Sample náhledy (Approved_Media vybraná adminem) pro rozmazané pozadí. */
  readonly media: readonly MediaCardItem[];
}

/** Rozmazané demo dlaždice — fallback, když admin žádné sample nevybral. */
function DemoBackdrop() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[3/4] rounded-2xl"
          style={{ background: "var(--gradient-feature-card)" }}
        />
      ))}
    </div>
  );
}

export function MembershipGate({ media }: MembershipGateProps) {
  const loadPage = useMemo(() => poolLoader(media), [media]);
  const telegram = process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL;

  return (
    <section className="relative min-h-[70vh]">
      {/* Rozmazané pozadí — reálné thumbnaily bez interakce (žádný lightbox). */}
      <div aria-hidden className="pointer-events-none select-none blur-md">
        {media.length > 0 ? <MasonryGrid loadPage={loadPage} /> : <DemoBackdrop />}
      </div>

      {/* Výzva (žádný tmavý overlay — pozadí je rozmazané). */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          style={{
            borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
            boxShadow: "0 10px 50px rgba(0, 0, 0, 0.6)",
          }}
          className="flex max-w-md flex-col items-center gap-5 rounded-[var(--radius-2xl)] border bg-[color:var(--color-deep-space)]/90 p-8 text-center backdrop-blur-md"
        >
          <Lock aria-hidden size={40} className="text-[color:var(--color-netflix-red)]" />
          <h2 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            Membership required
          </h2>
          <p className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            This content is for active members only. Contact me via Telegram to get access.
          </p>
          {telegram ? (
            <a
              href={telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[var(--radius-pills)] bg-[color:var(--color-netflix-red)] px-6 py-3 text-[length:var(--text-body)] font-bold text-[color:var(--color-chalk-white)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
            >
              <Send aria-hidden size={18} />
              Telegram
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default MembershipGate;
