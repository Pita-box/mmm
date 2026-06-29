"use client";

/**
 * MediaPlayer — dedikovaný přehrávač videa s vlastním ovládáním (R6.6).
 *
 * Přehrává výhradně přes proxy `Streaming_URL` (`/api/stream/<token>`); trvalý
 * odkaz na Google Drive se nikdy nepoužije (R6.3/R6.4 — `isDriveLink` guard).
 *
 * Vlastní ovládání (play/pause, posuv, čas, hlasitost, fullscreen) v Netflix
 * stylu místo nativního `<video controls>` — hezčí a zároveň **bez nativního
 * download tlačítka**. Anti-download friction (ne pancíř, bez DRM):
 *  - `controls={false}` + vlastní UI → žádné „⋮ → Stáhnout",
 *  - `controlsList="nodownload noremoteplayback"`, `disablePictureInPicture`,
 *  - vypnuté kontextové menu (pravý klik) na celém přehrávači.
 *
 * Připraveno na pozdější HLS upgrade — stačí zdroj přepnout na `.m3u8` + hls.js.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { DRIVE_DOMAINS } from "@/lib/drive-domains";

export interface MediaPlayerProps {
  /** Proxy Streaming_URL videa (`/api/stream/<token>`). */
  readonly src: string;
  /** Volitelný poster během načítání. */
  readonly poster?: string;
  /** Přehrát hned po načtení. */
  readonly autoPlay?: boolean;
  /** Doplňkové třídy vnějšího kontejneru (např. fit do viewportu). */
  readonly className?: string;
}

/** Trvalý odkaz na Google Drive se nikdy nepřehrává (R6.4). */
function isDriveLink(url: string): boolean {
  const lowered = url.toLowerCase();
  return DRIVE_DOMAINS.some((domain) => lowered.includes(domain));
}

/** Formát času mm:ss (záporné/NaN → 0:00). */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaPlayer({ src, poster, autoPlay = false, className }: MediaPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  const safe = src.length > 0 && !isDriveLink(src);

  // Nový zdroj → znovu fake black screen + spinner (prev/next v lightboxu).
  useEffect(() => {
    setLoading(true);
  }, [src]);

  // Auto-hide ovládání během přehrávání po nečinnosti.
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2600);
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Sledování fullscreen stavu (i ESC z prohlížeče).
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
    revealControls();
  }

  /** Posun o `delta` sekund; horní ořez jen je-li délka známá (jinak bez ořezu). */
  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const dur =
        Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : Number.POSITIVE_INFINITY;
      v.currentTime = Math.min(Math.max(0, v.currentTime + delta), dur);
      setCurrent(v.currentTime);
      revealControls();
    },
    [revealControls],
  );

  // Klávesové zkratky: mezerník (play/pause), ←/→ (±5 s). Ignoruje vstupy/tlačítka.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.isContentEditable)
      ) {
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (v.paused) void v.play().catch(() => {});
        else v.pause();
        revealControls();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(5);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [revealControls, seekBy]);

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function onSeek(value: number) {
    const v = videoRef.current;
    if (v && Number.isFinite(value)) {
      v.currentTime = value;
      setCurrent(value);
    }
  }

  function onVolume(value: number) {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) await document.exitFullscreen();
    else await el.requestFullscreen().catch(() => {});
  }

  if (!safe) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-[color:var(--color-graphite)] px-6 py-4 ${className ?? ""}`}>
        <span className="text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          Médium nelze přehrát.
        </span>
      </div>
    );
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const volumePct = (muted ? 0 : volume) * 100;

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={revealControls}
      onMouseLeave={() => {
        if (!videoRef.current?.paused) setControlsVisible(false);
      }}
      className="group relative inline-flex overflow-hidden rounded-2xl bg-[color:var(--color-deep-space)]"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        preload="auto"
        controls={false}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onClick={togglePlay}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onLoadedData={() => setLoading(false)}
        onPlay={() => {
          setPlaying(true);
          setLoading(false);
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        className={`block h-auto w-auto cursor-pointer object-contain ${className ?? ""}`}
      />

      {/* Fake black screen + spinner během načítání (vyplní celý kontejner). */}
      <div
        aria-hidden={!loading}
        className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-[color:var(--color-deep-space)] transition-opacity duration-300 ${
          loading ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-chalk-white)]/25 border-t-[color:var(--color-netflix-red)]" />
      </div>

      {/* Spodní navigace: přes video, transparentní (bez pozadí i borderu). */}
      <div
        style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))" }}
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 px-4 pb-3 pt-2 transition-opacity duration-200 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Posuv + čas. */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="Posuv videa"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--color-netflix-red) ${progress}%, color-mix(in oklab, var(--color-chalk-white) 35%, transparent) ${progress}%)`,
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full accent-[color:var(--color-netflix-red)]"
          />
          <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[color:var(--color-chalk-white)]">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>

        {/* Ovládání. */}
        <div className="flex items-center gap-4 text-[color:var(--color-chalk-white)]">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pozastavit" : "Přehrát"}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            {playing ? (
              <Pause aria-hidden size={22} className="fill-current" />
            ) : (
              <Play aria-hidden size={22} className="fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={() => seekBy(-5)}
            aria-label="Zpět o 5 sekund"
            className="relative flex cursor-pointer items-center justify-center transition-transform hover:scale-110"
          >
            <RotateCcw aria-hidden size={24} strokeWidth={1.75} />
            <span className="absolute text-[8px] font-bold">5</span>
          </button>

          <button
            type="button"
            onClick={() => seekBy(5)}
            aria-label="Vpřed o 5 sekund"
            className="relative flex cursor-pointer items-center justify-center transition-transform hover:scale-110"
          >
            <RotateCw aria-hidden size={24} strokeWidth={1.75} />
            <span className="absolute text-[8px] font-bold">5</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Zapnout zvuk" : "Ztlumit"}
              className="cursor-pointer transition-transform hover:scale-110"
            >
              {muted || volume === 0 ? (
                <VolumeX aria-hidden size={22} />
              ) : (
                <Volume2 aria-hidden size={22} />
              )}
            </button>
            <input
              type="range"
              aria-label="Hlasitost"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, var(--color-netflix-red) ${volumePct}%, color-mix(in oklab, var(--color-chalk-white) 35%, transparent) ${volumePct}%)`,
              }}
              className="hidden h-1 w-16 cursor-pointer appearance-none rounded-full accent-[color:var(--color-netflix-red)] sm:block"
            />
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Celá obrazovka"
            className="ml-auto cursor-pointer transition-transform hover:scale-110"
          >
            {fullscreen ? (
              <Minimize aria-hidden size={22} />
            ) : (
              <Maximize aria-hidden size={22} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaPlayer;
