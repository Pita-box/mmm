"use client";

/**
 * MediaEditPanel — úprava metadat média (plán 011/012).
 *
 * Dva režimy:
 *  - kompaktní (admin list): jeden select kategorie + vstup; změny se ukládají
 *    okamžitě (optimisticky).
 *  - `expanded` (lightbox edit dialog): všech 6 kategorií najednou, edituje se
 *    **lokálně** a uloží se vše najednou tlačítkem „Uložit" (žádné per-štítek
 *    server volání). Štítek se přidá Enterem nebo čárkou při psaní.
 * Prezentační — akce přes props.
 */
import { useEffect, useState, useTransition } from "react";
import { X, Plus, Save } from "lucide-react";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { splitTagInput } from "@/services/tag-service";
import { Button } from "./admin-ui";

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
  /** Rozbalený režim: všech 6 kategorií + tlačítko Uložit (lightbox). */
  readonly expanded?: boolean;
  /** Voláno po úspěšném uložení (expanded) — např. toast v rodiči. */
  readonly onSaved?: () => void;
}

const FIELD_CLASS =
  "rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-2 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

function TagChip({
  chip,
  disabled,
  onRemove,
  withCategory,
}: {
  readonly chip: MediaTagChip;
  readonly disabled: boolean;
  readonly onRemove: () => void;
  readonly withCategory?: boolean;
}) {
  return (
    <li className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-charcoal px-2 py-0.5 text-[length:var(--text-caption)] text-chalk-white">
      {withCategory ? <span className="text-silver">{chip.category}:</span> : null}
      {chip.value}
      <button
        type="button"
        aria-label={`Odebrat štítek ${chip.value}`}
        disabled={disabled}
        className="ml-0.5 cursor-pointer rounded-[var(--radius-sm)] p-0.5 hover:text-netflix-red disabled:opacity-50"
        onClick={onRemove}
      >
        <X aria-hidden size={12} />
      </button>
    </li>
  );
}

