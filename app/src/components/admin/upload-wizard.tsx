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
import { ChevronLeft, ChevronRight, Plus, X, Check } from "lucide-react";
import { FIXED_CATEGORIES, type TagCategory } from "@/lib/domain";
import { splitTagInput } from "@/services/tag-service";
import { AdminCard, Button } from "./admin-ui";
import { UploadDropzone, type UploadedItem } from "./upload-dropzone";
import type { ModelOption } from "./media-upload-form";
import type { WizardUploadItem } from "@/app/(app)/admin/admin-actions";

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
  readonly onCreateSession: (
    name: string,
    mimeType: string,
  ) => Promise<{ ok: boolean; uploadUrl?: string; message?: string }>;
  readonly onFinalize: (
    items: readonly WizardUploadItem[],
    publish: boolean,
  ) => Promise<{ ok: boolean; created: number; failed: number; message?: string }>;
}

const SELECT_CLASS =
  "rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

export function UploadWizard({ models, tagSuggestions = {}, initialFiles, onCreateSession, onFinalize }: UploadWizardProps) {
  const router = useRouter();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cur, setCur] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function onUploaded(uploaded: UploadedItem[]) {
    setItems((prev) => [...prev, ...uploaded]);
    setMetas((prev) => [...prev, ...uploaded.map(() => ({ modelId: "", tags: {} as TagMap }))]);
  }

  function patchCur(patch: Partial<Meta>) {
    setMetas((prev) => prev.map((m, i) => (i === cur ? { ...m, ...patch } : m)));
  }

  function addValuesToMeta(category: TagCategory, raw: string) {
    const incoming = splitTagInput(raw);
    if (incoming.length === 0) return;
    setMetas((prev) =>
      prev.map((m, i) => {
        if (i !== cur) return m;
        const existing = m.tags[category] ?? [];
        const next = [...existing];
        for (const v of incoming) {
          if (!next.some((e) => e.toLowerCase() === v.toLowerCase())) next.push(v);
        }
        return { ...m, tags: { ...m.tags, [category]: next } };
      }),
    );
  }

  function addTag(category: TagCategory) {
    addValuesToMeta(category, drafts[category] ?? "");
    setDrafts((d) => ({ ...d, [category]: "" }));
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
      const payload: WizardUploadItem[] = items.map((it, i) => ({
        driveFileId: it.driveFileId,
        mimeType: it.mimeType,
        sizeBytes: it.sizeBytes,
        modelId: metas[i].modelId || null,
        tags: metas[i].tags,
      }));
      const res = await onFinalize(payload, publish);
      if (res.ok) {
        setResult(`Hotovo: vytvořeno ${res.created}.`);
        setItems([]);
        setMetas([]);
        setCur(0);
        router.refresh();
      } else {
        setResult(res.message ?? "Část položek selhala.");
      }
    });
  }

  const item = items[cur];
  const meta = metas[cur];

  return (
    <AdminCard title="Nahrát média" description="Přetáhněte více souborů, otagujte je a publikujte.">
      <UploadDropzone onCreateSession={onCreateSession} onUploaded={onUploaded} initialFiles={initialFiles} />

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
                <ChevronLeft aria-hidden size={14} /> Předchozí
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
                Další <ChevronRight aria-hidden size={14} />
              </Button>
            </div>
            <p className="truncate text-[length:var(--text-caption)] text-ash">{item.name}</p>
          </div>

          {/* Pravý sloupec: model + štítky */}
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-[length:var(--text-caption)] text-silver">
              Model
              <select
                className={SELECT_CLASS}
                value={meta.modelId}
                onChange={(e) => patchCur({ modelId: e.target.value })}
              >
                <option value="">— bez modelu —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            {FIXED_CATEGORIES.map((category) => {
              const values = meta.tags[category] ?? [];
              const listId = `wiz-${category}`;
              return (
                <div key={category} className="flex flex-col gap-1">
                  <span className="text-[length:var(--text-caption)] font-semibold text-silver">{category}</span>
                  <div className="flex gap-2">
                    <input
                      className={`${SELECT_CLASS} flex-1`}
                      list={listId}
                      placeholder="napiš a stiskni Enter nebo čárku"
                      value={drafts[category] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Čárka při psaní (i vložení řetězce) přidá hotové hodnoty hned.
                        if (raw.includes(",")) {
                          const parts = raw.split(",");
                          const remainder = parts.pop() ?? "";
                          addValuesToMeta(category, parts.join(","));
                          setDrafts((d) => ({ ...d, [category]: remainder }));
                        } else {
                          setDrafts((d) => ({ ...d, [category]: raw }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(category);
                        }
                      }}
                    />
                    <datalist id={listId}>
                      {(tagSuggestions[category] ?? []).map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <Button type="button" variant="secondary" onClick={() => addTag(category)}>
                      <Plus aria-hidden size={14} />
                    </Button>
                  </div>
                  {values.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {values.map((v) => (
                        <li
                          key={v}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-pills)] bg-charcoal px-2 py-0.5 text-[length:var(--text-caption)] text-chalk-white"
                        >
                          {v}
                          <button
                            type="button"
                            aria-label={`Odebrat ${v}`}
                            className="cursor-pointer p-0.5 hover:text-netflix-red"
                            onClick={() => removeTag(category, v)}
                          >
                            <X aria-hidden size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}

            <Button type="button" variant="secondary" onClick={applyToAll} disabled={items.length < 2}>
              <Check aria-hidden size={14} /> Použít model a štítky na všechna
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => finalize(true)}>
                {pending ? "Ukládám…" : "Publikovat vše"}
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => finalize(false)}>
                Uložit skryté
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminCard>
  );
}
