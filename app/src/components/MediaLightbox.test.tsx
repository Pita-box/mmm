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
    h.issueStreamingUrlAction.mockResolvedValue({
      ok: true,
      url: "/api/stream/fresh.token",
    });

    const { container } = render(
      <MediaLightbox item={photoItem()} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(h.issueStreamingUrlAction).toHaveBeenCalledWith("media-1");
    });

    const image = container.querySelector('img[draggable="false"]');
    expect(image).not.toBeNull();
    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("/api/stream/fresh.token");
    });
  });

  it("při chybě načtení fotky zkusí ještě jednou vydat novou stream URL", async () => {
    h.issueStreamingUrlAction
      .mockResolvedValueOnce({ ok: true, url: "/api/stream/fresh-1.token" })
      .mockResolvedValueOnce({ ok: true, url: "/api/stream/fresh-2.token" });

    const { container } = render(
      <MediaLightbox item={photoItem()} onClose={() => {}} />,
    );

    const image = await waitFor(() => {
      const node = container.querySelector('img[draggable="false"]');
      expect(node).not.toBeNull();
      return node as HTMLImageElement;
    });

    await waitFor(() => {
      expect(image.getAttribute("src")).toBe("/api/stream/fresh-1.token");
    });

    fireEvent.error(image);

    await waitFor(() => {
      expect(h.issueStreamingUrlAction).toHaveBeenCalledTimes(2);
      expect(image.getAttribute("src")).toBe("/api/stream/fresh-2.token");
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("prefetchne další 3 fotky v pořadí", async () => {
    h.issueStreamingUrlAction.mockResolvedValue({
      ok: true,
      url: "/api/stream/fresh.token",
    });
    h.issueStreamingUrlsAction.mockResolvedValue({
      ok: true,
      urls: {
        "media-2": "/api/stream/preload-2.token",
        "media-3": "/api/stream/preload-3.token",
        "media-4": "/api/stream/preload-4.token",
      },
    });

    render(
      <MediaLightbox
        item={photoItem()}
        sequence={[photoItem(), photoItem2(), photoItem3(), photoItem4()]}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(h.issueStreamingUrlsAction).toHaveBeenCalledWith([
        "media-2",
        "media-3",
        "media-4",
      ]);
    });

    await waitFor(() => {
      expect(h.preloadedSrcs).toEqual([
        "/api/stream/preload-2.token",
        "/api/stream/preload-3.token",
        "/api/stream/preload-4.token",
      ]);
    });
  });
});
