"use client";

/**
 * MediaEditPanel — úprava metadat média (plán 011/012).
 *
 * Lightbox edit dialog: všech 6 kategorií najednou, edituje se **lokálně** a
 * uloží se vše najednou tlačítkem „Uložit" (žádné per-štítek server volání).
 * Prezentační — akce přes props.
 */
import { useEffect, useState, useTransition } from "react";
import { Save } from "lucide-react";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { Button } from "./admin-ui";
import { TagValueInput } from "./tag-value-input";

export interface MediaTagChip {
  readonly id: string;
  readonly category: string;
  readonly value: string;
}

export interface MediaModelOption {
  readonly id: string;
  readonly name: string;
}

export interface MediaEditPanelProps {
  readonly mediaId: string;
  readonly currentModelId: string | null;
  readonly models: readonly MediaModelOption[];
  readonly tags: readonly MediaTagChip[];
  readonly onAssignModel: (
    mediaId: string,
    modelId: string | null,
  ) => Promise<{ ok: boolean; message?: string }>;
  readonly onAddTag: (
    mediaId: string,
    category: string,
    value: string,
  ) => Promise<{ ok: boolean; message?: string; tagValueId?: string }>;
  readonly onRemoveTag: (
    mediaId: string,
    tagValueId: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Existující hodnoty štítků po kategoriích pro našeptávač (plán 012). */
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
  /** Voláno po úspěšném uložení — např. toast v rodiči. */
  readonly onSaved?: () => void;
}

const FIELD_CLASS =
  "rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

export function MediaEditPanel({
  mediaId,
  currentModelId,
  models,
  tags,
  onAssignModel,
  onAddTag,
  onRemoveTag,
  tagSuggestions = {},
  onSaved,
}: MediaEditPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localTags, setLocalTags] = useState<MediaTagChip[]>(() => [...tags]);
  const [localModelId, setLocalModelId] = useState<string>(currentModelId ?? "");

  // Reset při změně média nebo při nově dodaných metadatech (lightbox zůstává mountovaný).
  useEffect(() => {
    setLocalTags([...tags]);
    setLocalModelId(currentModelId ?? "");
    setError(null);
  }, [mediaId, tags, currentModelId]);

  // Přidá hodnoty do lokálního stavu, dedup case-insensitive.
  const addLocalValues = (cat: string, vals: readonly string[]) => {
    setLocalTags((prev) => {
      const next = [...prev];
      for (const v of vals) {
        if (next.some((t) => t.category === cat && t.value.toLowerCase() === v.toLowerCase())) continue;
        next.push({ id: `tmp-${cat}-${v}-${Math.random().toString(36).slice(2)}`, category: cat, value: v });
      }
      return next;
    });
  };
  const removeLocalByValue = (cat: string, value: string) =>
    setLocalTags((prev) => prev.filter((t) => !(t.category === cat && t.value === value)));

  // Server actions MUSÍ běžet sériově (Next nepodporuje paralelní dispatch →
  // jinak „An unexpected response was received from the server").
  const save = () => {
    startTransition(async () => {
      if ((localModelId || null) !== (currentModelId ?? null)) {
        const r = await onAssignModel(mediaId, localModelId || null);
        if (!r.ok) return setError(r.message ?? "Failed to save model.");
      }
      for (const orig of tags) {
        if (!localTags.some((t) => t.id === orig.id)) {
          const r = await onRemoveTag(mediaId, orig.id);
          if (!r.ok) return setError(r.message ?? "Failed to remove tag.");
        }
      }
      const added = localTags.filter((t) => t.id.startsWith("tmp-"));
      const idMap: Record<string, string> = {};
      for (const t of added) {
        const r = await onAddTag(mediaId, t.category, t.value);
        if (!r.ok) return setError(r.message ?? "Failed to add tag.");
        if (r.tagValueId) idMap[t.id] = r.tagValueId;
      }
      // Reconcile temp id → reálné (kvůli pozdějšímu odebrání).
      setLocalTags((prev) => prev.map((t) => (idMap[t.id] ? { ...t, id: idMap[t.id] } : t)));
      setError(null);
      onSaved?.();
    });
  };

  const modelSelect = (onChange: (v: string) => void, current: string) => (
    <label className="flex flex-col gap-1.5 text-[length:var(--text-caption)] text-silver">
      Model
      <select
        className={FIELD_CLASS}
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— No model —</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );

  const errorLine = error ? (
    <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {errorLine}
      {modelSelect(setLocalModelId, localModelId)}
      {FIXED_CATEGORIES.map((cat) => (
        <TagValueInput
          key={cat}
          label={cat}
          listId={`edit-${mediaId}-${cat}`}
          values={localTags.filter((t) => t.category === cat).map((t) => t.value)}
          suggestions={tagSuggestions[cat] ?? []}
          onAdd={(vals) => addLocalValues(cat, vals)}
          onRemove={(value) => removeLocalByValue(cat, value)}
        />
      ))}
      <Button type="button" disabled={pending} onClick={save}>
        <Save aria-hidden size={16} />
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
