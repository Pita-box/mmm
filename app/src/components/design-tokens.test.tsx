// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "../../tests/dom-test-helpers";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { NotificationBanner } from "./NotificationBanner";

/**
 * Token/snapshot kontrola Netflix design systému (skill `design-system-netflix`).
 *
 * Klíčové komponenty musí používat sdílené design tokeny: akcent `netflix-red`,
 * tmavé pozadí `deep-space` a zaoblení `rounded-2xl`. Test ověřuje přítomnost
 * těchto tříd ve vykresleném HTML a drží snapshot, aby se vizuální kontrakt
 * neměnil nechtěně.
 */

const videoItem: MediaCardItem = {
  id: "card-1",
  modelId: "model-1",
  mediaType: "video",
  mimeType: "video/mp4",
  sizeBytes: 2048,
  status: "published",
  publishAt: new Date(0),
  width: 1600,
  height: 900,
  createdAt: new Date(0),
  title: "Ukázkové video",
  tags: ["Portrét"],
};

describe("Netflix design tokeny", () => {
  it("MediaCard používá tokeny rounded-2xl, netflix-red a deep-space", () => {
    const { container } = render(
      <MediaCard item={videoItem} onSelect={() => {}} />,
    );
    const html = container.innerHTML;

    expect(html).toContain("rounded-2xl");
    expect(html).toContain("--color-netflix-red");
    expect(html).toContain("--color-deep-space");
  });

  it("NotificationBanner používá akcent netflix-red", () => {
    const { container } = render(<NotificationBanner text="Vítejte v MMMRED" />);
    expect(container.innerHTML).toContain("--color-netflix-red");
  });

  it("odpovídá uloženému snapshotu (MediaCard)", () => {
    const { container } = render(<MediaCard item={videoItem} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("odpovídá uloženému snapshotu (NotificationBanner)", () => {
    const { container } = render(<NotificationBanner text="Vítejte v MMMRED" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
