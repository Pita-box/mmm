"use client";

/**
 * GateSamplePicker — admin výběr „sample" náhledů pro MembershipGate.
 *
 * Mřížka publikovaných médií; klik přepne zařazení do gate (optimisticky,
 * okamžitě volá `onToggle`). Vybraná dlaždice má červený rámeček + ✓.
 * Náhledy jdou přes proxy `/api/thumb/<token>` (R6.4).
 */
import { useState } from "react";
import { Check } from "lucide-react";

export interface GateSampleMedia {
  readonly id: string;
  readonly posterUrl?: string;
  readonly mediaType: "photo" | "video";
}

export interface GateSamplePickerProps {
  readonly media: readonly GateSampleMedia[];
  readonly initialSelected: readonly string[];
  readonly onToggle: (mediaId: string, included: boolean) => void | Promise<void>;
}

export function GateSamplePicker({ media, initialSelected, onToggle }: GateSamplePickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  if (media.length === 0) {
    return (
      <p className="text-[length:var(--text-body)] text-silver">
        No published media to choose from yet.
      </p>
    );
  }

  const toggle = (id: string) => {
    const next = !selected.has(id);
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    void onToggle(id, next);
  };

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {media.map((m) => {
        const isOn = selected.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(m.id)}
            style={{ background: "var(--gradient-feature-card)" }}
            className={`relative aspect-[3/4] cursor-pointer overflow-hidden rounded-2xl outline-none transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] ${
              isOn ? "ring-2 ring-[color:var(--color-netflix-red)]" : ""
            }`}
          >
            {m.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- náhled přes proxy /api/thumb, ne next/image
              <img
                src={m.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            ) : null}
            {isOn && (
              <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]">
                <Check aria-hidden size={14} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default GateSamplePicker;
