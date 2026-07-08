"use client";

import { useMemo, useState } from "react";
import type {
  FilterCategoryMenu,
  FilterMode,
  FilterSelection,
} from "@/services/filter-service";
import type { TagCategory } from "@/lib/domain";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { Button } from "./admin/admin-ui";

export interface FilterBarProps {
  /**
   * Nabídka filtrů z `buildFilterMenu` — obsahuje právě ty kategorie, které
   * mají alespoň jednu hodnotu (R11.1, R11.2). Kategorie bez hodnot se sem
   * nedostanou, takže se nezobrazí.
   */
  readonly menu: readonly FilterCategoryMenu[];
  /** Draft výběr hodnot per kategorie (ještě nemusí být aplikovaný). */
  readonly draftSelection: FilterSelection;
  /** Naposledy aplikovaný výběr — pro zobrazení „dirty" stavu. */
  readonly appliedSelection: FilterSelection;
  /** Draft režim filtrování (`AND` / `OR`). */
  readonly draftMode: FilterMode;
  /** Naposledy aplikovaný režim. */
  readonly appliedMode: FilterMode;
  /** Volá se s novým draft výběrem po přepnutí hodnoty. */
  readonly onSelectionChange: (next: FilterSelection) => void;
  /** Změna draft režimu. */
  readonly onModeChange: (next: FilterMode) => void;
  /** Aplikuje draft filtry na výsledky. */
  readonly onApply: () => void;
  /** Reset filtrů i výsledků. */
  readonly onReset: () => void;
  /** Počet profilů v aktuálním výsledku. */
  readonly profileCount: number;
  /** Počet médií v aktuálním výsledku. */
  readonly mediaCount: number;
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

function normalizeSelection(selection: FilterSelection): string {
  const normalizedEntries: Array<[string, readonly string[]]> = Object.entries(selection)
    .filter(([, values]) => (values?.length ?? 0) > 0)
    .map(([category, values]) => [
      category,
      [...(values ?? [])].sort((a, b) => a.localeCompare(b)),
    ]);
  return JSON.stringify(
    normalizedEntries
      .sort(([a], [b]) => a.localeCompare(b)),
  );
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
export function FilterBar({
  menu,
  draftSelection,
  appliedSelection,
  draftMode,
  appliedMode,
  onSelectionChange,
  onModeChange,
  onApply,
  onReset,
  profileCount,
  mediaCount,
}: FilterBarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const dirty = useMemo(
    () =>
      normalizeSelection(draftSelection) !== normalizeSelection(appliedSelection) ||
      draftMode !== appliedMode,
    [draftSelection, appliedSelection, draftMode, appliedMode],
  );
  const expandOnInteract = () => {
    if (collapsed) setCollapsed(false);
  };

  if (menu.length === 0) {
    return (
      <p className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
        No filters available yet.
      </p>
    );
  }

  return (
    <section className="sticky top-20 z-30">
      <div
        className={`rounded-[var(--radius-2xl)] border border-[color:var(--color-charcoal)] bg-[color:var(--color-deep-space)]/95 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[height,padding] duration-300 ${
          collapsed ? "h-[92px] overflow-hidden px-4 py-3" : "p-5"
        }`}
        onClick={collapsed ? expandOnInteract : undefined}
      >
        <div
          className={`justify-between gap-4 ${
            collapsed
              ? "flex h-full flex-nowrap items-center"
              : "flex flex-wrap items-start"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-wide text-[color:var(--color-silver)]">
              <Sparkles aria-hidden size={14} className="text-[color:var(--color-netflix-red)]" />
              Smart Filter
            </p>
            {collapsed ? (
              <p className="mt-1 line-clamp-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                {profileCount} profiles, {mediaCount} media
              </p>
            ) : (
              <>
                <h2 className="mt-2 text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                  Filter profiles and media
                </h2>
                <p className="mt-2 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                  {profileCount} profiles and {mediaCount} media match the current result set.
                </p>
              </>
            )}
          </div>

          <div
            className={`flex items-center gap-2 ${
              collapsed ? "ml-3 shrink-0 flex-nowrap" : "flex-wrap"
            }`}
          >
            <div className="inline-flex rounded-[var(--radius-lg)] border border-[color:var(--color-charcoal)] bg-[color:var(--color-graphite)] p-1">
              {(["and", "or"] as const).map((mode) => {
                const active = draftMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onModeChange(mode)}
                    className={`cursor-pointer rounded-[var(--radius-sm)] px-3 py-1.5 text-[length:var(--text-caption)] font-semibold uppercase transition-colors ${
                      active
                        ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                        : "text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setCollapsed(collapsed ? false : true)}
            >
              {collapsed ? <ChevronDown aria-hidden size={16} /> : <ChevronUp aria-hidden size={16} />}
              {collapsed ? "Expand" : "Collapse"}
            </Button>
            <Button type="button" variant="secondary" onClick={onReset}>
              <X aria-hidden size={14} />
              Reset
            </Button>
            <Button type="button" onClick={onApply} disabled={!dirty}>
              Filter
            </Button>
          </div>
        </div>

        <div className={`relative ${collapsed ? "mt-2" : "mt-4"}`}>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              collapsed ? "max-h-[0px]" : "max-h-[1200px]"
            }`}
          >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {menu.map((group) => (
                <fieldset key={group.category} className="border-0 p-0">
                  <legend className="mb-[var(--spacing-8)] text-[length:var(--text-caption)] font-medium uppercase tracking-wide text-[color:var(--color-silver)]">
                    {group.category}
                  </legend>
                  <div className="flex flex-wrap gap-[var(--spacing-8)]">
                    {group.values.map((value) => {
                      const active = isSelected(draftSelection, group.category, value);
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            onSelectionChange(toggleValue(draftSelection, group.category, value))
                          }
                          className={`cursor-pointer rounded-[var(--radius-sm)] px-[var(--spacing-12)] py-[var(--spacing-8)] text-[length:var(--text-caption)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] ${
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
            </div>
          </div>

          {collapsed ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[var(--radius-2xl)] bg-gradient-to-b from-transparent to-[color:var(--color-deep-space)]"
            />
          ) : null}
        </div>

        {!collapsed ? (
          hasSelection(draftSelection) ? (
            <p className="mt-4 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
              Draft selection ready. Apply to refresh profiles first, then media.
            </p>
          ) : (
            <p className="mt-4 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
              No fulltext here. Build the result set from tags and choose strict AND or broader OR.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}
