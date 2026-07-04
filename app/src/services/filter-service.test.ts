import { describe, it, expect } from "vitest";
import {
  apply,
  buildFilterMenu,
  type FilterMode,
  type FilterableMediaView,
  type MediaTagView,
  type TagValueView,
} from "./filter-service";

const at = (iso: string): Date => new Date(iso);
const NOW = at("2026-06-01T12:00:00.000Z");
const PAST = at("2026-06-01T11:00:00.000Z");
const FUTURE = at("2026-06-01T13:00:00.000Z");

const media = (
  status: FilterableMediaView["status"],
  publishAt: Date | null,
  tags: MediaTagView[],
): FilterableMediaView => ({ status, publishAt, tags });

const approved = (tags: MediaTagView[]): FilterableMediaView =>
  media("published", PAST, tags);

describe("apply", () => {
  it("returns all Approved_Media when the selection is empty", () => {
    const pool = [
      approved([{ category: "Hair color", value: "blonde" }]),
      approved([{ category: "Hair color", value: "brown" }]),
    ];
    expect(apply({}, pool, NOW)).toHaveLength(2);
  });

  it("treats empty-array categories as no constraint", () => {
    const pool = [approved([{ category: "Clothes", value: "dress" }])];
    expect(apply({ Clothes: [] }, pool, NOW)).toHaveLength(1);
  });

  it("excludes non-Approved_Media regardless of tag match", () => {
    const tag: MediaTagView = { category: "Hair color", value: "blonde" };
    const pool = [
      approved([tag]),
      media("scheduled", PAST, [tag]),
      media("hidden", PAST, [tag]),
      media("published", FUTURE, [tag]),
      media("published", null, [tag]),
    ];
    const result = apply({ "Hair color": ["blonde"] }, pool, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("published");
    expect(result[0].publishAt).toBe(PAST);
  });

  it("applies OR within a single category", () => {
    const blonde = approved([{ category: "Hair color", value: "blonde" }]);
    const brown = approved([{ category: "Hair color", value: "brown" }]);
    const black = approved([{ category: "Hair color", value: "black" }]);
    const result = apply(
      { "Hair color": ["blonde", "brown"] },
      [blonde, brown, black],
      NOW,
    );
    expect(result).toEqual([blonde, brown]);
  });

  it("applies AND across categories", () => {
    const match = approved([
      { category: "Hair color", value: "blonde" },
      { category: "Clothes", value: "dress" },
    ]);
    const onlyHair = approved([{ category: "Hair color", value: "blonde" }]);
    const onlyClothes = approved([{ category: "Clothes", value: "dress" }]);
    const result = apply(
      { "Hair color": ["blonde"], Clothes: ["dress"] },
      [match, onlyHair, onlyClothes],
      NOW,
    );
    expect(result).toEqual([match]);
  });

  it("supports OR across categories when requested", () => {
    const matchHair = approved([{ category: "Hair color", value: "blonde" }]);
    const matchClothes = approved([{ category: "Clothes", value: "dress" }]);
    const noMatch = approved([{ category: "Body type", value: "athletic" }]);
    const result = apply(
      { "Hair color": ["blonde"], Clothes: ["dress"] },
      [matchHair, matchClothes, noMatch],
      NOW,
      "or" satisfies FilterMode,
    );
    expect(result).toEqual([matchHair, matchClothes]);
  });

  it("matches values case- and whitespace-insensitively", () => {
    const m = approved([{ category: "Body type", value: "Athletic" }]);
    expect(apply({ "Body type": ["  athletic "] }, [m], NOW)).toEqual([m]);
  });

  it("does not mutate the input pool and preserves pool order", () => {
    const a = approved([{ category: "Category", value: "x" }]);
    const b = approved([{ category: "Category", value: "x" }]);
    const pool = [a, b];
    apply({ Category: ["x"] }, pool, NOW);
    expect(pool).toEqual([a, b]);
  });
});

describe("buildFilterMenu", () => {
  it("shows only categories that have at least one value", () => {
    const tagValues: TagValueView[] = [
      { category: "Hair color", value: "blonde" },
      { category: "Clothes", value: "dress" },
    ];
    const menu = buildFilterMenu(tagValues);
    expect(menu.map((m) => m.category)).toEqual(["Hair color", "Clothes"]);
  });

  it("lists all current values of a category in the fixed order", () => {
    const tagValues: TagValueView[] = [
      { category: "Clothes", value: "dress" },
      { category: "Hair color", value: "blonde" },
      { category: "Hair color", value: "brown" },
    ];
    const menu = buildFilterMenu(tagValues);
    // Kanonické pořadí kategorií: Hair color před Clothes.
    expect(menu).toEqual([
      { category: "Hair color", values: ["blonde", "brown"] },
      { category: "Clothes", values: ["dress"] },
    ]);
  });

  it("deduplicates values case-insensitively, keeping first appearance", () => {
    const tagValues: TagValueView[] = [
      { category: "Face type", value: "Round" },
      { category: "Face type", value: "round" },
      { category: "Face type", value: "ROUND" },
    ];
    expect(buildFilterMenu(tagValues)).toEqual([
      { category: "Face type", values: ["Round"] },
    ]);
  });

  it("returns an empty menu when there are no values", () => {
    expect(buildFilterMenu([])).toEqual([]);
  });
});
