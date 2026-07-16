// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../../tests/dom-test-helpers";
import { MediaEditPanel } from "./media-edit-panel";

describe("MediaEditPanel", () => {
  it("starts with the current model and existing tags", () => {
    render(
      <MediaEditPanel
        mediaId="media-1"
        currentModelId="model-1"
        models={[{ id: "model-1", name: "Alice" }]}
        tags={[{ id: "tag-1", category: "Hair color", value: "blonde" }]}
        tagSuggestions={{ "Hair color": ["blonde", "brunette"] }}
        onAssignModel={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Model")).toHaveValue("model-1");
    expect(screen.getByText("blonde")).toBeInTheDocument();
  });
});
