"use client";

/**
 * UploadDropzone — hromadné nahrání médií drag&drop nebo výběrem (plán 012).
 *
 * Každý soubor se validuje (formát + velikost) a nahraje sekvenčně PŘÍMO na
 * Drive přes resumable session (bajty nejdou přes server). Po dokončení předá
 * nahrané položky přes `onUploaded`. Prezentační — server akci dostává propem.
 */
import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { validateUpload, classifyType, MAX_UPLOAD_BYTES } from "@/services/media-service";
import { isErr } from "@/lib/result";
import { uploadResumable } from "@/lib/resumable-upload";
import { captureVideoPoster, blobToBase64 } from "@/lib/video-poster";
import { applyPhotoWatermark } from "@/lib/photo-watermark";

export interface UploadedItem {
  readonly name: string;
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Lokální náhled (objectURL) pro wizard, než vznikne médium. */
  readonly previewUrl: string;
  readonly mediaType: "photo" | "video";
  /** Vlastní poster videa (snímek z 1/3 délky) na Drive, pokud se povedl. */
  readonly posterDriveFileId?: string | null;
}

export interface UploadDropzoneProps {
  readonly onCreateSession: (
    name: string,
    mimeType: string,
    modelId?: string | null,
  ) => Promise<{ ok: boolean; uploadUrl?: string; message?: string }>;
  /** Nahrání vygenerovaného posteru (JPEG base64) na Drive → vrátí driveFileId. */
  readonly onUploadPoster?: (
    base64: string,
    name: string,
  ) => Promise<{ ok: boolean; driveFileId?: string; message?: string }>;
  readonly onUploaded: (items: UploadedItem[]) => void;
  /** Externě dropnuté soubory (např. drop kamkoliv na /preview) — nahrají se hned. */
  readonly initialFiles?: readonly File[] | null;
  /** Předvybraný model pro upload přímo do jeho Drive složky. */
  readonly modelId?: string | null;
}

const MAX_UPLOAD_GB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024));

interface Progress {
  readonly name: string;
  readonly pct: number;
  readonly error?: string;
}

export function UploadDropzone({
  onCreateSession,
  onUploadPoster,
  onUploaded,
  initialFiles,
  modelId = null,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const processedRef = useRef<readonly File[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<Progress[]>([]);

  async function handleFiles(files: FileList | readonly File[] | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    const queue = Array.from(files);
    setItems(queue.map((f) => ({ name: f.name, pct: 0 })));
    const done: UploadedItem[] = [];

    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const setErr = (error: string) =>
        setItems((prev) => prev.map((p, idx) => (idx === i ? { ...p, error } : p)));

      if (classifyType(file.type) === null || isErr(validateUpload({ mimeType: file.type, sizeBytes: file.size }))) {
        setErr("Nepodporovaný formát nebo příliš velký soubor.");
        continue;
      }
      try {
        const mediaType = classifyType(file.type);
        const uploadFile =
          mediaType === "photo"
            ? await applyPhotoWatermark(file)
            : file;

        const session = await onCreateSession(uploadFile.name, uploadFile.type, modelId);
        if (!session.ok || !session.uploadUrl) {
          setErr(session.message ?? "Nepodařilo se zahájit nahrávání.");
          continue;
        }
        const driveFileId = await uploadResumable(session.uploadUrl, uploadFile, (pct) =>
          setItems((prev) => prev.map((p, idx) => (idx === i ? { ...p, pct } : p))),
        );
        const previewUrl = URL.createObjectURL(uploadFile);
        const isVideo = mediaType === "video";

        // Vlastní poster videa (snímek z 1/3 délky) — z lokálního souboru je
        // spolehlivý; selhání je nefatální (fallback na Drive náhled).
        let posterDriveFileId: string | null = null;
        if (isVideo && onUploadPoster) {
          try {
            const blob = await captureVideoPoster(previewUrl);
            const base64 = await blobToBase64(blob);
            const res = await onUploadPoster(base64, `${file.name}.poster.jpg`);
            if (res.ok && res.driveFileId) posterDriveFileId = res.driveFileId;
          } catch {
            /* poster je volitelný — pokračuj bez něj */
          }
        }

        done.push({
          name: uploadFile.name,
          driveFileId,
          mimeType: uploadFile.type,
          sizeBytes: uploadFile.size,
          previewUrl,
          mediaType: isVideo ? "video" : "photo",
          posterDriveFileId,
        });
      } catch (e) {
        setErr((e as Error).message);
      }
    }

    setBusy(false);
    if (done.length > 0) onUploaded(done);
  }

  // Externě dropnuté soubory (drop na /preview) → nahraj hned po předání.
  // Ref guard: každou dávku zpracuj jen jednou (dev StrictMode spustí efekt 2×).
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && processedRef.current !== initialFiles) {
      processedRef.current = initialFiles;
      void handleFiles(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-2xl)] border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-netflix-red bg-graphite/40" : "border-charcoal"
        }`}
      >
        <UploadCloud aria-hidden size={32} className="text-silver" />
        <span className="text-[length:var(--text-body)] text-chalk-white">
          {busy ? "Nahrávám…" : "Přetáhněte soubory sem"}
        </span>
        <span className="text-[length:var(--text-caption)] text-ash">
          Foto (JPEG/PNG/WebP) nebo video (MP4/MOV/WebM), max {MAX_UPLOAD_GB} GB. Více souborů najednou.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-[var(--radius-lg)] bg-netflix-red px-5 py-2 text-[length:var(--text-caption)] font-semibold text-chalk-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Vybrat soubory
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <li key={`${it.name}-${idx}`} className="flex flex-col gap-1">
              <span className="flex justify-between text-[length:var(--text-caption)] text-silver">
                <span className="truncate">{it.name}</span>
                <span>{it.error ? "chyba" : `${it.pct} %`}</span>
              </span>
              {it.error ? (
                <span role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
                  {it.error}
                </span>
              ) : (
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-graphite">
                  <span
                    className="block h-full bg-netflix-red transition-[width] duration-200"
                    style={{ width: `${it.pct}%` }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
