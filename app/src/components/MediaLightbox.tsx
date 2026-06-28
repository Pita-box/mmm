"use client";

/**
 * MediaLightbox — celoobrazovkový prohlížeč jednoho média (R6.6).
 *
 * Otevře se výběrem karty / „Watch" v heru a zobrazí médium přes proxy
 * `Streaming_URL` (`item.thumbnailUrl` = `/api/stream/<token>`); trvalý odkaz na
 * Drive se nikdy nepoužije (R6.3/6.4 — defenzivní kontrola `isDriveLink`).
 *
 * Layout (inspirace Pinterest): médium vycentrované v přirozeném poměru (fit do
 * viewportu, `object-contain`), za ním rozmazaná zvětšená kopie téhož obrázku
 * jako ambient pozadí, zavírací „X" vlevo nahoře. Zavírá Esc / klik na pozadí /
 * tlačítko; po dobu otevření zamkne scroll. Stav (které médium) drží rodič.
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";
import { MediaPlayer } from "./MediaPlayer";
import { DRIVE_DOMAINS } from "@/lib/drive-domains";

export interface MediaLightboxProps {
  /** Vybrané médium k zobrazení, nebo `null` (zavřeno). */
  readonly item: MediaCardItem | null;
  /** Zavření prohlížeče. */
  readonly onClose: () => void;
}

/** Velikostní limit média ve viewportu (fit) — výška i šířka. */
const FIT = "max-h-[88vh] max-w-[92vw]";

/** Trvalý odkaz na Google Drive se nikdy nezobrazuje (R6.4). */
function isDriveLink(url: string): boolean {
  const lowered = url.toLowerCase();
  return DRIVE_DOMAINS.some((domain) => lowered.includes(domain));
}

export function MediaLightbox({ item, onClose }: MediaLightboxProps) {
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const url = item.thumbnailUrl ?? "";
  const safe = url.length > 0 && !isDriveLink(url);
  const isVideo = item.mediaType === "video";
  const mediaShadow = { boxShadow: "0 10px 50px rgba(0, 0, 0, 0.6)" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prohlížeč média"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[color:var(--color-deep-space)]/80 p-4 sm:p-8"
    >
      {/* Ambient: rozmazaná zvětšená kopie obrázku (jen foto). */}
      {safe && !isVideo && (
        // eslint-disable-next-line @next/next/no-img-element -- proxy Streaming_URL, ne next/image
        <img
          src={url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
        />
      )}
      {/* Ztmavení ambientu pro kontrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color:var(--color-deep-space)]/40"
      />

      {/* Zavřít — vlevo nahoře (glass). */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít prohlížeč"
        style={{
          borderColor:
            "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
        }}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:bg-[color:var(--color-deep-space)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
      >
        <X aria-hidden size={20} />
      </button>

      {/* Médium — vycentrované, přirozený poměr, fit do viewportu. */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative z-[1] flex items-center justify-center"
      >
        {!safe ? (
          <p className="rounded-2xl bg-[color:var(--color-graphite)] px-6 py-4 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            Médium nelze zobrazit.
          </p>
        ) : isVideo ? (
          <MediaPlayer
            src={url}
            poster={url}
            autoPlay
            className={`${FIT} w-[min(92vw,1100px)]`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- proxy Streaming_URL, ne next/image
          <img
            src={url}
            alt=""
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
            style={mediaShadow}
            className={`${FIT} rounded-2xl object-contain`}
          />
        )}
      </div>
    </div>
  );
}

export default MediaLightbox;
