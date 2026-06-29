"use client";

/**
 * TagValueInput — sdílený vstup hodnot jedné kategorie štítků (plán 014).
 *
 * Jediná pravda pro chování štítků napříč adminem: přidání Enterem nebo čárkou
 * při psaní (i vložení řetězce s čárkami), našeptávač přes `<datalist>`, chipy
 * s odebráním. Čistě prezentační — `onAdd` dostává už rozdělené hodnoty
 * (`splitTagInput`), dedupe/ukládání řeší rodič; `onRemove` dostává hodnotu.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { splitTagInput } from "@/services/tag-service";

export interface TagValueInputProps {
  /** Název kategorie (zobrazí se nad vstupem). */
  readonly label: string;
  /** Unikátní id pro `<datalist>` našeptávače. */
  readonly listId: string;
  /** Aktuální hodnoty (chipy). */
  readonly values: readonly string[];
  readonly suggestions?: readonly string[];
  readonly disabled?: boolean;
  /** Commit (čárka/Enter) — rozdělené hodnoty; rodič dedupuje a ukládá. */
  readonly onAdd: (values: string[]) => void;
  readonly onRemove: (value: string) => void;
}

const FIELD_CLASS =
  "rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

export function TagValueInput({
  label,
  listId,
  values,
  suggestions = [],
  disabled = false,
  onAdd,
  onRemove,
}: TagValueInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const vals = splitTagInput(raw);
    if (vals.length > 0) onAdd(vals);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[length:var(--text-caption)] font-semibold text-silver">{label}</span>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-charcoal px-2 py-0.5 text-[length:var(--text-caption)] text-chalk-white"
            >
              {v}
              <button
                type="button"
                aria-label={`Odebrat ${v}`}
                disabled={disabled}
                className="ml-0.5 cursor-pointer rounded-[var(--radius-sm)] p-0.5 hover:text-netflix-red disabled:opacity-50"
                onClick={() => onRemove(v)}
              >
                <X aria-hidden size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        aria-label={`Štítky — ${label}`}
        className={FIELD_CLASS}
        list={suggestions.length > 0 ? listId : undefined}
        placeholder="napiš a stiskni Enter nebo čárku"
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          // Čárka při psaní (i vložení řetězce) přidá hotové hodnoty hned.
          if (raw.includes(",")) {
            const parts = raw.split(",");
            const remainder = parts.pop() ?? "";
            commit(parts.join(","));
            setDraft(remainder);
          } else {
            setDraft(raw);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            setDraft("");
          }
        }}
      />
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
