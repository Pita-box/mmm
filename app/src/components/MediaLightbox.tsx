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
import { useEffect, useState, useTransition } from "react";
import { X, Trash2, EyeOff, Pencil, Share2, ChevronLeft, ChevronRight } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";
import { MediaPlayer } from "./MediaPlayer";
import { MediaEditPanel } from "./admin/media-edit-panel";
import { Button } from "./admin/admin-ui";
import { SystemToast } from "./SystemToast";
import type { ModelOption } from "./admin/media-upload-form";
import {
  assignMediaModelAction,
  addMediaTagAction,
  removeMediaTagAction,
  setMediaPublishedAction,
  deleteMediaAction,
} from "@/app/(app)/admin/admin-actions";
import { DRIVE_DOMAINS } from "@/lib/drive-domains";

export interface MediaLightboxProps {
  /** Vybrané médium k zobrazení, nebo `null` (zavřeno). */
  readonly item: MediaCardItem | null;
  /** Zavření prohlížeče. */
  readonly onClose: () => void;
  /** Uploader → zobrazí editaci (model/štítky/skrýt) a smazání. */
  readonly canEdit?: boolean;
  /** Modely a hodnoty štítků pro editaci (jen když canEdit). */
  readonly models?: readonly ModelOption[];
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
  /** Navigace na předchozí/další médium (undefined = na kraji / nedostupné). */
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
}

/** Velikostní limit média ve viewportu (fit) — výška i šířka. */
const FIT = "max-h-[88vh] max-w-[92vw]";

/** Trvalý odkaz na Google Drive se nikdy nezobrazuje (R6.4). */
function isDriveLink(url: string): boolean {
  const lowered = url.toLowerCase();
  return DRIVE_DOMAINS.some((domain) => lowered.includes(domain));
}

export function MediaLightbox({
  item,
  onClose,
  canEdit = false,
  models = [],
  tagSuggestions = {},
  onPrev,
  onNext,
}: MediaLightboxProps) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onPrev?.();
      else if (event.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [item, onClose, onPrev, onNext]);

  // Při změně média zavři edit panel (lightbox zůstává mountovaný).
  useEffect(() => {
    setEditOpen(false);
  }, [item?.id]);

  if (!item) return null;

  const url = item.thumbnailUrl ?? "";
  const safe = url.length > 0 && !isDriveLink(url);
  const isVideo = item.mediaType === "video";
  const mediaShadow = { boxShadow: "0 10px 50px rgba(0, 0, 0, 0.6)" };

  const runAction = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const res = await action();
      // Server akce revaliduje "/" → preview se obnoví sama; chybu ukaž v toastu.
      if (!res.ok) setToast(res.message ?? "Akce se nezdařila.");
    });
  };

  const handleDelete = () => {
    if (!window.confirm("Smazat médium? Odstraní se z celého systému.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteMediaAction(item.id);
      if (!res.ok) setToast(res.message ?? "Smazání selhalo.");
      else onClose();
    });
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?m=${item.id}`;
    navigator.clipboard
      ?.writeText(shareUrl)
      .then(() => setToast("Link is copied! Ready to share."))
      .catch(() => setToast("Kopírování se nezdařilo."));
  };

  // Glass round icon button (toolbar).
  const iconBtn =
    "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:bg-[color:var(--color-deep-space)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] disabled:opacity-50";
  const glassBorder = {
    borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)",
  };

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

      {/* Navigace prev/next — boční glass šipky (zobrazí se, když je kam jít). */}
      {(onPrev || onNext) && !editOpen && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev?.();
            }}
            disabled={!onPrev}
            aria-label="Předchozí médium"
            style={glassBorder}
            className={`absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] ${
              onPrev ? "cursor-pointer hover:bg-[color:var(--color-deep-space)]/80" : "cursor-default opacity-40"
            }`}
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext?.();
            }}
            disabled={!onNext}
            aria-label="Další médium"
            style={glassBorder}
            className={`absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-chalk-white)] ${
              onNext ? "cursor-pointer hover:bg-[color:var(--color-deep-space)]/80" : "cursor-default opacity-40"
            }`}
          >
            <ChevronRight aria-hidden size={22} />
          </button>
        </>
      )}

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
            className={FIT}
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

      {/* Pravý horní roh: ikony edit (uploader), sdílet (všichni), smazat (uploader). */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="absolute right-4 top-4 z-20 flex items-center gap-2"
      >
        {canEdit && (
          <button
            type="button"
            aria-label="Upravit médium"
            title="Upravit"
            style={glassBorder}
            className={`${iconBtn} ${editOpen ? "text-[color:var(--color-netflix-red)]" : ""}`}
            onClick={() => setEditOpen((v) => !v)}
          >
            <Pencil aria-hidden size={18} />
          </button>
        )}
        <button
          type="button"
          aria-label="Sdílet odkaz"
          title="Kopírovat odkaz"
          style={glassBorder}
          className={iconBtn}
          onClick={handleShare}
        >
          <Share2 aria-hidden size={18} />
        </button>
        {canEdit && (
          <button
            type="button"
            aria-label="Smazat médium"
            title="Smazat"
            disabled={pending}
            style={glassBorder}
            className={`${iconBtn} hover:text-[color:var(--color-netflix-red)]`}
            onClick={handleDelete}
          >
            <Trash2 aria-hidden size={18} />
          </button>
        )}
      </div>

      {/* Editace kategorie / štítků — až po kliknutí na tužku (glass panel vpravo). */}
      {canEdit && editOpen && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={glassBorder}
          className="absolute right-4 top-1/2 z-20 flex h-[80svh] w-[92vw] -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border bg-[color:var(--color-deep-space)]/70 p-5 backdrop-blur-md sm:w-[420px] lg:w-[30svw] lg:min-w-[440px]"
        >
          <MediaEditPanel
            mediaId={item.id}
            currentModelId={item.modelId}
            models={models}
            tags={item.editTags ?? []}
            tagSuggestions={tagSuggestions}
            expanded
            onAssignModel={assignMediaModelAction}
            onAddTag={addMediaTagAction}
            onRemoveTag={removeMediaTagAction}
            onSaved={() => setToast("Uloženo.")}
          />

          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => runAction(() => setMediaPublishedAction(item.id, false))}
          >
            <EyeOff aria-hidden size={14} />
            Skrýt
          </Button>
        </div>
      )}

      <SystemToast message={toast} onClear={() => setToast(null)} />
    </div>
  );
}

export default MediaLightbox;
