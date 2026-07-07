// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "../../tests/dom-test-helpers";

const h = vi.hoisted(() => ({
  issueStreamingUrlAction: vi.fn(),
  issueStreamingUrlsAction: vi.fn(),
  preloadedSrcs: [] as string[],
}));

vi.mock("./MediaPlayer", () => ({
  MediaPlayer: ({ src }: { src: string }) => <div data-testid="video-player" data-src={src} />,
}));

vi.mock("./admin/media-edit-panel", () => ({
  MediaEditPanel: () => <div data-testid="media-edit-panel" />,
}));

vi.mock("./SystemToast", () => ({
  SystemToast: ({ message }: { message: string | null }) =>
    message ? <div role="status">{message}</div> : null,
}));

vi.mock("@/app/(app)/admin/admin-actions", () => ({
  assignMediaModelAction: vi.fn(),
  addMediaTagAction: vi.fn(),
  removeMediaTagAction: vi.fn(),
  setMediaPublishedAction: vi.fn(),
  deleteMediaAction: vi.fn(),
  uploadPosterAction: vi.fn(),
  setMediaPosterAction: vi.fn(),
}));

vi.mock("@/app/(app)/media-actions", () => ({
  issueStreamingUrlAction: h.issueStreamingUrlAction,
  issueStreamingUrlsAction: h.issueStreamingUrlsAction,
}));

import { MediaLightbox } from "./MediaLightbox";
import type { MediaCardItem } from "./MediaCard";

function photoItem(): MediaCardItem {
  return {
    id: "media-1",
    modelId: "model-1",
    mediaType: "photo",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    status: "published",
    publishAt: new Date(0),
    width: 1200,
    height: 800,
    createdAt: new Date(0),
    thumbnailUrl: "/api/stream/stale.token",
    posterUrl: "/api/thumb/thumb.token",
    title: "Model",
    tags: [],
  };
}

function photoItem2(): MediaCardItem {
  return { ...photoItem(), id: "media-2", thumbnailUrl: "/api/stream/stale-2.token" };
}

function photoItem3(): MediaCardItem {
  return { ...photoItem(), id: "media-3", thumbnailUrl: "/api/stream/stale-3.token" };
}

function photoItem4(): MediaCardItem {
  return { ...photoItem(), id: "media-4", thumbnailUrl: "/api/stream/stale-4.token" };
}

describe("MediaLightbox", () => {
  beforeEach(() => {
    h.issueStreamingUrlAction.mockReset();
    h.issueStreamingUrlsAction.mockReset();
    h.issueStreamingUrlsAction.mockResolvedValue({ ok: true, urls: {} });
    h.preloadedSrcs = [];

    class ImageStub {
      decoding = "";

      set src(value: string) {
        h.preloadedSrcs.push(value);
      }
    }

    vi.stubGlobal("Image", ImageStub);
  });

  it("při otevření média nahradí stale stream URL čerstvou", async () => {
    const { container } = render(
      <MediaLightbox item={photoItem()} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(h.issueStreamingUrlAction).not.toHaveBeenCalled();
    });

    const image = container.querySelector('img[draggable="false"]');
    expect(image).not.toBeNull();
    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("/api/thumb/thumb.token?size=2048");
    });
  });

  it("při chybě načtení fotky zkusí ještě jednou vydat novou stream URL", async () => {
    h.issueStreamingUrlAction
      .mockResolvedValueOnce({ ok: true, url: "/api/thumb/fresh-2.token?size=2048" });

    const { container } = render(
      <MediaLightbox item={photoItem()} onClose={() => {}} />,
    );

    const image = await waitFor(() => {
      const node = container.querySelector('img[draggable="false"]');
      expect(node).not.toBeNull();
      return node as HTMLImageElement;
    });

    await waitFor(() => {
      expect(image.getAttribute("src")).toBe("/api/thumb/thumb.token?size=2048");
    });

    fireEvent.error(image);

    await waitFor(() => {
      expect(h.issueStreamingUrlAction).toHaveBeenCalledTimes(1);
      expect(image.getAttribute("src")).toBe("/api/thumb/fresh-2.token?size=2048");
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("prefetchne další 3 fotky v pořadí", async () => {
    render(
      <MediaLightbox
        item={photoItem()}
        sequence={[photoItem(), photoItem2(), photoItem3(), photoItem4()]}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(h.issueStreamingUrlsAction).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(h.preloadedSrcs).toEqual([
        "/api/thumb/thumb.token?size=2048",
        "/api/thumb/thumb.token?size=2048",
        "/api/thumb/thumb.token?size=2048",
      ]);
    });
  });
});
