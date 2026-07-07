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
import { useEffect, useRef, useState, useTransition } from "react";
import { X, Trash2, EyeOff, Pencil, Share2, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";
import { MediaPlayer } from "./MediaPlayer";
import { MediaEditPanel } from "./admin/media-edit-panel";
import { Button } from "./admin/admin-ui";
import { SystemToast } from "./SystemToast";
import { captureVideoPoster, blobToBase64 } from "@/lib/video-poster";
import type { ModelOption } from "./admin/upload-wizard";
import {
  assignMediaModelAction,
  addMediaTagAction,
  removeMediaTagAction,
  setMediaPublishedAction,
  deleteMediaAction,
  uploadPosterAction,
  setMediaPosterAction,
} from "@/app/(app)/admin/admin-actions";
import {
  issueStreamingUrlAction,
  issueStreamingUrlsAction,
} from "@/app/(app)/media-actions";
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
  /** Celé pořadí médií pro preload následujících fotek. */
  readonly sequence?: readonly MediaCardItem[];
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
  sequence = [],
}: MediaLightboxProps) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const refreshSeq = useRef(0);
  const preloadedUrls = useRef(new Map<string, string>());

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

  useEffect(() => {
    const cachedUrl = item?.id ? preloadedUrls.current.get(item.id) : undefined;
    const initialPhotoUrl =
      item?.mediaType === "photo" && item.posterUrl
        ? `${item.posterUrl}${item.posterUrl.includes("?") ? "&" : "?"}size=2048`
        : item?.thumbnailUrl;
    setStreamUrl(cachedUrl ?? initialPhotoUrl ?? "");
    setImageLoading(item?.mediaType === "photo");
    setLoadFailed(false);
  }, [item?.id, item?.thumbnailUrl, item?.posterUrl, item?.mediaType]);

  const selectedMediaId = item?.id;
  const selectedMediaType = item?.mediaType;

  useEffect(() => {
    if (!selectedMediaId) return;
    if (selectedMediaType === "photo") return;
    let active = true;
    const seq = ++refreshSeq.current;

    void issueStreamingUrlAction(selectedMediaId, selectedMediaType ?? "video").then((res) => {
      if (!active || refreshSeq.current !== seq || !res.ok || !res.url) return;
      setStreamUrl(res.url);
      setImageLoading(false);
      setLoadFailed(false);
    });

    return () => {
      active = false;
    };
  }, [selectedMediaId, selectedMediaType]);

  useEffect(() => {
    if (!selectedMediaId || sequence.length === 0) return;
    const currentIndex = sequence.findIndex((entry) => entry.id === selectedMediaId);
    if (currentIndex < 0) return;

    const nextPhotos = sequence
      .slice(currentIndex + 1)
      .filter((entry) => entry.mediaType === "photo")
      .filter((entry): entry is MediaCardItem & { posterUrl: string } => typeof entry.posterUrl === "string")
      .filter((entry) => !preloadedUrls.current.has(entry.id))
      .slice(0, 3);

    if (nextPhotos.length === 0) return;

    for (const entry of nextPhotos) {
      const preloadUrl = `${entry.posterUrl}${entry.posterUrl.includes("?") ? "&" : "?"}size=2048`;
      preloadedUrls.current.set(entry.id, preloadUrl);
      const probe = new Image();
      probe.decoding = "async";
      probe.src = preloadUrl;
    }
  }, [selectedMediaId, sequence]);

  if (!item) return null;

  const mediaId = item.id;
  const url = streamUrl;
  const safe = url.length > 0 && !isDriveLink(url);
  const isVideo = item.mediaType === "video";
  const mediaShadow = { boxShadow: "0 10px 50px rgba(0, 0, 0, 0.6)" };
  const imageAspectRatio =
    item.width > 0 && item.height > 0 ? `${item.width} / ${item.height}` : "1 / 1";

  const refreshStreamUrl = () => {
    const seq = ++refreshSeq.current;
    setImageLoading(!isVideo);
    return issueStreamingUrlAction(mediaId, item.mediaType).then((res) => {
      if (refreshSeq.current !== seq || !res.ok || !res.url) {
        setImageLoading(false);
        return false;
      }
      setStreamUrl(res.url);
      setLoadFailed(false);
      return true;
    });
  };

  const handleImageError = () => {
    if (loadFailed) {
      setImageLoading(false);
      setToast("Failed to load media. Please try again.");
      return;
    }
    setLoadFailed(true);
    void refreshStreamUrl().then((ok) => {
      if (!ok) setToast("Failed to load media. Please try again.");
    });
  };

  const runAction = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const res = await action();
      // Server akce revaliduje "/" → preview se obnoví sama; chybu ukaž v toastu.
      if (!res.ok) setToast(res.message ?? "Action failed.");
    });
  };

  const handleDelete = () => {
    if (!window.confirm("Delete media? It will be removed from the entire system.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteMediaAction(mediaId);
      if (!res.ok) setToast(res.message ?? "Delete failed.");
      else onClose();
    });
  };

  // Vygeneruje poster videa (snímek z 1/3 délky) z proxy streamu a uloží ho.
  const handleGeneratePoster = async () => {
    if (genLoading) return;
    setGenLoading(true);
    try {
      const blob = await captureVideoPoster(url);
      const base64 = await blobToBase64(blob);
      const up = await uploadPosterAction(base64, `${mediaId}.poster.jpg`);
      if (!up.ok || !up.driveFileId) throw new Error(up.message ?? "Thumbnail upload failed.");
      const set = await setMediaPosterAction(mediaId, up.driveFileId);
      if (!set.ok) throw new Error(set.message ?? "Thumbnail save failed.");
      setToast("Thumbnail generated.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?m=${mediaId}`;
    navigator.clipboard
      ?.writeText(shareUrl)
      .then(() => setToast("Link is copied! Ready to share."))
      .catch(() => setToast("Copy failed."));
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
      aria-label="Media viewer"
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
        aria-label="Close viewer"
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
            aria-label="Previous media"
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
            aria-label="Next media"
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
        {!safe && imageLoading && !isVideo ? (
          <div className="flex items-center justify-center rounded-2xl bg-[color:var(--color-deep-space)] px-10 py-10">
            <span
              aria-label="Loading media"
              className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-chalk-white)]/25 border-t-[color:var(--color-netflix-red)]"
            />
          </div>
        ) : !safe ? (
          <p className="rounded-2xl bg-[color:var(--color-graphite)] px-6 py-4 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            This media can&apos;t be displayed.
          </p>
        ) : isVideo ? (
          <MediaPlayer
            src={url}
            poster={url}
            autoPlay
            className={FIT}
          />
        ) : (
          <div className="relative">
            <div
              style={
                imageLoading
                  ? {
                      aspectRatio: imageAspectRatio,
                      maxWidth: "92vw",
                      maxHeight: "88vh",
                      ...mediaShadow,
                    }
                  : mediaShadow
              }
              className={`relative overflow-hidden rounded-2xl bg-[color:var(--color-deep-space)] ${
                imageLoading ? "h-auto w-[min(92vw,88vh)]" : "inline-flex"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- proxy Streaming_URL, ne next/image */}
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={() => setImageLoading(false)}
                onError={handleImageError}
                onContextMenu={(event) => event.preventDefault()}
                className={`${FIT} h-auto w-auto object-contain transition-opacity duration-200 ${
                  imageLoading ? "opacity-0" : "opacity-100"
                }`}
              />
            </div>
            {imageLoading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[color:var(--color-deep-space)]/45 backdrop-blur-sm">
                <span
                  aria-label="Loading media"
                  className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-chalk-white)]/25 border-t-[color:var(--color-netflix-red)]"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Pravý horní roh: ikony edit (uploader), sdílet (všichni), smazat (uploader). */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="absolute right-4 top-4 z-20 flex items-center gap-2"
      >
        {canEdit && isVideo && (
          <button
            type="button"
            aria-label="Generate thumbnail"
            title="Generate thumbnail (frame from 1/3 of the video)"
            disabled={genLoading}
            style={glassBorder}
            className={iconBtn}
            onClick={handleGeneratePoster}
          >
            <ImagePlus aria-hidden size={18} />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            aria-label="Edit media"
            title="Edit"
            style={glassBorder}
            className={`${iconBtn} ${editOpen ? "text-[color:var(--color-netflix-red)]" : ""}`}
            onClick={() => setEditOpen((v) => !v)}
          >
            <Pencil aria-hidden size={18} />
          </button>
        )}
        <button
          type="button"
          aria-label="Share link"
          title="Copy link"
          style={glassBorder}
          className={iconBtn}
          onClick={handleShare}
        >
          <Share2 aria-hidden size={18} />
        </button>
        {canEdit && (
          <button
            type="button"
            aria-label="Delete media"
            title="Delete"
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
          className="absolute right-4 top-1/2 z-20 flex max-h-[90vh] h-[80svh] w-[92vw] -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border bg-[color:var(--color-deep-space)]/70 p-5 backdrop-blur-md sm:w-[420px] lg:w-[30svw] lg:min-w-[440px]"
        >
          <MediaEditPanel
            mediaId={mediaId}
            currentModelId={item.modelId}
            models={models}
            tags={item.editTags ?? []}
            tagSuggestions={tagSuggestions}
            expanded
            onAssignModel={assignMediaModelAction}
            onAddTag={addMediaTagAction}
            onRemoveTag={removeMediaTagAction}
            onSaved={() => setToast("Saved.")}
          />

          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => runAction(() => setMediaPublishedAction(mediaId, false))}
          >
            <EyeOff aria-hidden size={14} />
            Hide
          </Button>
        </div>
      )}

      <SystemToast message={toast} onClear={() => setToast(null)} />
    </div>
  );
}

export default MediaLightbox;
