// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../tests/dom-test-helpers";
import { Carousel } from "./Carousel";
import type { MediaCardItem } from "./MediaCard";

function photoItem(id: string): MediaCardItem {
  return {
    id,
    modelId: "model-1",
    mediaType: "photo",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    status: "published",
    publishAt: new Date(0),
    width: 1200,
    height: 1600,
    createdAt: new Date(0),
    posterUrl: `/api/thumb/${id}`,
    title: "Model One",
    tags: [],
  };
}

describe("Carousel", () => {
  it("omezuje modelovou řadu na 5 médií a poslední CTA View more", () => {
    const media = Array.from({ length: 7 }, (_, index) => photoItem(`media-${index + 1}`));
    const { container } = render(
      <Carousel title="Model One" href="/models/model-1" media={media} onSelect={() => {}} />,
    );

    expect(container.querySelectorAll('button[aria-label="Photo"]')).toHaveLength(5);
    expect(screen.getByText("View more")).toBeInTheDocument();
  });

  it("u krátké řady CTA nepřidává", () => {
    const media = Array.from({ length: 5 }, (_, index) => photoItem(`media-${index + 1}`));
    const { container } = render(
      <Carousel title="Model One" href="/models/model-1" media={media} onSelect={() => {}} />,
    );

    expect(container.querySelectorAll('button[aria-label="Photo"]')).toHaveLength(5);
    expect(screen.queryByText("View more")).toBeNull();
  });
});
