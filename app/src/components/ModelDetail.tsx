"use client";

/**
 * ModelDetail — artist page modelu (R13.4, R13.5).
 *
 * Profilový layout (inspirace X/Twitter): hero banner + překrývající avatar,
 * jméno, bio a seznam štítků (distinct hodnoty z médií modelu). Pod tím galerie
 * výhradně Approved_Media modelu (`BrowsableGrid` s přehrávačem; invariant
 * viditelnosti řeší zdroj dat, R13.4). Prázdná galerie → textové sdělení (R13.5).
 *
 * Admin navíc: tužka (inline editace jména + bio) a Smazat s volbou
 *  a) smazat jen model (média zůstanou), b) smazat model i média.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Pencil, Trash2, Save, X, Images } from "lucide-react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import { BrowsableGrid } from "./BrowsableGrid";
import { ModelDetailUpload } from "./ModelDetailUpload";
import { ProfileAvatarImage } from "./ProfileAvatarImage";
import { Button, TextInput, TextArea, Field } from "./admin/admin-ui";
import type { ModelOption } from "./admin/upload-wizard";
import type { MediaCardItem } from "./MediaCard";
import {
  defaultProfileAvatarPercentCrop,
  normalizeProfileAvatarPercentCrop,
  profileAvatarPercentCropFromStored,
  profileAvatarStoredFromPercentCrop,
} from "@/lib/profile-avatar";

type ActionResult = { ok: boolean; message?: string };

const DEFAULT_COVER_FOCUS_Y = 50;
const LIBRARY_PAGE_SIZE = 12;

function clampPercent(value: number, fallback = DEFAULT_COVER_FOCUS_Y): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export interface ModelDetailProps {
  readonly modelId: string;
  readonly name: string;
  readonly bio: string;
  /** Náhled na banner (hero) přes proxy. */
  readonly coverUrl?: string;
  /** Persistovaný zdroj cover fotky; null = automatický fallback. */
  readonly initialCoverMediaId?: string | null;
  /** Persistovaná vertikální pozice cover náhledu. */
  readonly initialCoverFocusY?: number | null;
  /** Náhled na avatar přes proxy. */
  readonly avatarUrl?: string;
  /** Persistovaný zdroj profilové fotky; null = automatický fallback. */
  readonly initialAvatarMediaId?: string | null;
  /** Persistovaný crop avataru. */
  readonly initialAvatarCropX?: number | null;
  readonly initialAvatarCropY?: number | null;
  readonly initialAvatarZoom?: number | null;
  /** Distinct hodnoty štítků médií modelu. */
  readonly tags: readonly string[];
  /** Výhradně Approved_Media modelu (R13.4). */
  readonly media: readonly MediaCardItem[];
  /** Admin → zobrazí editaci a mazání. */
  readonly canEdit?: boolean;
  /** Admin/Distributor → upload média přímo do tohoto modelu. */
  readonly canUpload?: boolean;
  /** Fixní model pro upload z detailu. */
  readonly uploadModel?: ModelOption;
  /** Modely pro lightbox editaci médií. */
  readonly modelOptions?: readonly ModelOption[];
  readonly uploadTagSuggestions?: Partial<Record<string, string[]>>;
  readonly onUpdate?: (values: {
    name: string;
    bio: string;
    coverMediaId?: string | null;
    coverFocusY?: number | null;
    profileMediaId?: string | null;
    avatarCropX?: number | null;
    avatarCropY?: number | null;
    avatarZoom?: number | null;
  }) => Promise<ActionResult>;
  readonly onDelete?: (withMedia: boolean) => Promise<ActionResult>;
}

