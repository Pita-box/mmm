// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../../tests/dom-test-helpers";
import { TagValueInput } from "./tag-value-input";

/** Plán 014: sdílený štítkový vstup — Enter/čárka přidá, ✕ odebere. */

function setup(values: string[] = []) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <TagValueInput
      label="Category"
      listId="t"
      values={values}
      suggestions={["bear", "beach", "blonde"]}
      onAdd={onAdd}
      onRemove={onRemove}
    />,
  );
  return { onAdd, onRemove, input: screen.getByLabelText("Tags — Category") };
}

describe("TagValueInput", () => {
  it("čárka při psaní přidá hotovou hodnotu", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "daddy," } });
    expect(onAdd).toHaveBeenCalledWith(["daddy"]);
  });

  it("Enter přidá aktuální hodnotu", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "bear" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(["bear"]);
  });

  it("Enter vezme první odpovídající našeptaný štítek", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "bea" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(["bear"]);
    expect(input).not.toHaveAttribute("list");
  });

  it("po dalším psaní znovu zapne našeptávač", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "bea" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "bl" } });
    expect(input).toHaveAttribute("list", "t");
  });

  it("když nic neodpovídá, Enter uloží napsanou hodnotu", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "custom-tag" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(["custom-tag"]);
  });

  it("čárka v řetězci přidá hotovou část hned, zbytek nechá v poli", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "bear, grandpa" } });
    // „bear" je před čárkou → přidá se hned; „ grandpa" zůstává v draftu.
    expect(onAdd).toHaveBeenCalledWith(["bear"]);
  });

  it("klik na ✕ odebere hodnotu", () => {
    const { onRemove } = setup(["blonde"]);
    fireEvent.click(screen.getByLabelText("Remove blonde"));
    expect(onRemove).toHaveBeenCalledWith("blonde");
  });
});
