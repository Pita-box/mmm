"use client";

/**
 * PreviewFeed — kompletní úvodní nástěnka Preview / Newsfeed (R10).
 *
 * Skládá Netflix-style layout nad seřazeným fondem Approved_Media (sestupně dle
 * času zveřejnění, R10.1/R10.2 — řadí volající přes `previewOrder`):
 *  1. horizontální `Carousel` řady seskupené podle modelu,
 *  2. masonry mřížka „Procházet vše" s nekonečným scrollem.
 *
 * Pro uploadery (Admin/Distributor) navíc: plovoucí „+" otevře upload popup
 * (stejný wizard jako stránka /upload) a soubory lze přetáhnout kamkoliv na
 * stránku — drop otevře popup s nahráváním (plán 012).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Carousel } from "./Carousel";
import { MasonryGrid, poolLoader } from "./MasonryGrid";
import { MediaLightbox } from "./MediaLightbox";
import { UploadModal } from "./admin/upload-modal";
import type { ModelOption } from "./admin/upload-wizard";
import {
  createUploadSessionAction,
  finalizeUploadsAction,
  uploadPosterAction,
} from "@/app/(app)/admin/admin-actions";
import type { MediaCardItem } from "./MediaCard";

export interface PreviewFeedProps {
  /** Approved_Media seřazená sestupně dle času zveřejnění (R10.1). */
  readonly media: readonly MediaCardItem[];
  /** Uploader (Admin/Distributor) → upload popup + drop kamkoliv (plán 012). */
  readonly canUpload?: boolean;
  /** Modely a hodnoty štítků pro upload wizard (jen když canUpload). */
  readonly models?: readonly ModelOption[];
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
}

/** Řada karuselu: titulek (jméno modelu) + jeho média v pořadí fondu. */
interface MediaRow {
  readonly title: string;
  readonly items: readonly MediaCardItem[];
}

/**
 * Seskupí média do alb podle modelu (titulek) se zachováním pořadí fondu.
 * Média BEZ modelu se do alb nezařazují — netvoří karusel, zůstanou jen v
 * mřížce „Procházet vše".
 */
function groupByModel(media: readonly MediaCardItem[]): MediaRow[] {
  const order: string[] = [];
  const byTitle = new Map<string, MediaCardItem[]>();
  for (const item of media) {
    const title = item.title?.trim();
    if (!title) continue; // médium bez modelu → žádné album
    const bucket = byTitle.get(title);
    if (bucket) {
      bucket.push(item);
    } else {
      byTitle.set(title, [item]);
      order.push(title);
    }
  }
  return order.map((title) => ({ title, items: byTitle.get(title)! }));
}

export function PreviewFeed({
  media,
  canUpload = false,
  models = [],
  tagSuggestions = {},
}: PreviewFeedProps) {
  const [selected, setSelected] = useState<MediaCardItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<readonly File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const loadPage = useMemo(() => poolLoader(media), [media]);
  // Karusely modelů ze VŠECH médií (ne slice(1)) — nejnovější médium tak
  // nechybí ve své modelové řadě.
  const rows = useMemo(() => groupByModel(media), [media]);

  // Sdílený odkaz: otevři lightbox z ?m=<id> při načtení (bez navigace).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("m");
    if (!id) return;
    const found = media.find((x) => x.id === id);
    if (found) setSelected(found);
    // jen při mountu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drž URL v souladu s otevřeným médiem (sdílení), bez přechodu na novou stránku.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (selected) u.searchParams.set("m", selected.id);
    else u.searchParams.delete("m");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [selected]);

  // Drag & drop kamkoliv na stránku → overlay během tažení + drop otevře popup.
  useEffect(() => {
    if (!canUpload) return;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // nutné, aby prohlížeč soubor neotevřel
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      setDroppedFiles(Array.from(e.dataTransfer.files));
      setUploadOpen(true);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [canUpload]);

  const uploadUi = canUpload ? (
    <>
      {/* Plovoucí „+" — otevře upload popup. Glassmorphism, nad toastem. */}
      <button
        type="button"
        onClick={() => {
          setDroppedFiles(null);
          setUploadOpen(true);
        }}
        aria-label="Nahrát média"
        title="Nahrát média"
        style={{
          borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
        }}
        className="fixed bottom-24 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-all hover:scale-110 hover:bg-[color:var(--color-deep-space)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)]"
      >
        <Plus aria-hidden size={26} />
      </button>

      {/* Overlay během tažení (low opacity) — rámeček ve velikosti upload popupu. */}
      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-[color:var(--color-deep-space)]/70 p-4 backdrop-blur-sm sm:p-8"
        >
          <div className="flex h-[90vh] max-h-[90vh] w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-[color:var(--color-netflix-red)] bg-[color:var(--color-deep-space)]/60 text-center">
            <Plus aria-hidden size={40} className="text-[color:var(--color-netflix-red)]" />
            <span className="text-[length:var(--text-subheading)] font-bold text-chalk-white">
              Pusťte soubory pro nahrání
            </span>
          </div>
        </div>
      ) : null}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        models={models}
        tagSuggestions={tagSuggestions}
        initialFiles={droppedFiles}
        onCreateSession={createUploadSessionAction}
        onUploadPoster={uploadPosterAction}
        onFinalize={finalizeUploadsAction}
      />
    </>
  ) : null;

  if (media.length === 0) {
    return (
      <section>
        <header className="mb-8">
          <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            Preview
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            Nejnovější obsah seřazený od nejnovějšího.
          </p>
        </header>
        <p className="py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          Zatím tu není žádný obsah.
        </p>
        {uploadUi}
      </section>
    );
  }

  return (
    <section>
      {rows.map((row) => (
        <Carousel
          key={row.title}
          title={row.title}
          media={row.items}
          onSelect={setSelected}
        />
      ))}

      <h2 className="mb-4 mt-4 text-[length:var(--text-heading-sm)] font-bold text-[color:var(--color-chalk-white)]">
        Procházet vše
      </h2>
      <MasonryGrid loadPage={loadPage} onSelect={setSelected} />

      <MediaLightbox
        item={selected}
        onClose={() => setSelected(null)}
        canEdit={canUpload}
        models={models}
        tagSuggestions={tagSuggestions}
        onPrev={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i > 0 ? () => setSelected(media[i - 1]) : undefined;
        })()}
        onNext={(() => {
          const i = selected ? media.findIndex((m) => m.id === selected.id) : -1;
          return i >= 0 && i < media.length - 1 ? () => setSelected(media[i + 1]) : undefined;
        })()}
      />
      {uploadUi}
    </section>
  );
}

export default PreviewFeed;
