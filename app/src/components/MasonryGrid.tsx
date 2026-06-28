"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_BATCH_SIZE,
  columnsForWidth,
  paginate,
  type PaginationResult,
} from "@/lib/masonry";
import { MediaCard, type MediaCardItem } from "./MediaCard";

/** Funkce načítající jednu dávku položek od daného kurzoru (0 = začátek). */
export type LoadPage = (
  cursor: number,
) => Promise<PaginationResult<MediaCardItem>>;

export interface MasonryGridProps {
  /**
   * Zdroj dávek. Musí být stabilní reference (např. `useMemo`/`useCallback`),
   * jinak se mřížka při každém renderu resetuje. Pro statický fond použij
   * `poolLoader`.
   */
  readonly loadPage: LoadPage;
  /** Volitelná akce při výběru karty. */
  readonly onSelect?: (item: MediaCardItem) => void;
}

type Status = "idle" | "loading" | "error" | "done";

/**
 * Postaví `LoadPage` nad statickým fondem položek pomocí čisté `paginate`
 * (R12.2/R12.6). Dávky mají velikost `MAX_BATCH_SIZE` (24). `delayMs` umožní
 * simulovat asynchronní načítání.
 */
export function poolLoader(
  items: readonly MediaCardItem[],
  delayMs = 0,
): LoadPage {
  return (cursor: number) =>
    new Promise((resolve) => {
      const result = paginate(items, MAX_BATCH_SIZE, cursor);
      if (delayMs > 0) {
        setTimeout(() => resolve(result), delayMs);
      } else {
        resolve(result);
      }
    });
}

/**
 * Responzivní masonry mřížka médií s nekonečným scrollem (R12).
 *
 * - Počet sloupců se odvodí z šířky kontejneru čistou `columnsForWidth`
 *   (1 / 2–4 / 5, R12.1).
 * - Donačítání spouští `IntersectionObserver` se `rootMargin` 600 px před
 *   koncem seznamu (R12.2); během načítání svítí indikátor (R12.4).
 * - Po vyčerpání dat se zobrazí indikace konce seznamu (R12.6).
 * - Při selhání dávky zůstanou již zobrazená média beze změny a nabídne se
 *   akce „Zkusit znovu" (R12.5).
 */
export function MasonryGrid({ loadPage, onSelect }: MasonryGridProps) {
  const [items, setItems] = useState<MediaCardItem[]>([]);
  const [columns, setColumns] = useState(1);
  const [status, setStatus] = useState<Status>("idle");

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number | null>(0);
  const loadingRef = useRef(false);
  const statusRef = useRef<Status>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const load = useCallback(async () => {
    const cursor = cursorRef.current;
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setStatus("loading");
    try {
      const page = await loadPage(cursor);
      // Dedupe podle id: v dev StrictMode se efekty spouští dvakrát a mohou
      // vzniknout dvě souběžná načtení stejné dávky (cursor 0) → duplicitní
      // klíče. Přidáme jen položky, které ještě nemáme.
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const fresh = page.items.filter((it) => !seen.has(it.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      cursorRef.current = page.nextCursor;
      setStatus(page.done ? "done" : "idle");
    } catch {
      // Zachová již zobrazená média; uživatel může akci zopakovat (R12.5).
      setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, [loadPage]);

  // Nový zdroj → reset a první dávka.
  useEffect(() => {
    setItems([]);
    cursorRef.current = 0;
    loadingRef.current = false;
    setStatus("idle");
    void load();
  }, [load]);

  // Počet sloupců podle šířky kontejneru (R12.1).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setColumns(columnsForWidth(el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Infinite scroll: donačti, když se sentinel přiblíží na 600 px (R12.2).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && statusRef.current === "idle") {
          void load();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [load]);

  return (
    <div ref={containerRef} className="w-full">
      <div
        style={{ columnCount: columns, columnGap: "var(--spacing-16)" }}
        aria-busy={status === "loading"}
      >
        {items.map((item) => (
          <div key={item.id} className="mb-4 break-inside-avoid">
            <MediaCard item={item} onSelect={onSelect} />
          </div>
        ))}
      </div>

      {status === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-3 py-6 text-[length:var(--text-caption)] text-[color:var(--color-silver)]"
        >
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--color-charcoal)] border-t-[color:var(--color-netflix-red)]"
          />
          Načítání…
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 py-6 text-[length:var(--text-body)] text-[color:var(--color-silver)]"
        >
          <p>Načtení dalšího obsahu se nezdařilo.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="cursor-pointer rounded-sm bg-[color:var(--color-netflix-red)] px-4 py-2 text-[length:var(--text-body)] font-medium text-[color:var(--color-chalk-white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {status === "done" && items.length > 0 && (
        <div className="py-6 text-center text-[length:var(--text-caption)] text-[color:var(--color-ash)]">
          To je vše.
        </div>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
    </div>
  );
}
