// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    render(
      <FilterBar
        menu={menu}
        draftSelection={{ Category: ["Portrét"] }}
        appliedSelection={{}}
        draftMode="and"
        appliedMode="and"
        onSelectionChange={() => {}}
        onModeChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
        profileCount={0}
        mediaCount={0}
      />,
    );

    // Chips jsou toggle buttony s aria-pressed.
    expect(
      screen.getByRole("button", { name: "Portrét", pressed: true }),
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
      <FilterBar
        menu={menu}
        draftSelection={{}}
        appliedSelection={{}}
        draftMode="and"
        appliedMode="and"
        onSelectionChange={() => {}}
        onModeChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
        profileCount={0}
        mediaCount={0}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(freeTextInputs(container)).toHaveLength(0);
  });

  it("aplikuje filtry až po kliknutí na Filter", () => {
    let applied = 0;
    render(
      <FilterBar
        menu={menu}
        draftSelection={{ Category: ["Portrét"] }}
        appliedSelection={{}}
        draftMode="and"
        appliedMode="and"
        onSelectionChange={() => {}}
        onModeChange={() => {}}
        onApply={() => {
          applied += 1;
        }}
        onReset={() => {}}
        profileCount={0}
        mediaCount={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(applied).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(applied).toBe(1);
  });

  it("při interakci v collapsed stavu panel automaticky rozbalí", () => {
    const onSelectionChange = vi.fn();
    render(
      <FilterBar
        menu={menu}
        draftSelection={{}}
        appliedSelection={{}}
        draftMode="and"
        appliedMode="and"
        onSelectionChange={onSelectionChange}
        onModeChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
        profileCount={0}
        mediaCount={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Portrét", pressed: false }));

    expect(onSelectionChange).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
  });

  it("tlačítko Expand v collapsed stavu panel skutečně rozbalí", () => {
    render(
      <FilterBar
        menu={menu}
        draftSelection={{}}
        appliedSelection={{}}
        draftMode="and"
        appliedMode="and"
        onSelectionChange={() => {}}
        onModeChange={() => {}}
        onApply={() => {}}
        onReset={() => {}}
        profileCount={0}
        mediaCount={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
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
      title: "Model One",
      posterUrl: "/api/thumb/one",
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
