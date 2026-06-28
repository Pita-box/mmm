/**
 * Filter_Service — aplikace chytrých filtrů a sestavení nabídky filtrů (task 12.1).
 *
 * Vyhledávání v MMMRED probíhá výhradně přes kombinaci multi-select filtrů nad
 * pevnými kategoriemi štítků (žádný fulltext). Tento modul obsahuje **čisté
 * funkce** bez I/O — deterministické a přímo testovatelné generátory (PBT tasky
 * 12.2–12.3):
 *
 *   - `apply`           — vyhodnotí výběr filtrů nad množinou médií.
 *   - `buildFilterMenu` — sestaví nabídku kategorií a hodnot pro stránku Search.
 *
 * Sémantika `apply` (R11.3–R11.5):
 *   - OR uvnitř kategorie:     médium projde kategorií, odpovídá-li alespoň jedné
 *                              z vybraných hodnot dané kategorie.
 *   - AND napříč kategoriemi:  médium musí projít všemi kategoriemi, které mají
 *                              neprázdný výběr.
 *   - prázdný výběr:           vrátí se všechna Approved_Media.
 *
 * Filtruje se vždy jen nad Approved_Media (R11.3–R11.5) — využívá `visibleMedia`
 * z Media_Service, takže invariant viditelnosti je sdílený a nikdy se nezduplikuje.
 *
 * Porovnání hodnot je bez ohledu na velikost písmen a okolní mezery (shodně s
 * normalizací štítků dle schématu: trim + lower), aby výběr z nabídky vždy
 * odpovídal uloženým štítkům média.
 */
import type { TagCategory } from "@/lib/domain";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { visibleMedia, type MediaItemView } from "./media-service";

// ─── Pomocné typy ──────────────────────────────────────────────────────────────

/** Jeden štítek média: kategorie + (nenormalizovaná) hodnota. */
export interface MediaTagView {
  readonly category: TagCategory;
  readonly value: string;
}

/**
 * Strukturální minimum média pro filtrování — stav/čas zveřejnění (pro invariant
 * viditelnosti) a jeho štítky. Rozšiřuje `MediaItemView`, takže je kompatibilní
 * s `visibleMedia`.
 */
export interface FilterableMediaView extends MediaItemView {
  readonly tags: readonly MediaTagView[];
}

/**
 * Výběr filtrů: pro každou kategorii pole vybraných hodnot. Kategorie bez výběru
 * mohou být vynechány nebo mít prázdné pole — obojí znamená „bez omezení".
 */
export type FilterSelection = Partial<Record<TagCategory, readonly string[]>>;

/** Hodnota štítku tak, jak ji eviduje Tag_Service / DB (pro nabídku filtrů). */
export interface TagValueView {
  readonly category: TagCategory;
  readonly value: string;
}

/** Jedna položka nabídky filtrů: kategorie a všechny její aktuální hodnoty. */
export interface FilterCategoryMenu {
  readonly category: TagCategory;
  readonly values: string[];
}

// ─── Normalizace ────────────────────────────────────────────────────────────────

/** Trim + lower; shodné s `normalizedValue` štítků (case-insensitive porovnání). */
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

// ─── Aplikace filtrů ─────────────────────────────────────────────────────────────

/**
 * Vyhodnotí výběr filtrů nad množinou médií (R11.3–R11.5).
 *
 * Nejprve se množina zúží na Approved_Media (`visibleMedia`). Kategorie s
 * neprázdným výběrem jsou „aktivní"; médium projde právě tehdy, když pro každou
 * aktivní kategorii má alespoň jeden štítek, jehož hodnota patří mezi vybrané
 * (OR uvnitř kategorie, AND napříč kategoriemi). Není-li aktivní žádná kategorie
 * (prázdný výběr), vrátí se všechna Approved_Media.
 *
 * Vstupní pool se nemutuje; pořadí výstupu odpovídá pořadí v poolu.
 */
export function apply<T extends FilterableMediaView>(
  selection: FilterSelection,
  pool: readonly T[],
  now: Date,
): T[] {
  const approved = visibleMedia(pool, now);

  const activeCategories = FIXED_CATEGORIES.filter(
    (category) => (selection[category]?.length ?? 0) > 0,
  );
  if (activeCategories.length === 0) return approved;

  // Předpočítáme normalizované množiny vybraných hodnot pro každou aktivní kategorii.
  const selectedByCategory = new Map<TagCategory, Set<string>>(
    activeCategories.map((category) => [
      category,
      new Set((selection[category] ?? []).map(normalizeTag)),
    ]),
  );

  return approved.filter((media) =>
    activeCategories.every((category) => {
      const selected = selectedByCategory.get(category)!;
      return media.tags.some(
        (tag) => tag.category === category && selected.has(normalizeTag(tag.value)),
      );
    }),
  );
}

// ─── Nabídka filtrů ──────────────────────────────────────────────────────────────

/**
 * Sestaví nabídku filtrů ze sady hodnot štítků (R11.1, R11.2).
 *
 * Zobrazí právě ty kategorie, které mají alespoň jednu hodnotu, a u každé uvede
 * všechny její aktuální hodnoty; kategorie bez hodnot se vynechají. Kategorie se
 * řadí dle kanonického pořadí `FIXED_CATEGORIES`; hodnoty se deduplikují
 * (case-insensitive) a zachovávají pořadí prvního výskytu.
 */
export function buildFilterMenu(
  tagValues: readonly TagValueView[],
): FilterCategoryMenu[] {
  return FIXED_CATEGORIES.flatMap((category) => {
    const values: string[] = [];
    const seen = new Set<string>();
    for (const tv of tagValues) {
      if (tv.category !== category) continue;
      const key = normalizeTag(tv.value);
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(tv.value);
    }
    return values.length > 0 ? [{ category, values }] : [];
  });
}
