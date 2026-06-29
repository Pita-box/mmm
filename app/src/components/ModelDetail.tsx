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
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Pencil, Trash2, Save, X } from "lucide-react";
import { BrowsableGrid } from "./BrowsableGrid";
import { Button, TextInput, TextArea, Field } from "./admin/admin-ui";
import type { MediaCardItem } from "./MediaCard";

type ActionResult = { ok: boolean; message?: string };

export interface ModelDetailProps {
  readonly modelId: string;
  readonly name: string;
  readonly bio: string;
  /** Náhled na banner (hero) přes proxy. */
  readonly coverUrl?: string;
  /** Náhled na avatar přes proxy. */
  readonly avatarUrl?: string;
  /** Distinct hodnoty štítků médií modelu. */
  readonly tags: readonly string[];
  /** Výhradně Approved_Media modelu (R13.4). */
  readonly media: readonly MediaCardItem[];
  /** Admin → zobrazí editaci a mazání. */
  readonly canEdit?: boolean;
  readonly onUpdate?: (values: { name: string; bio: string }) => Promise<ActionResult>;
  readonly onDelete?: (withMedia: boolean) => Promise<ActionResult>;
}

export function ModelDetail({
  modelId,
  name,
  bio,
  coverUrl,
  avatarUrl,
  tags,
  media,
  canEdit = false,
  onUpdate,
  onDelete,
}: ModelDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftBio, setDraftBio] = useState(bio);
  const [error, setError] = useState<string | null>(null);

  const hasMedia = media.length > 0;
  const hasBio = bio.trim().length > 0;
  void modelId; // identita drží volající přes navázané akce

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await onUpdate?.({ name: draftName, bio: draftBio });
      if (res && !res.ok) setError(res.message ?? "Uložení se nezdařilo.");
      else {
        setEditOpen(false);
        router.refresh();
      }
    });
  };

  const remove = (withMedia: boolean) => {
    startTransition(async () => {
      const res = await onDelete?.(withMedia);
      if (res && !res.ok) setError(res.message ?? "Smazání se nezdařilo.");
      else router.push("/models");
    });
  };

  return (
    <section>
      {/* Hero banner + avatar. */}
      <div className="relative mb-4">
        <div
          className="h-40 w-full overflow-hidden rounded-2xl sm:h-56"
          style={{ background: "var(--gradient-feature-card)" }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        {/* Admin toolbar vpravo nahoře nad bannerem. */}
        {canEdit && (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              type="button"
              aria-label="Upravit model"
              title="Upravit"
              onClick={() => {
                setDraftName(name);
                setDraftBio(bio);
                setError(null);
                setEditOpen((v) => !v);
              }}
              style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:bg-[color:var(--color-deep-space)]/80"
            >
              <Pencil aria-hidden size={18} />
            </button>
            <button
              type="button"
              aria-label="Smazat model"
              title="Smazat"
              onClick={() => setConfirmOpen(true)}
              style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-[color:var(--color-deep-space)]/60 text-[color:var(--color-chalk-white)] backdrop-blur-md transition-colors hover:text-[color:var(--color-netflix-red)]"
            >
              <Trash2 aria-hidden size={18} />
            </button>
          </div>
        )}

        {/* Avatar — překrývá spodní hranu banneru. */}
        <div
          className="absolute -bottom-10 left-6 h-24 w-24 overflow-hidden rounded-full border-4 sm:h-28 sm:w-28"
          style={{
            background: "var(--gradient-feature-card)",
            borderColor: "var(--color-deep-space)",
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy /api/thumb, ne next/image
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover object-top" />
          ) : null}
        </div>
      </div>

      {/* Jméno, bio, štítky. */}
      <header className="mb-8 mt-12 pl-1">
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          {name}
        </h1>
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
          <Field label="Jméno modelu" htmlFor="edit-model-name" error={error}>
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
              Uložit
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={pending}>
              <X aria-hidden size={16} />
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {hasMedia ? (
        <BrowsableGrid media={media} />
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <ImageOff aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Tento model zatím nemá žádný obsah.
        </p>
      )}

      {/* Potvrzení smazání s volbou rozsahu. */}
      {canEdit && confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Smazat model"
          onClick={() => setConfirmOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-deep-space)]/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ borderColor: "color-mix(in oklab, var(--color-chalk-white) 15%, transparent)" }}
            className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-2xl)] border bg-[color:var(--color-deep-space)] p-6"
          >
            <h2 className="text-[length:var(--text-subheading)] font-bold text-[color:var(--color-chalk-white)]">
              Smazat model „{name}&quot;?
            </h2>
            <p className="text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
              Vyber rozsah smazání. Tato akce je nevratná.
            </p>
            {error && (
              <p role="alert" className="text-[length:var(--text-caption)] text-[color:var(--color-netflix-red)]">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" onClick={() => remove(false)} disabled={pending}>
                Smazat jen model (média zůstanou)
              </Button>
              <Button type="button" variant="danger" onClick={() => remove(true)} disabled={pending}>
                <Trash2 aria-hidden size={16} />
                Smazat model i média
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
                Zrušit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ModelDetail;
