// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../tests/dom-test-helpers";
import { FilterBar } from "./FilterBar";
import { SearchBrowser, type SearchMediaItem } from "./SearchBrowser";
import type { FilterCategoryMenu } from "@/services/filter-service";

/**
 * Komponentní testy stránky Search (R11.8): vyhledávání probíhá výhradně
 * kombinací filtrů — na stránce NESMÍ být žádné fulltextové/textové pole.
 */

const menu: readonly FilterCategoryMenu[] = [
  { category: "Category", values: ["Portrét", "Krajina"] },
  { category: "Hair color", values: ["Černá"] },
];

/** Najde všechny prvky, které by představovaly fulltextové pole. */
function freeTextInputs(container: HTMLElement): Element[] {
  return Array.from(
    container.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type]), textarea',
    ),
  );
}

describe("FilterBar (R11.8 — žádný fulltext)", () => {
  it("vykreslí filtrovací chips pro každou kategorii a hodnotu", () => {
    render(<FilterBar menu={menu} selection={{}} onChange={() => {}} />);

    // Chips jsou toggle buttony s aria-pressed.
    expect(
      screen.getByRole("button", { name: "Portrét", pressed: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Krajina", pressed: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Černá", pressed: false }),
    ).toBeInTheDocument();
  });

  it("neobsahuje žádné textové/vyhledávací pole ani textbox/searchbox roli", () => {
    const { container } = render(
      <FilterBar menu={menu} selection={{}} onChange={() => {}} />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(freeTextInputs(container)).toHaveLength(0);
  });
});

describe("SearchBrowser (R11.8 — žádný fulltext)", () => {
  const pool: readonly SearchMediaItem[] = [
    {
      id: "m1",
      modelId: "model-1",
      mediaType: "photo",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      status: "published",
      publishAt: new Date(0),
      width: 800,
      height: 600,
      createdAt: new Date(0),
      tags: [{ category: "Category", value: "Portrét" }],
    },
  ];

  it("nezobrazuje fulltextové pole, ani když jsou k dispozici výsledky", () => {
    const { container } = render(<SearchBrowser pool={pool} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(freeTextInputs(container)).toHaveLength(0);
  });

  it("nezobrazuje fulltextové pole ani v prázdném stavu výsledků", () => {
    // Prázdný fond → prázdný stav, stále bez textového pole.
    const { container } = render(<SearchBrowser pool={[]} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(freeTextInputs(container)).toHaveLength(0);
  });
});
