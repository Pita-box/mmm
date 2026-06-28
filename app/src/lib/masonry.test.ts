import { describe, it, expect } from "vitest";
import {
  columnsForWidth,
  paginate,
  MAX_BATCH_SIZE,
} from "./masonry";

describe("columnsForWidth (R12.1)", () => {
  it("vrací 1 sloupec pro šířku do 600 px včetně hranice", () => {
    expect(columnsForWidth(0)).toBe(1);
    expect(columnsForWidth(320)).toBe(1);
    expect(columnsForWidth(600)).toBe(1);
  });

  it("vrací 2–4 sloupce pro pásmo 600–1200 px", () => {
    expect(columnsForWidth(601)).toBe(2);
    expect(columnsForWidth(800)).toBe(2);
    expect(columnsForWidth(801)).toBe(3);
    expect(columnsForWidth(1000)).toBe(3);
    expect(columnsForWidth(1001)).toBe(4);
    expect(columnsForWidth(1200)).toBe(4);
  });

  it("vrací 5 sloupců pro šířku nad 1200 px", () => {
    expect(columnsForWidth(1201)).toBe(5);
    expect(columnsForWidth(2560)).toBe(5);
  });

  it("nezáporné i záporné/nulové šířky spadají do 1 sloupce", () => {
    expect(columnsForWidth(-100)).toBe(1);
  });
});

describe("paginate (R12.2, R12.6)", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it("vrátí první dávku a kurzor na další položku", () => {
    const page = paginate(items, 24, 0);
    expect(page.items).toEqual(items.slice(0, 24));
    expect(page.nextCursor).toBe(24);
    expect(page.done).toBe(false);
  });

  it("nikdy nevrátí víc než 24 položek (clamp velikosti dávky)", () => {
    const page = paginate(items, 1000, 0);
    expect(page.items).toHaveLength(MAX_BATCH_SIZE);
  });

  it("poslední dávka signalizuje konec", () => {
    const page = paginate(items, 24, 48);
    expect(page.items).toEqual([48, 49]);
    expect(page.nextCursor).toBeNull();
    expect(page.done).toBe(true);
  });

  it("postupné donačítání pokryje celou množinu bez duplicit a mezer", () => {
    const collected: number[] = [];
    let cursor: number | null = 0;
    let guard = 0;
    while (cursor !== null && guard++ < 1000) {
      const page: ReturnType<typeof paginate<number>> = paginate(items, 24, cursor);
      collected.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(collected).toEqual(items);
    expect(new Set(collected).size).toBe(items.length);
  });

  it("prázdná množina je rovnou hotová", () => {
    const page = paginate([], 24, 0);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.done).toBe(true);
  });

  it("kurzor za koncem vrátí prázdnou hotovou dávku", () => {
    const page = paginate(items, 24, 999);
    expect(page.items).toEqual([]);
    expect(page.done).toBe(true);
  });
});
