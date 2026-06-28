"use client";

/**
 * MediaUploadForm — nahrání média + štítkování + plánování (task 20.6).
 *
 * Sjednocuje tři administrátorské operace do jednoho formuláře:
 *  - upload souboru a přiřazení k profilu modelu (R5.1) s klientskou validací
 *    formátu a velikosti přes čisté jádro Media_Service (`validateUpload`),
 *  - štítkování přes 6 fixních kategorií (FIXED_CATEGORIES) s více hodnotami
 *    na kategorii (R7.2); hodnoty se zadávají jako chips, normalizace na duplicity
 *    běží case-insensitive,
 *  - plánování zveřejnění (`publishAt`); prázdné = zveřejnit ihned (R8.1).
 *
 * Skutečný upload (Drive_Connector + Media_Service + Tag_Service) doplní
 * task 21.2 — komponenta volá injektovaný `onSubmit` (TODO stub).
 */
import { useState } from "react";
import { Upload, Plus, X } from "lucide-react";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import { validateUpload, MAX_UPLOAD_BYTES } from "@/services/media-service";
import { MAX_TAG_VALUE_LENGTH, splitTagInput } from "@/services/tag-service";
import { isErr } from "@/lib/result";
import { uploadResumable } from "@/lib/resumable-upload";
import { AdminCard, Field, TextInput, Button, Badge } from "./admin-ui";

/** Minimální tvar profilu modelu pro výběr v selectu. */
export interface ModelOption {
  readonly id: string;
  readonly name: string;
}

/** Výběr štítků: kategorie → seznam hodnot. */
export type TagSelection = Partial<Record<TagCategory, string[]>>;

export interface MediaUploadValues {
  readonly file: File;
  /** Profil modelu, nebo `null` — přiřazení k modelu je nepovinné. */
  readonly modelId: string | null;
  readonly tags: TagSelection;
  /** ISO řetězec nebo `null` pro okamžité zveřejnění. */
  readonly publishAt: string | null;
}

export interface MediaUploadFormProps {
  /** Dostupné profily modelů pro přiřazení. */
  readonly models?: readonly ModelOption[];
  /** Existující hodnoty štítků po kategoriích pro našeptávač (plán 012). */
  readonly tagSuggestions?: Partial<Record<TagCategory, string[]>>;
  /** Vytvoří resumable session (server) → vrátí `uploadUrl` pro přímý upload do Drive. */
  readonly onCreateSession: (
    name: string,
    mimeType: string,
  ) => Promise<{ ok: boolean; uploadUrl?: string; message?: string }>;
  /** Po nahrání souboru do Drive vytvoří Media_Item + štítky. */
  readonly onFinalize: (input: {
    driveFileId: string;
    mimeType: string;
    sizeBytes: number;
    modelId: string | null;
    tags: TagSelection;
    publishAt: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
}

const MAX_UPLOAD_GB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024));

