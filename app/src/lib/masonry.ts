/**
 * Masonry layout a stránkování — čisté (I/O-prosté) funkce přímo testovatelné
 * property-based testy (Property 29, Property 30).
 *
 * Tyto funkce neobsahují žádné DOM ani síťové detaily; UI komponenty
 * (`MasonryGrid`, infinite scroll) je pouze konzumují.
 */

/** Hranice šířky viewportu pro počet sloupců (R12.1). */
export const SMALL_BREAKPOINT = 600;
export const LARGE_BREAKPOINT = 1200;

/** Maximální velikost jedné dávky donačítání (R12.2). */
export const MAX_BATCH_SIZE = 24;

/**
 * Vrátí počet sloupců masonry mřížky podle šířky viewportu (R12.1, Property 29):
 *
 *   - šířka ≤ 600 px            → 1 sloupec
 *   - 600 px < šířka ≤ 1200 px  → 2 až 4 sloupce (deterministické dělení po 200 px)
 *   - šířka > 1200 px           → 5 sloupců
 *
 * Prostřední pásmo (600–1200) je rozděleno na tři stejné třetiny:
 *   (600, 800] → 2, (800, 1000] → 3, (1000, 1200] → 4.
 *
 * Nezáporná i nulová/záporná šířka spadá do prvního pásma (1 sloupec).
 */
export function columnsForWidth(width: number): number {
  if (width <= SMALL_BREAKPOINT) return 1;
  if (width > LARGE_BREAKPOINT) return 5;
  // width ∈ (600, 1200] → 2..4 podle třetin po 200 px
  if (width <= 800) return 2;
  if (width <= 1000) return 3;
  return 4;
}

/** Výsledek jednoho kroku stránkování. */
export interface PaginationResult<T> {
  /** Položky aktuální dávky (nejvýše `MAX_BATCH_SIZE`). */
  readonly items: readonly T[];
  /** Offset pro další dávku, nebo `null`, jsou-li data vyčerpána. */
  readonly nextCursor: number | null;
  /** `true`, když po této dávce už nejsou další data (indikace konce). */
  readonly done: boolean;
}

/**
 * Vrátí jednu dávku položek od pozice `cursor` (R12.2, R12.6, Property 30).
 *
 * Postupné volání s vraceným `nextCursor` (počínaje 0) pokryje celou množinu
 * `items` bez duplicit a bez mezer; každá dávka má nejvýše `min(batchSize, 24)`
 * položek a po vyčerpání dat je `nextCursor === null` a `done === true`.
 *
 * `batchSize` je sevřen do rozsahu 1..24; `cursor` je sevřen na ≥ 0.
 */
export function paginate<T>(
  items: readonly T[],
  batchSize: number,
  cursor: number,
): PaginationResult<T> {
  const size = clampBatchSize(batchSize);
  const start = Math.max(0, Math.trunc(cursor));
  const end = Math.min(items.length, start + size);

  const batch = items.slice(start, end);
  const hasMore = end < items.length;

  return {
    items: batch,
    nextCursor: hasMore ? end : null,
    done: !hasMore,
  };
}

/** Sevře velikost dávky na celé číslo v rozsahu 1..MAX_BATCH_SIZE. */
function clampBatchSize(batchSize: number): number {
  if (!Number.isFinite(batchSize)) return MAX_BATCH_SIZE;
  const truncated = Math.trunc(batchSize);
  if (truncated < 1) return 1;
  if (truncated > MAX_BATCH_SIZE) return MAX_BATCH_SIZE;
  return truncated;
}
