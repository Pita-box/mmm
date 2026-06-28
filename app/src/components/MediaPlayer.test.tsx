// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "../../tests/dom-test-helpers";
import { MediaPlayer } from "./MediaPlayer";
import { DRIVE_DOMAINS } from "@/lib/drive-domains";

/**
 * Komponentní testy MediaPlayer (R6.3, R6.6):
 *  - přehrává výhradně přes proxy Streaming_URL (`/api/stream/<token>`),
 *  - `src` nikdy neobsahuje doménu Google Drive (trvalý odkaz se odmítne),
 *  - vlastní ovládání = žádný nativní `controls`, s `nodownload` (anti-download).
 */
const PROXY_URL = "/api/stream/abc.def";

describe("MediaPlayer (R6.6 — vlastní přehrávač přes proxy)", () => {
  it("vykreslí <video> se src na proxy Streaming_URL", () => {
    const { container } = render(<MediaPlayer src={PROXY_URL} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe(PROXY_URL);
  });

  it("používá vlastní ovládání (žádný nativní controls) s nodownload", () => {
    const { container } = render(<MediaPlayer src={PROXY_URL} />);
    const video = container.querySelector("video");
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(video?.getAttribute("controlslist") ?? "").toContain("nodownload");
  });
});

describe("MediaPlayer (R6.3 — nikdy trvalý odkaz na Google Drive)", () => {
  it("src na proxy neobsahuje žádnou doménu Drive", () => {
    const { container } = render(<MediaPlayer src={PROXY_URL} />);
    const src = container.querySelector("video")?.getAttribute("src") ?? "";
    for (const domain of DRIVE_DOMAINS) {
      expect(src.toLowerCase()).not.toContain(domain);
    }
  });

  it("trvalý odkaz na Drive odmítne (nevykreslí <video>)", () => {
    const driveLink = "https://drive.google.com/uc?id=secret";
    const { container } = render(<MediaPlayer src={driveLink} />);
    expect(container.querySelector("video")).toBeNull();
  });
});
