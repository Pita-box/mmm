/**
 * Klientské generování posteru videa — snímek z 1/3 délky (R6, plán thumbnails).
 *
 * Drive někdy nevygeneruje náhled videa; generujeme ho sami v prohlížeči:
 * `<video>` (z lokálního souboru NEBO z proxy `/api/stream/<token>`) přetočíme
 * na zlomek délky, vykreslíme snímek do `<canvas>` a vyexportujeme JPEG. Canvas
 * není „tainted" (lokální objectURL i stejnodoménová proxy). Bez závislostí.
 */

export interface CapturePosterOptions {
  /** Zlomek délky, ze kterého se snímek vezme (výchozí 1/3). */
  readonly atFraction?: number;
  /** Maximální šířka výstupu v px (zmenší, ne zvětší; výchozí 1024). */
  readonly maxWidth?: number;
  /** JPEG kvalita 0–1 (výchozí 0.8). */
  readonly quality?: number;
  /** Timeout v ms (výchozí 30000). */
  readonly timeoutMs?: number;
}

/** Zachytí poster z videa na `src` a vrátí JPEG `Blob`. */
export function captureVideoPoster(
  src: string,
  options: CapturePosterOptions = {},
): Promise<Blob> {
  const { atFraction = 1 / 3, maxWidth = 1024, quality = 0.8, timeoutMs = 30000 } = options;

  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;

    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("Časový limit generování náhledu."), timeoutMs);

    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return fail("Video nemá rozměry.");
        const scale = Math.min(1, maxWidth / w);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail("Canvas není dostupný.");
        ctx.drawImage(video, 0, 0, cw, ch);
        canvas.toBlob(
          (blob) => {
            if (!blob) return fail("Snímek se nepodařilo vytvořit.");
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(blob);
          },
          "image/jpeg",
          quality,
        );
      } catch (e) {
        fail((e as Error).message);
      }
    };

    video.onloadedmetadata = () => {
      const d = video.duration;
      const target = Number.isFinite(d) && d > 0 ? d * atFraction : 0;
      video.onseeked = draw;
      try {
        video.currentTime = target;
      } catch {
        fail("Nelze nastavit čas videa.");
      }
    };
    video.onerror = () => fail("Video se nepodařilo načíst.");

    video.src = src;
  });
}

/** Převede `Blob` na base64 (bez `data:` prefixu) — pro server action. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Čtení blobu selhalo."));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