export function ModelDetail({
  modelId,
  name,
  bio,
  coverUrl,
  initialCoverMediaId = null,
  initialCoverFocusY = null,
  avatarUrl,
  initialAvatarMediaId = null,
  initialAvatarCropX = null,
  initialAvatarCropY = null,
  initialAvatarZoom = null,
  tags,
  media,
  canEdit = false,
  canUpload = false,
  uploadModel,
  modelOptions = [],
  uploadTagSuggestions = {},
  onUpdate,
  onDelete,
}: ModelDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverTab, setCoverTab] = useState<"edit" | "library">("edit");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarTab, setAvatarTab] = useState<"edit" | "library">("edit");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftCoverMediaId, setDraftCoverMediaId] = useState<string | null>(initialCoverMediaId);
  const [draftCoverFocusY, setDraftCoverFocusY] = useState(
    clampPercent(initialCoverFocusY ?? DEFAULT_COVER_FOCUS_Y),
  );
  const [draftAvatarMediaId, setDraftAvatarMediaId] = useState<string | null>(initialAvatarMediaId);
  const [draftAvatarCrop, setDraftAvatarCrop] = useState<PercentCrop>();
  const [coverDrag, setCoverDrag] = useState<{
    pointerId: number;
    startY: number;
    startFocusY: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverLibraryPage, setCoverLibraryPage] = useState(0);
  const [avatarLibraryPage, setAvatarLibraryPage] = useState(0);

  const hasMedia = media.length > 0;
  const hasBio = bio.trim().length > 0;
  void modelId; // identita drží volající přes navázané akce
  const photoMedia = useMemo(
    () =>
      media.filter((item) => item.mediaType === "photo" && typeof item.posterUrl === "string"),
    [media],
  );
  const autoCoverItem = photoMedia[0];
  const currentCoverItem = initialCoverMediaId
    ? photoMedia.find((item) => item.id === initialCoverMediaId)
    : autoCoverItem;
  const draftCoverItem = draftCoverMediaId
    ? photoMedia.find((item) => item.id === draftCoverMediaId)
    : autoCoverItem;
  const autoAvatarItem = photoMedia[1] ?? photoMedia[0];
  const currentAvatarItem = initialAvatarMediaId
    ? photoMedia.find((item) => item.id === initialAvatarMediaId)
    : autoAvatarItem;
  const initialCoverItem = currentCoverItem ?? autoCoverItem;
  const draftAvatarItem = draftAvatarMediaId
    ? photoMedia.find((item) => item.id === draftAvatarMediaId)
    : autoAvatarItem;
  const initialAvatarItem = currentAvatarItem ?? autoAvatarItem;
  const currentCoverImageUrl = currentCoverItem?.posterUrl ?? coverUrl;
  const draftCoverImageUrl = draftCoverItem?.posterUrl;
  const currentCoverFocusY =
    initialCoverMediaId && currentCoverItem
      ? clampPercent(initialCoverFocusY ?? DEFAULT_COVER_FOCUS_Y)
      : DEFAULT_COVER_FOCUS_Y;
  const draftAvatarImageUrl = draftAvatarItem?.posterUrl;
  const currentAvatarImageUrl = currentAvatarItem?.posterUrl ?? avatarUrl;
  const currentAvatarMetrics = {
    width: currentAvatarItem?.width ?? 1,
    height: currentAvatarItem?.height ?? 1,
  };
  const currentAvatarPercentCrop = profileAvatarPercentCropFromStored(
    {
      avatarCropX: initialAvatarCropX,
      avatarCropY: initialAvatarCropY,
      avatarZoom: initialAvatarZoom,
    },
    currentAvatarMetrics,
  );
  const coverLibraryPages = Math.max(1, Math.ceil(photoMedia.length / LIBRARY_PAGE_SIZE));
  const avatarLibraryPages = Math.max(1, Math.ceil(photoMedia.length / LIBRARY_PAGE_SIZE));
  const visibleCoverLibraryItems = photoMedia.slice(
    coverLibraryPage * LIBRARY_PAGE_SIZE,
    (coverLibraryPage + 1) * LIBRARY_PAGE_SIZE,
  );
  const visibleAvatarLibraryItems = photoMedia.slice(
    avatarLibraryPage * LIBRARY_PAGE_SIZE,
    (avatarLibraryPage + 1) * LIBRARY_PAGE_SIZE,
  );

  useEffect(() => {
    if (!coverEditorOpen && !avatarEditorOpen && !confirmOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [coverEditorOpen, avatarEditorOpen, confirmOpen]);

  const buildDefaultCrop = (width: number, height: number) =>
    centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: defaultProfileAvatarPercentCrop({ width, height }).width,
        },
        1,
        width,
        height,
      ),
      width,
      height,
    );

  const resolveAvatarCropForItem = (item: MediaCardItem | undefined) => {
    if (!item) return undefined;
    if (item.id === initialAvatarMediaId) {
      return profileAvatarPercentCropFromStored(
        {
          avatarCropX: initialAvatarCropX,
          avatarCropY: initialAvatarCropY,
          avatarZoom: initialAvatarZoom,
        },
        { width: item.width, height: item.height },
      );
    }
    return buildDefaultCrop(item.width, item.height);
  };

  const openAvatarEditor = () => {
    setEditOpen(false);
    setCoverEditorOpen(false);
    const mediaItem = initialAvatarItem;
    setDraftAvatarMediaId(mediaItem?.id ?? null);
    setDraftAvatarCrop(resolveAvatarCropForItem(mediaItem));
    setAvatarError(null);
    setAvatarTab("edit");
    setAvatarLibraryPage(0);
    setAvatarEditorOpen(true);
  };

  const openCoverEditor = () => {
    setEditOpen(false);
    setAvatarEditorOpen(false);
    const mediaItem = initialCoverItem;
    setDraftCoverMediaId(mediaItem?.id ?? null);
    setDraftCoverFocusY(
      mediaItem && mediaItem.id === initialCoverMediaId
        ? currentCoverFocusY
        : DEFAULT_COVER_FOCUS_Y,
    );
    setCoverError(null);
    setCoverTab("edit");
    setCoverLibraryPage(0);
    setCoverEditorOpen(true);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await onUpdate?.({ name: draftName, bio: draftBio });
      if (res && !res.ok) setError(res.message ?? "Save failed.");
      else {
        setEditOpen(false);
        router.refresh();
      }
    });
  };

  const saveAvatar = () => {
    setAvatarError(null);
    startTransition(async () => {
      const mediaId = draftAvatarMediaId ?? autoAvatarItem?.id ?? null;
      const crop = draftAvatarCrop && draftAvatarItem
        ? profileAvatarStoredFromPercentCrop(draftAvatarCrop, {
            width: draftAvatarItem.width,
            height: draftAvatarItem.height,
          })
        : { avatarCropX: null, avatarCropY: null, avatarZoom: null };
      const res = await onUpdate?.({
        name,
        bio,
        profileMediaId: mediaId,
        avatarCropX: crop.avatarCropX,
        avatarCropY: crop.avatarCropY,
        avatarZoom: crop.avatarZoom,
      });
      if (res && !res.ok) setAvatarError(res.message ?? "Failed to save avatar.");
      else {
        setAvatarEditorOpen(false);
        router.refresh();
      }
    });
  };

  const saveCover = () => {
    setCoverError(null);
    startTransition(async () => {
      const mediaId = draftCoverMediaId ?? autoCoverItem?.id ?? null;
      const res = await onUpdate?.({
        name,
        bio,
        coverMediaId: mediaId,
        coverFocusY: mediaId ? clampPercent(draftCoverFocusY) : null,
      });
      if (res && !res.ok) setCoverError(res.message ?? "Failed to save cover photo.");
      else {
        setCoverEditorOpen(false);
        router.refresh();
      }
    });
  };

  const startCoverDrag = (clientY: number, height: number, pointerId: number) => {
    setCoverDrag({
      pointerId,
      startY: clientY,
      startFocusY: draftCoverFocusY,
      height: Math.max(height, 1),
    });
  };

  const remove = (withMedia: boolean) => {
    startTransition(async () => {
      const res = await onDelete?.(withMedia);
      if (res && !res.ok) setError(res.message ?? "Delete failed.");
      else router.push("/models");
    });
  };

  return (
    <section>
      {/* Hero banner + avatar. */}
      <div className="relative mb-4">
        <div
          className="h-48 w-full overflow-hidden rounded-2xl sm:h-96"
          style={{ background: "var(--gradient-feature-card)" }}
        >
          {currentCoverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image
            <img
              src={currentCoverImageUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `50% ${currentCoverFocusY}%` }}
            />
          ) : null}
        </div>

        {/* Admin toolbar vpravo nahoře nad bannerem. */}
        {canEdit && (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              type="button"
              aria-label="Edit cover photo"
              title="Edit cover"
              onClick={openCoverEditor}
              style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:bg-[color:var(--color-deep-space)]/80"
            >
              <Pencil aria-hidden size={18} />
            </button>
            <button
              type="button"
              aria-label="Delete model"
              title="Delete"
              onClick={() => setConfirmOpen(true)}
              style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:text-[color:var(--color-netflix-red)]"
            >
              <Trash2 aria-hidden size={18} />
            </button>
          </div>
        )}

        {/* Avatar — překrývá spodní hranu banneru. */}
        <div className="group absolute -bottom-10 left-6">
          <div
            className="aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 sm:h-28 sm:w-28"
            style={{
              background: "var(--gradient-feature-card)",
              borderColor: "var(--color-deep-space)",
            }}
          >
            {currentAvatarImageUrl ? (
              <ProfileAvatarImage
                src={currentAvatarImageUrl}
                alt={name}
                percentCrop={currentAvatarPercentCrop}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              aria-label="Edit profile photo"
              onClick={openAvatarEditor}
              className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-deep-space)]/80 text-[color:var(--color-chalk-white)] opacity-0 shadow-md transition-opacity hover:bg-[color:var(--color-deep-space)] group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Pencil aria-hidden size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Jméno, bio, štítky. */}
      <header className="mb-8 mt-12 pl-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            {name}
          </h1>
          {canEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraftName(name);
                setDraftBio(bio);
                setError(null);
                setCoverEditorOpen(false);
                setAvatarEditorOpen(false);
                setEditOpen((v) => !v);
              }}
              className="shrink-0 px-4"
            >
              <Pencil aria-hidden size={16} />
              Edit profile
            </Button>
          ) : null}
        </div>
        {hasBio && (
          <p className="mt-2 max-w-2xl whitespace-pre-line text-[length:var(--text-body)] text-[color:var(--color-silver)]">
            {bio}
          </p>
        )}
        {tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {tags.map((t) => (
              <li
                key={t}
                className="rounded-[var(--radius-pills)] border border-graphite bg-[color:var(--color-deep-space)] px-3 py-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* Inline editace (admin). */}
      {canEdit && editOpen && (
        <div className="mb-8 flex flex-col gap-4 rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-5">
          <Field label="Model name" htmlFor="edit-model-name" error={error}>
            <TextInput
              id="edit-model-name"
              value={draftName}
              maxLength={100}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </Field>
          <Field label="Bio" htmlFor="edit-model-bio">
            <TextArea
              id="edit-model-bio"
              value={draftBio}
              maxLength={1000}
              onChange={(e) => setDraftBio(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              <Save aria-hidden size={16} />
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={pending}>
              <X aria-hidden size={16} />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {canEdit && coverEditorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit cover photo"
          onClick={() => setCoverEditorOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-deep-space)]/82 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-5xl max-h-[90vh] flex-col gap-5 overflow-hidden rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                  Cover photo
                </h2>
                <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                  Drag the photo in the banner until the crop looks right. Saving applies it to the model page.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setCoverEditorOpen(false)}>
                <X aria-hidden size={16} />
                Close
              </Button>
            </div>

            <div className="inline-flex w-fit rounded-[var(--radius-lg)] border border-[color:var(--color-charcoal)] bg-[color:var(--color-graphite)] p-1">
              <button
                type="button"
                aria-pressed={coverTab === "edit"}
                onClick={() => setCoverTab("edit")}
                className={`rounded-[var(--radius-sm)] px-4 py-2 text-[length:var(--text-caption)] font-semibold transition-colors ${
                  coverTab === "edit"
                    ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                    : "text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                }`}
              >
                Edit current
              </button>
              <button
                type="button"
                aria-pressed={coverTab === "library"}
                onClick={() => setCoverTab("library")}
                className={`rounded-[var(--radius-sm)] px-4 py-2 text-[length:var(--text-caption)] font-semibold transition-colors ${
                  coverTab === "library"
                    ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                    : "text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                }`}
              >
                Choose from uploads
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-5">
              {coverTab === "edit" ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-[var(--radius-2xl)] bg-[color:var(--color-graphite)] p-3">
                    {draftCoverImageUrl ? (
                      <div
                        role="presentation"
                        onPointerDown={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          startCoverDrag(e.clientY, rect.height, e.pointerId);
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (!coverDrag || coverDrag.pointerId !== e.pointerId) return;
                          const deltaPercent = ((e.clientY - coverDrag.startY) / coverDrag.height) * 100;
                          setDraftCoverFocusY(clampPercent(coverDrag.startFocusY - deltaPercent));
                        }}
                        onPointerUp={(e) => {
                          if (coverDrag?.pointerId === e.pointerId) setCoverDrag(null);
                        }}
                        onPointerCancel={(e) => {
                          if (coverDrag?.pointerId === e.pointerId) setCoverDrag(null);
                        }}
                        className="relative h-44 overflow-hidden rounded-[var(--radius-xl)] bg-[color:var(--color-deep-space)] touch-none sm:h-80"
                        style={{ cursor: coverDrag ? "grabbing" : "grab" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image */}
                        <img
                          src={draftCoverImageUrl}
                          alt={name}
                          className="h-full w-full select-none object-cover"
                          draggable={false}
                          style={{ objectPosition: `50% ${draftCoverFocusY}%` }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-44 items-center justify-center rounded-[var(--radius-xl)] bg-[color:var(--color-deep-space)] sm:h-80">
                        <span className="px-6 text-center text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                          First pick a photo in the &ldquo;Choose from uploads&rdquo; tab.
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                    Drag the cover up and down until the crop is exactly how you want it shown.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                    Choose a published photo assigned to this profile.
                  </p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftCoverMediaId(autoCoverItem?.id ?? null);
                        setDraftCoverFocusY(
                          autoCoverItem && autoCoverItem.id === initialCoverMediaId
                            ? currentCoverFocusY
                            : DEFAULT_COVER_FOCUS_Y,
                        );
                        setCoverTab("edit");
                      }}
                      className={`flex aspect-[16/10] items-center justify-center rounded-[var(--radius-xl)] border text-[length:var(--text-caption)] transition-colors ${
                        (!draftCoverMediaId || draftCoverMediaId === autoCoverItem?.id)
                          ? "border-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                          : "border-[color:var(--color-charcoal)] text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                      }`}
                    >
                      Auto
                    </button>
                    {visibleCoverLibraryItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={draftCoverMediaId === item.id}
                        onClick={() => {
                          setDraftCoverMediaId(item.id);
                          setDraftCoverFocusY(
                            item.id === initialCoverMediaId
                              ? currentCoverFocusY
                              : DEFAULT_COVER_FOCUS_Y,
                          );
                          setCoverTab("edit");
                        }}
                        className={`aspect-[16/10] overflow-hidden rounded-[var(--radius-xl)] border transition-colors ${
                          draftCoverMediaId === item.id
                            ? "border-[color:var(--color-netflix-red)]"
                            : "border-[color:var(--color-charcoal)]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image */}
                        <img
                          src={item.posterUrl}
                          alt={item.title ?? name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  {coverLibraryPages > 1 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                        Page {coverLibraryPage + 1} / {coverLibraryPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={coverLibraryPage === 0}
                          onClick={() => setCoverLibraryPage((page) => Math.max(0, page - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={coverLibraryPage >= coverLibraryPages - 1}
                          onClick={() =>
                            setCoverLibraryPage((page) => Math.min(coverLibraryPages - 1, page + 1))
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {photoMedia.length === 0 ? (
                    <p className="text-[length:var(--text-caption)] text-[color:var(--color-ash)]">
                      This model has no published photos yet that could be used as a cover.
                    </p>
                  ) : null}
                </div>
              )}
              </div>
            </div>

            {coverError ? (
              <p role="alert" className="text-[length:var(--text-caption)] text-[color:var(--color-netflix-red)]">
                {coverError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="button" onClick={saveCover} disabled={pending}>
                <Save aria-hidden size={16} />
                Save cover
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCoverEditorOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {canEdit && avatarEditorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile photo"
          onClick={() => setAvatarEditorOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-deep-space)]/82 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-4xl max-h-[90vh] flex-col gap-5 overflow-hidden rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
                  Profile photo
                </h2>
                <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                  Resize the selection and drag it into place. This avatar also appears on `/search`.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setAvatarEditorOpen(false)}>
                <X aria-hidden size={16} />
                Close
              </Button>
            </div>

            <div className="inline-flex w-fit rounded-[var(--radius-lg)] border border-[color:var(--color-charcoal)] bg-[color:var(--color-graphite)] p-1">
              <button
                type="button"
                aria-pressed={avatarTab === "edit"}
                onClick={() => setAvatarTab("edit")}
                className={`rounded-[var(--radius-sm)] px-4 py-2 text-[length:var(--text-caption)] font-semibold transition-colors ${
                  avatarTab === "edit"
                    ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                    : "text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                }`}
              >
                Edit current
              </button>
              <button
                type="button"
                aria-pressed={avatarTab === "library"}
                onClick={() => setAvatarTab("library")}
                className={`rounded-[var(--radius-sm)] px-4 py-2 text-[length:var(--text-caption)] font-semibold transition-colors ${
                  avatarTab === "library"
                    ? "bg-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                    : "text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                }`}
              >
                Choose from uploads
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
              {avatarTab === "edit" ? (
                <div className="flex flex-col gap-4">
                  <div className="mx-auto w-full max-w-[520px] rounded-[var(--radius-2xl)] bg-[color:var(--color-graphite)] p-3">
                    {draftAvatarImageUrl && draftAvatarCrop ? (
                      <ReactCrop
                        key={draftAvatarMediaId ?? "auto-avatar"}
                        crop={draftAvatarCrop}
                        onChange={(_, percentCrop) => setDraftAvatarCrop(percentCrop)}
                        aspect={1}
                        minWidth={96}
                        minHeight={96}
                        keepSelection
                        ruleOfThirds
                        className="avatar-crop"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image */}
                        <img
                          src={draftAvatarImageUrl}
                          alt={name}
                          className="max-h-[520px] w-full rounded-[var(--radius-xl)] object-contain"
                          onLoad={(event) => {
                            const { naturalWidth, naturalHeight } = event.currentTarget;
                            if (!naturalWidth || !naturalHeight) return;
                            setDraftAvatarCrop((currentCrop) =>
                              normalizeProfileAvatarPercentCrop(
                                currentCrop ?? resolveAvatarCropForItem(draftAvatarItem),
                                { width: naturalWidth, height: naturalHeight },
                              ),
                            );
                          }}
                        />
                      </ReactCrop>
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-[var(--radius-xl)] bg-[color:var(--color-deep-space)]">
                        <span className="px-6 text-center text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                          First pick a photo in the &ldquo;Choose from uploads&rdquo; tab.
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                    Resize the crop by dragging its corners and move the whole selection across the photo.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                    Choose a published photo assigned to this profile.
                  </p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftAvatarMediaId(autoAvatarItem?.id ?? null);
                        setDraftAvatarCrop(resolveAvatarCropForItem(autoAvatarItem));
                        setAvatarTab("edit");
                      }}
                      className={`flex aspect-square items-center justify-center rounded-[var(--radius-xl)] border text-[length:var(--text-caption)] transition-colors ${
                        (!draftAvatarMediaId || draftAvatarMediaId === autoAvatarItem?.id)
                          ? "border-[color:var(--color-netflix-red)] text-[color:var(--color-chalk-white)]"
                          : "border-[color:var(--color-charcoal)] text-[color:var(--color-silver)] hover:text-[color:var(--color-chalk-white)]"
                      }`}
                    >
                      Auto
                    </button>
                    {visibleAvatarLibraryItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={draftAvatarMediaId === item.id}
                        onClick={() => {
                          setDraftAvatarMediaId(item.id);
                          setDraftAvatarCrop(resolveAvatarCropForItem(item));
                          setAvatarTab("edit");
                        }}
                        className={`aspect-square overflow-hidden rounded-[var(--radius-xl)] border transition-colors ${
                          draftAvatarMediaId === item.id
                            ? "border-[color:var(--color-netflix-red)]"
                            : "border-[color:var(--color-charcoal)]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image */}
                        <img
                          src={item.posterUrl}
                          alt={item.title ?? name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  {avatarLibraryPages > 1 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
                        Page {avatarLibraryPage + 1} / {avatarLibraryPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={avatarLibraryPage === 0}
                          onClick={() => setAvatarLibraryPage((page) => Math.max(0, page - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={avatarLibraryPage >= avatarLibraryPages - 1}
                          onClick={() =>
                            setAvatarLibraryPage((page) => Math.min(avatarLibraryPages - 1, page + 1))
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {photoMedia.length === 0 ? (
                    <p className="text-[length:var(--text-caption)] text-[color:var(--color-ash)]">
                      This model has no published photos yet that could be used as an avatar.
                    </p>
                  ) : null}
                </div>
              )}

              <aside className="flex flex-col items-center gap-3 rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)]/70 p-4">
                <div className="flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[color:var(--color-silver)]">
                  <Images aria-hidden size={14} />
                  Preview
                </div>
                <div
                  className="relative aspect-square h-36 w-36 shrink-0 overflow-hidden rounded-full border-4"
                  style={{ borderColor: "var(--color-deep-space)", background: "var(--gradient-feature-card)" }}
                >
                  {draftAvatarImageUrl ? (
                    <ProfileAvatarImage
                      src={draftAvatarImageUrl}
                      alt={name}
                      percentCrop={draftAvatarCrop}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <p className="text-center text-[length:var(--text-caption)] text-[color:var(--color-ash)]">
                  Final circular avatar
                </p>
                {avatarError ? (
                  <p role="alert" className="text-center text-[length:var(--text-caption)] text-[color:var(--color-netflix-red)]">
                    {avatarError}
                  </p>
                ) : null}
              </aside>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={saveAvatar} disabled={pending}>
                <Save aria-hidden size={16} />
                Save avatar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAvatarEditorOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasMedia ? (
        <BrowsableGrid
          media={media}
          canEdit={canEdit}
          models={modelOptions}
          tagSuggestions={uploadTagSuggestions}
        />
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <ImageOff aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          This model has no content yet.
        </p>
      )}

      {canUpload && uploadModel ? (
        <ModelDetailUpload
          model={uploadModel}
          tagSuggestions={uploadTagSuggestions}
        />
      ) : null}

      {/* Potvrzení smazání s volbou rozsahu. */}
      {canEdit && confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete model"
          onClick={() => setConfirmOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-deep-space)]/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
            className="flex w-full max-w-md max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-[var(--radius-2xl)] border bg-[color:var(--color-deep-space)] p-6"
          >
            <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
              Delete model &ldquo;{name}&quot;?
            </h2>
            <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
              Choose what to delete. This action can&apos;t be undone.
            </p>
            {error && (
              <p role="alert" className="text-[length:var(--text-caption)] text-[color:var(--color-netflix-red)]">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" onClick={() => remove(false)} disabled={pending}>
                Delete model only (keep media)
              </Button>
              <Button type="button" variant="danger" onClick={() => remove(true)} disabled={pending}>
                <Trash2 aria-hidden size={16} />
                Delete model and media
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ModelDetail;
