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
import { MIN_TAG_VALUE_LENGTH, MAX_TAG_VALUE_LENGTH } from "@/services/tag-service";
import { isErr } from "@/lib/result";
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

/** Velikost chunku resumable uploadu — násobek 256 KB dle Drive protokolu. */
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Nahraje soubor po částech PŘÍMO na Drive resumable `uploadUrl` (bajty nejdou
 * přes náš server). Vrací `driveFileId`. 308 = pokračuj, 200/201 = hotovo.
 */
async function uploadResumable(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  let offset = 0;
  let fileId = "";
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
      body: file.slice(offset, end),
    });
    if (res.status === 308) {
      offset = end;
    } else if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      fileId = data.id ?? "";
      offset = file.size;
    } else {
      throw new Error(`Nahrávání selhalo (HTTP ${res.status}).`);
    }
    onProgress(Math.round((end / file.size) * 100));
  }
  if (!fileId) throw new Error("Drive nevrátil ID souboru.");
  return fileId;
}

/** Vstup pro hodnoty jedné kategorie štítků — chips s přidáním a odebráním. */
function TagCategoryInput({
  category,
  values,
  onChange,
}: {
  readonly category: TagCategory;
  readonly values: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = `tag-${category.replace(/\s+/g, "-").toLowerCase()}`;

  function addValue() {
    const trimmed = draft.trim();
    if (
      trimmed.length < MIN_TAG_VALUE_LENGTH ||
      trimmed.length > MAX_TAG_VALUE_LENGTH
    ) {
      return;
    }
    // Deduplikace case-insensitive (R7.4) — stejná hodnota se nepřidá dvakrát.
    const exists = values.some((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (!exists) onChange([...values, trimmed]);
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
          maxLength={MAX_TAG_VALUE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder={`Přidat hodnotu do „${category}“`}
        />
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

export function MediaUploadForm({ models = [], onCreateSession, onFinalize }: MediaUploadFormProps) {
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