/** Vstup pro jednu kategorii: přidá štítek Enterem nebo čárkou při psaní. */
function CategoryTagInput({
  mediaId,
  category,
  chips,
  suggestions,
  onCommit,
  onRemove,
}: {
  readonly mediaId: string;
  readonly category: string;
  readonly chips: readonly MediaTagChip[];
  readonly suggestions: readonly string[];
  readonly onCommit: (category: string, raw: string) => void;
  readonly onRemove: (tagValueId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = `edit-${mediaId}-${category}`;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[length:var(--text-caption)] font-semibold text-silver">{category}</span>
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <TagChip key={c.id} chip={c} disabled={false} onRemove={() => onRemove(c.id)} />
          ))}
        </ul>
      ) : null}
      <input
        aria-label={`Štítky — ${category}`}
        className={FIELD_CLASS}
        list={listId}
        placeholder="napiš a stiskni Enter nebo čárku"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw.includes(",")) {
            const parts = raw.split(",");
            const remainder = parts.pop() ?? "";
            onCommit(category, parts.join(","));
            setDraft(remainder);
          } else {
            setDraft(raw);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(category, draft);
            setDraft("");
          }
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function MediaEditPanel({
  mediaId,
  currentModelId,
  models,
  tags,
  onAssignModel,
  onAddTag,
  onRemoveTag,
  tagSuggestions = {},
  expanded = false,
  onSaved,
}: MediaEditPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(FIXED_CATEGORIES[0]);
  const [value, setValue] = useState("");
  const [localTags, setLocalTags] = useState<MediaTagChip[]>(() => [...tags]);
  const [localModelId, setLocalModelId] = useState<string>(currentModelId ?? "");

  // Reset při změně média (komponenta se v lightboxu nepřemontuje).
  useEffect(() => {
    setLocalTags([...tags]);
    setLocalModelId(currentModelId ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  // Přidá hodnoty do lokálního stavu (čárkou oddělené), dedup case-insensitive.
  const addLocal = (cat: string, raw: string) => {
    setLocalTags((prev) => {
      const next = [...prev];
      for (const v of splitTagInput(raw)) {
        if (next.some((t) => t.category === cat && t.value.toLowerCase() === v.toLowerCase())) continue;
        next.push({ id: `tmp-${cat}-${v}-${Math.random().toString(36).slice(2)}`, category: cat, value: v });
      }
      return next;
    });
  };
  const removeLocal = (id: string) => setLocalTags((prev) => prev.filter((t) => t.id !== id));

  // ── EXPANDED: lokální editace + uložit vše najednou ─────────────────────────
  // Server actions MUSÍ běžet sériově (Next nepodporuje paralelní dispatch →
  // jinak „An unexpected response was received from the server").
  const save = () => {
    startTransition(async () => {
      if ((localModelId || null) !== (currentModelId ?? null)) {
        const r = await onAssignModel(mediaId, localModelId || null);
        if (!r.ok) return setError(r.message ?? "Uložení modelu selhalo.");
      }
      for (const orig of tags) {
        if (!localTags.some((t) => t.id === orig.id)) {
          const r = await onRemoveTag(mediaId, orig.id);
          if (!r.ok) return setError(r.message ?? "Odebrání štítku selhalo.");
        }
      }
      const added = localTags.filter((t) => t.id.startsWith("tmp-"));
      const idMap: Record<string, string> = {};
      for (const t of added) {
        const r = await onAddTag(mediaId, t.category, t.value);
        if (!r.ok) return setError(r.message ?? "Přidání štítku selhalo.");
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
        <option value="">— bez modelu —</option>
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

  if (expanded) {
    return (
      <div className="flex flex-col gap-4">
        {errorLine}
        {modelSelect(setLocalModelId, localModelId)}
        {FIXED_CATEGORIES.map((cat) => (
          <CategoryTagInput
            key={cat}
            mediaId={mediaId}
            category={cat}
            chips={localTags.filter((t) => t.category === cat)}
            suggestions={tagSuggestions[cat] ?? []}
            onCommit={addLocal}
            onRemove={removeLocal}
          />
        ))}
        <Button type="button" disabled={pending} onClick={save}>
          <Save aria-hidden size={16} />
          {pending ? "Ukládám…" : "Uložit"}
        </Button>
      </div>
    );
  }

  // ── KOMPAKTNÍ (admin list): okamžité ukládání per akce ──────────────────────
  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const res = await action();
      setError(res.ok ? null : res.message ?? "Akce se nezdařila.");
    });
  };
  const commitImmediate = (cat: string, raw: string) => {
    const vals = splitTagInput(raw).filter(
      (v) => !localTags.some((t) => t.category === cat && t.value.toLowerCase() === v.toLowerCase()),
    );
    if (vals.length === 0) return;
    const temp = vals.map((v) => ({
      id: `tmp-${cat}-${v}-${Math.random().toString(36).slice(2)}`,
      category: cat,
      value: v,
    }));
    setLocalTags((prev) => [...prev, ...temp]);
    startTransition(async () => {
      // Sériově (Next nepodporuje paralelní server actions).
      for (const chip of temp) {
        const res = await onAddTag(mediaId, chip.category, chip.value);
        if (!res.ok) {
          setLocalTags((prev) => prev.filter((t) => t.id !== chip.id));
          setError(res.message ?? "Štítek se nepodařilo přidat.");
        } else if (res.tagValueId) {
          setLocalTags((prev) => prev.map((t) => (t.id === chip.id ? { ...t, id: res.tagValueId! } : t)));
        }
      }
    });
  };
  const removeImmediate = (id: string) => {
    const removed = localTags.find((t) => t.id === id);
    setLocalTags((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const res = await onRemoveTag(mediaId, id);
      if (!res.ok && removed) {
        setLocalTags((prev) => [...prev, removed]);
        setError(res.message ?? "Štítek se nepodařilo odebrat.");
      }
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-graphite p-3">
      {errorLine}
      {modelSelect((v) => run(() => onAssignModel(mediaId, v || null)), currentModelId ?? "")}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Kategorie štítku"
            className={FIELD_CLASS}
            value={category}
            disabled={pending}
            onChange={(e) => setCategory(e.target.value)}
          >
            {FIXED_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            aria-label="Hodnota štítku"
            className={FIELD_CLASS}
            list={`edit-tags-${mediaId}-${category}`}
            placeholder="hodnota (Enter / čárka přidá)"
            value={value}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw.includes(",")) {
                const parts = raw.split(",");
                const remainder = parts.pop() ?? "";
                commitImmediate(category, parts.join(","));
                setValue(remainder);
              } else {
                setValue(raw);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitImmediate(category, value);
                setValue("");
              }
            }}
          />
          <datalist id={`edit-tags-${mediaId}-${category}`}>
            {(tagSuggestions[category] ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="secondary"
            disabled={value.trim() === ""}
            onClick={() => {
              commitImmediate(category, value);
              setValue("");
            }}
          >
            <Plus aria-hidden size={14} />
            Přidat štítek
          </Button>
        </div>

        {localTags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {localTags.map((t) => (
              <TagChip key={t.id} chip={t} disabled={false} onRemove={() => removeImmediate(t.id)} withCategory />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
