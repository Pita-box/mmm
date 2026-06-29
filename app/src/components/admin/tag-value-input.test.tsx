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
      onAdd={onAdd}
      onRemove={onRemove}
    />,
  );
  return { onAdd, onRemove, input: screen.getByLabelText("Štítky — Category") };
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

  it("čárka v řetězci přidá hotovou část hned, zbytek nechá v poli", () => {
    const { onAdd, input } = setup();
    fireEvent.change(input, { target: { value: "bear, grandpa" } });
    // „bear" je před čárkou → přidá se hned; „ grandpa" zůstává v draftu.
    expect(onAdd).toHaveBeenCalledWith(["bear"]);
  });

  it("klik na ✕ odebere hodnotu", () => {
    const { onRemove } = setup(["blonde"]);
    fireEvent.click(screen.getByLabelText("Odebrat blonde"));
    expect(onRemove).toHaveBeenCalledWith("blonde");
  });
});
