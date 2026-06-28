"use client";

import type {
  FilterCategoryMenu,
  FilterSelection,
} from "@/services/filter-service";
import type { TagCategory } from "@/lib/domain";
import { X } from "lucide-react";

export interface FilterBarProps {
  /**
   * Nabídka filtrů z `buildFilterMenu` — obsahuje právě ty kategorie, které
   * mají alespoň jednu hodnotu (R11.1, R11.2). Kategorie bez hodnot se sem
   * nedostanou, takže se nezobrazí.
   */
  readonly menu: readonly FilterCategoryMenu[];
  /** Aktuální výběr hodnot per kategorie (řízený zvenčí). */
  readonly selection: FilterSelection;
  /** Volá se s novým výběrem po každém přepnutí hodnoty. */
  readonly onChange: (next: FilterSelection) => void;
}

/** Je hodnota `value` aktuálně vybraná v dané kategorii? */
function isSelected(
  selection: FilterSelection,
  category: TagCategory,
  value: string,
): boolean {
  return (selection[category] ?? []).includes(value);
}

/** Přepne hodnotu v kategorii (přidá/odebere) a vrátí nový výběr. */
function toggleValue(
  selection: FilterSelection,
  category: TagCategory,
  value: string,
): FilterSelection {
  const current = selection[category] ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...selection, [category]: next };
}

/** Je vybraná alespoň jedna hodnota napříč všemi kategoriemi? */
function hasSelection(selection: FilterSelection): boolean {
  return Object.values(selection).some((vals) => (vals?.length ?? 0) > 0);
}

/**
 * FilterBar — multi-select chips per Tag_Category pro stránku Search (R11).
 *
 * Pro každou kategorii v `menu` vykreslí skupinu přepínatelných chips
 * (toggle buttons s `aria-pressed`). Výběr je OR uvnitř kategorie a AND napříč
 * kategoriemi — sémantiku vyhodnocuje `Filter_Service.apply`; tato komponenta
 * pouze řídí výběr a hlásí změny přes `onChange`.
 *
 * ZÁMĚRNĚ neobsahuje žádné pole pro fulltextové vyhledávání (R11.8) — hledá se
 * výhradně kombinací filtrů.
 */
export function FilterBar({ menu, selection, onChange }: FilterBarProps) {
  if (menu.length === 0) {
    return (
      <p className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
        Zatím nejsou k dispozici žádné filtry.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-24)]">
      {menu.map((group) => (
        <fieldset key={group.category} className="border-0 p-0">
          <legend className="mb-[var(--spacing-8)] text-[length:var(--text-caption)] font-medium uppercase tracking-wide text-[color:var(--color-silver)]">
            {group.category}
          </legend>
          <div className="flex flex-wrap gap-[var(--spacing-8)]">
            {group.values.map((value) => {
              const active = isSelected(selection, group.category, value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(toggleValue(selection, group.category, value))
                  }
                  className={`cursor-pointer rounded-sm px-[var(--spacing-12)] py-[var(--spacing-8)] text-[length:var(--text-caption)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] ${
                    active
                      ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                      : "bg-[color:var(--color-charcoal)] text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {hasSelection(selection) && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="inline-flex items-center gap-1.5 self-start text-[length:var(--text-caption)] text-[color:var(--color-silver)] underline-offset-4 hover:text-[color:var(--color-chalk-white)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
        >
          <X aria-hidden size={14} />
          Zrušit filtry
        </button>
      )}
    </div>
  );
}
