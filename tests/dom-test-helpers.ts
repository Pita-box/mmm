/**
 * Globální setup pro komponentní testy.
 *
 * - Registruje DOM matchery z `@testing-library/jest-dom` (např. `toBeInTheDocument`).
 * - Po každém testu uklidí vykreslený strom (`cleanup`), aby se renderování
 *   neprolínalo mezi testy (vitest config nemá zapnuté `globals`, proto
 *   `afterEach` importujeme explicitně).
 * - Polyfilluje prohlížečová API (`ResizeObserver`, `IntersectionObserver`,
 *   `matchMedia`), která jsdom nemá, ale některé komponenty (MasonryGrid) je
 *   používají při montáži.
 *
 * Importuje se na začátku každého komponentního testu (soubor s direktivou
 * `// @vitest-environment jsdom`). Záměrně NENÍ globální `setupFiles`, aby se
 * `@testing-library/react` nenačítal v node prostředí existujících testů —
 * ty tak fungují beze změny.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

// ─── Polyfilly prohlížečových API chybějících v jsdom ─────────────────────────

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const g = globalThis as unknown as {
  ResizeObserver?: unknown;
  IntersectionObserver?: unknown;
  matchMedia?: unknown;
};

g.ResizeObserver ??= ResizeObserverStub;
g.IntersectionObserver ??= IntersectionObserverStub;

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