/** Vstup pro hodnoty jedné kategorie štítků — chips s přidáním a odebráním. */
function TagCategoryInput({
  category,
  values,
  onChange,
  suggestions = [],
}: {
  readonly category: TagCategory;
  readonly values: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly suggestions?: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const inputId = `tag-${category.replace(/\s+/g, "-").toLowerCase()}`;
  const listId = `${inputId}-list`;

  function addValue() {
    // Čárka odděluje víc hodnot: "daddy, bear" → 2 chipy (R7.2 UX, plán 012).
    const incoming = splitTagInput(draft);
    if (incoming.length === 0) return;
    const next = [...values];
    for (const v of incoming) {
      if (!next.some((e) => e.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    onChange(next);
    setDraft("");
  }

  function removeValue(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <Field label={category} htmlFor={inputId}>
      <div className="flex gap-2">
        <TextInput
          id={inputId}
          value={draft}
          list={suggestions.length > 0 ? listId : undefined}
          maxLength={MAX_TAG_VALUE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder={`Přidat do „${category}“ (víc oddělte čárkou)`}
        />
        {suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
        <Button type="button" variant="secondary" onClick={addValue}>
          <Plus aria-hidden size={14} />
          Přidat
        </Button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => removeValue(value)}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-charcoal px-2 py-0.5 text-[length:var(--text-caption)] text-chalk-white hover:bg-netflix-red"
                aria-label={`Odebrat ${value}`}
              >
                {value}
                <X aria-hidden size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  );
}

export function MediaUploadForm({ models = [], tagSuggestions = {}, onCreateSession, onFinalize }: MediaUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState("");
  const [tags, setTags] = useState<TagSelection>({});
  const [publishAt, setPublishAt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fileError = (() => {
    if (!submitted) return null;
    if (file === null) return "Vyberte soubor k nahrání.";
    const result = validateUpload({
      mimeType: file.type,
      sizeBytes: file.size,
    });
    return isErr(result) ? result.error.message : null;
  })();

  function setCategoryValues(category: TagCategory, next: string[]) {
    setTags((prev) => ({ ...prev, [category]: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    setDone(false);
    if (file === null) return;
    if (isErr(validateUpload({ mimeType: file.type, sizeBytes: file.size }))) {
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      // 1) resumable session (server) → 2) chunky přímo do Drive → 3) finalize.
      const session = await onCreateSession(file.name, file.type);
      if (!session.ok || !session.uploadUrl) {
        setError(session.message ?? "Nepodařilo se zahájit nahrávání.");
        return;
      }
      const driveFileId = await uploadResumable(session.uploadUrl, file, setProgress);
      const res = await onFinalize({
        driveFileId,
        mimeType: file.type,
        sizeBytes: file.size,
        modelId: modelId === "" ? null : modelId,
        tags,
        publishAt: publishAt === "" ? null : new Date(publishAt).toISOString(),
      });
      if (!res.ok) {
        setError(res.message ?? "Uložení média selhalo.");
        return;
      }
      // Reset po úspěchu.
      setDone(true);
      setFile(null);
      setModelId("");
      setTags({});
      setPublishAt("");
      setSubmitted(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard
      title="Nahrát médium"
      description={`Foto (JPEG/PNG/WebP) nebo video (MP4/MOV/WebM), max ${MAX_UPLOAD_GB} GB. Soubor se nahrává přímo na Google Drive (server nezatíží). Naplánujte zveřejnění nebo zveřejněte ihned.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Soubor" htmlFor="media-file" error={fileError}>
          <input
            id="media-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-body)] text-chalk-white file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-netflix-red file:px-3 file:py-1 file:text-chalk-white"
            aria-invalid={fileError != null}
          />
        </Field>

        <Field label="Profil modelu (nepovinné)" htmlFor="media-model">
          <select
            id="media-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-body)] text-chalk-white focus:border-netflix-red focus:outline-none"
          >
            <option value="">— Bez modelu —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-graphite p-4">
          <legend className="px-1 text-[length:var(--text-caption)] font-semibold text-silver">
            Štítky <Badge tone="accent">6 fixních kategorií</Badge>
          </legend>
          {FIXED_CATEGORIES.map((category) => (
            <TagCategoryInput
              key={category}
              category={category}
              values={tags[category] ?? []}
              suggestions={tagSuggestions[category] ?? []}
              onChange={(next) => setCategoryValues(category, next)}
            />
          ))}
        </fieldset>

        <Field
          label="Naplánovat zveřejnění"
          htmlFor="media-publish-at"
          hint="Prázdné = zveřejnit ihned. Čas musí být v budoucnu."
        >
          <TextInput
            id="media-publish-at"
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-3">
          {busy && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-graphite)]"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-[color:var(--color-netflix-red)] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="text-[length:var(--text-caption)] text-silver">
              Médium nahráno. Je skryté — doplňte štítky a publikujte v seznamu médií.
            </p>
          )}
          <div>
            <Button type="submit" disabled={busy}>
              <Upload aria-hidden size={16} />
              {busy ? `Nahrávám… ${progress} %` : "Nahrát médium"}
            </Button>
          </div>
        </div>
      </form>
    </AdminCard>
  );
}
