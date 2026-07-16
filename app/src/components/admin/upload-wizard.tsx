"use client";

/**
 * UploadWizard — bulk nahrání + hromadné/individuální štítkování (plán 012).
 *
 * Tok: dropzone nahraje várku přímo na Drive → dvousloupcový editor (vlevo
 * náhled + fronta, vpravo model + 6 kategorií se štítky) s Prev/Next a
 * „použít na všechna" → finalize (publikovat vše / uložit skryté).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import { AdminCard, Button } from "./admin-ui";
import { UploadDropzone, type UploadedItem } from "./upload-dropzone";
import { TagValueInput } from "./tag-value-input";
import type { WizardUploadItem } from "@/app/(app)/admin/admin-actions";

/** Minimální tvar profilu modelu pro výběr v selectu. */
export interface ModelOption {
  readonly id: string;
  readonly name: string;
}

type TagMap = Partial<Record<TagCategory, string[]>>;
interface Meta {
  modelId: string;
  tags: TagMap;
}

export interface UploadWizardProps {
  readonly models: readonly ModelOption[];
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
  /** Externě dropnuté soubory (drop na /preview) — předají se do dropzone. */
  readonly initialFiles?: readonly File[] | null;
  /** Předvybraný model pro všechny nově nahrané položky. */
  readonly initialModelId?: string | null;
  /** Zamkne výběr modelu na `initialModelId`. */
  readonly lockModelSelection?: boolean;
  readonly onCreateSession: (
    name: string,
    mimeType: string,
    modelId?: string | null,
  ) => Promise<{ ok: boolean; uploadUrl?: string; message?: string }>;
  /** Nahrání vygenerovaného posteru videa na Drive (→ driveFileId). */
  readonly onUploadPoster?: (
    base64: string,
    name: string,
  ) => Promise<{ ok: boolean; driveFileId?: string; message?: string }>;
  readonly onFinalize: (
    items: readonly WizardUploadItem[],
    publish: boolean,
  ) => Promise<{ ok: boolean; created: number; failed: number; message?: string }>;
}

const SELECT_CLASS =
  "rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

export function UploadWizard({
  models,
  tagSuggestions = {},
  initialFiles,
  initialModelId = null,
  lockModelSelection = false,
  onCreateSession,
  onUploadPoster,
  onFinalize,
}: UploadWizardProps) {
  const router = useRouter();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cur, setCur] = useState(0);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const lockedModel = models.find((model) => model.id === initialModelId) ?? null;

  function onUploaded(uploaded: UploadedItem[]) {
    setItems((prev) => [...prev, ...uploaded]);
    setMetas((prev) => [
      ...prev,
      ...uploaded.map(() => ({ modelId: initialModelId ?? "", tags: {} as TagMap })),
    ]);
  }

  function patchCur(patch: Partial<Meta>) {
    setMetas((prev) => prev.map((m, i) => (i === cur ? { ...m, ...patch } : m)));
  }

  function addValuesArr(category: TagCategory, vals: readonly string[]) {
    setMetas((prev) =>
      prev.map((m, i) => {
        if (i !== cur) return m;
        const existing = m.tags[category] ?? [];
        const next = [...existing];
        for (const v of vals) {
          if (!next.some((e) => e.toLowerCase() === v.toLowerCase())) next.push(v);
        }
        return { ...m, tags: { ...m.tags, [category]: next } };
      }),
    );
  }

  function removeTag(category: TagCategory, value: string) {
    setMetas((prev) =>
      prev.map((m, i) =>
        i === cur ? { ...m, tags: { ...m.tags, [category]: (m.tags[category] ?? []).filter((v) => v !== value) } } : m,
      ),
    );
  }

  function applyToAll() {
    const src = metas[cur];
    setMetas((prev) => prev.map(() => ({ modelId: src.modelId, tags: { ...src.tags } })));
  }

  function finalize(publish: boolean) {
    startTransition(async () => {
      try {
        const payload: WizardUploadItem[] = items.map((it, i) => ({
          driveFileId: it.driveFileId,
          mimeType: it.mimeType,
          sizeBytes: it.sizeBytes,
          modelId: metas[i].modelId || null,
          tags: metas[i].tags,
          posterDriveFileId: it.posterDriveFileId ?? null,
        }));
        const res = await onFinalize(payload, publish);
        if (res.ok) {
          setResult(`Done: created ${res.created}.`);
          setItems([]);
          setMetas([]);
          setCur(0);
          router.refresh();
        } else {
          setResult(res.message ?? "Some items failed.");
        }
      } catch {
        setResult("The server did not confirm the result. Your tags are preserved; retry is safe.");
      }
    });
  }

  const item = items[cur];
  const meta = metas[cur];

  return (
    <AdminCard title="Upload media" description="Drop multiple files, tag them, and publish.">
      <UploadDropzone
        onCreateSession={onCreateSession}
        onUploadPoster={onUploadPoster}
        onUploaded={onUploaded}
        initialFiles={initialFiles}
        modelId={lockModelSelection ? (initialModelId ?? null) : null}
      />

      {result ? (
        <p role="status" className="mt-3 text-[length:var(--text-caption)] text-silver">
          {result}
        </p>
      ) : null}

      {item && meta ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {/* Levý sloupec: náhled + fronta */}
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-graphite">
              {item.mediaType === "video" ? (
                <video src={item.previewUrl} controls className="max-h-[60vh] w-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- lokální objectURL náhled
                <img src={item.previewUrl} alt={item.name} className="max-h-[60vh] w-full object-contain" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="secondary" disabled={cur === 0} onClick={() => setCur((c) => c - 1)}>
                <ChevronLeft aria-hidden size={14} /> Previous
              </Button>
              <span className="text-[length:var(--text-caption)] text-silver">
                {cur + 1} / {items.length}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={cur >= items.length - 1}
                onClick={() => setCur((c) => c + 1)}
              >
                Next <ChevronRight aria-hidden size={14} />
              </Button>
            </div>
            <p className="truncate text-[length:var(--text-caption)] text-ash">{item.name}</p>
          </div>

          {/* Pravý sloupec: model + štítky */}
          <div className="flex flex-col gap-4">
            {lockModelSelection && lockedModel ? (
              <label className="flex flex-col gap-1 text-[length:var(--text-caption)] text-silver">
                Model
                <div className={`${SELECT_CLASS} cursor-default opacity-90`}>
                  {lockedModel.name}
                </div>
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-[length:var(--text-caption)] text-silver">
                Model
                <select
                  className={SELECT_CLASS}
                  value={meta.modelId}
                  onChange={(e) => patchCur({ modelId: e.target.value })}
                >
                  <option value="">— no model —</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {FIXED_CATEGORIES.map((category) => (
              <TagValueInput
                key={`${cur}-${category}`}
                label={category}
                listId={`wiz-${category}`}
                values={meta.tags[category] ?? []}
                suggestions={tagSuggestions[category] ?? []}
                onAdd={(vals) => addValuesArr(category, vals)}
                onRemove={(value) => removeTag(category, value)}
              />
            ))}

            <Button type="button" variant="secondary" onClick={applyToAll} disabled={items.length < 2}>
              <Check aria-hidden size={14} /> Apply model and tags to all
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => finalize(true)}>
                {pending ? "Saving…" : "Publish all"}
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => finalize(false)}>
                Save hidden
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminCard>
  );
}
