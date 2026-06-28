"use client";

/**
 * MediaEditPanel — dodatečná úprava metadat média (plán 011).
 *
 * Umožní přiřadit médium k profilu modelu (nebo odpojit) a spravovat štítky
 * (přidat hodnotu v kategorii, odebrat existující). Slouží hlavně pro média
 * naimportovaná z Drive, která nemají model ani štítky, a tudíž se neobjeví
 * v albu modelu ani ve filtrech. Prezentační komponenta — akce přes props.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
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
  ) => Promise<{ ok: boolean; message?: string }>;
  readonly onRemoveTag: (
    mediaId: string,
    tagValueId: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Existující hodnoty štítků po kategoriích pro našeptávač (plán 012). */
  readonly tagSuggestions?: Partial<Record<string, string[]>>;
}

const SELECT_CLASS =
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
}: MediaEditPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(FIXED_CATEGORIES[0]);
  const [value, setValue] = useState("");

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.message ?? "Akce se nezdařila.");
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-graphite p-3">
      {error ? (
        <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
          {error}
        </p>
      ) : null}

      {/* Model */}
      <label className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] text-silver">
        Model
        <select
          className={SELECT_CLASS}
          value={currentModelId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => onAssignModel(mediaId, e.target.value || null))}
        >
          <option value="">— bez modelu —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {/* Štítky */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Kategorie štítku"
            className={SELECT_CLASS}
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
            className={SELECT_CLASS}
            list={`edit-tags-${mediaId}-${category}`}
            placeholder="hodnota (víc oddělte čárkou)"
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
          />
          <datalist id={`edit-tags-${mediaId}-${category}`}>
            {(tagSuggestions[category] ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || value.trim() === ""}
            onClick={() =>
              run(async () => {
                // Čárka odděluje víc hodnot (plán 012); přidá postupně, stop na chybě.
                let last: { ok: boolean; message?: string } = { ok: true };
                for (const v of splitTagInput(value)) {
                  last = await onAddTag(mediaId, category, v);
                  if (!last.ok) return last;
                }
                if (last.ok) setValue("");
                return last;
              })
            }
          >
            <Plus aria-hidden size={14} />
            Přidat štítek
          </Button>
        </div>

        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li
                key={t.id}
                className="inline-flex items-center gap-1 rounded-[var(--radius-pills)] bg-charcoal px-2 py-0.5 text-[length:var(--text-caption)] text-chalk-white"
              >
                <span className="text-silver">{t.category}:</span>
                {t.value}
                <button
                  type="button"
                  aria-label={`Odebrat štítek ${t.value}`}
                  disabled={pending}
                  className="ml-0.5 cursor-pointer rounded-[var(--radius-pills)] p-0.5 hover:text-netflix-red disabled:opacity-50"
                  onClick={() => run(() => onRemoveTag(mediaId, t.id))}
                >
                  <X aria-hidden size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
