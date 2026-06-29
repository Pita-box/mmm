"use client";

/**
 * TagManager — správa hodnot štítků (přejmenování/mazání) seskupených podle
 * 6 fixních kategorií. Kategorie samotné jsou neměnné; spravují se jen hodnoty.
 * Prezentační — akce přes props (server actions).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check } from "lucide-react";
import { FIXED_CATEGORIES } from "@/lib/domain";
import { AdminCard, Button } from "./admin-ui";

export interface TagValueRow {
  readonly id: string;
  readonly category: string;
  readonly value: string;
}

export interface TagManagerProps {
  readonly values: readonly TagValueRow[];
  readonly onRename: (id: string, value: string) => Promise<{ ok: boolean; message?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

const INPUT_CLASS =
  "min-w-0 flex-1 rounded-[var(--radius-lg)] border border-charcoal bg-[color:var(--color-graphite)] px-3 py-1.5 text-[length:var(--text-caption)] text-chalk-white focus:border-netflix-red focus:outline-none";

function TagRow({
  row,
  pending,
  onRename,
  onDelete,
}: {
  readonly row: TagValueRow;
  readonly pending: boolean;
  readonly onRename: (value: string) => void;
  readonly onDelete: () => void;
}) {
  const [draft, setDraft] = useState(row.value);
  const dirty = draft.trim() !== row.value && draft.trim() !== "";

  return (
    <li className="flex items-center gap-2 py-1.5">
      <input
        aria-label={`Hodnota ${row.value}`}
        className={INPUT_CLASS}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) {
            e.preventDefault();
            onRename(draft.trim());
          }
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={pending || !dirty}
        title="Přejmenovat"
        onClick={() => onRename(draft.trim())}
      >
        <Check aria-hidden size={14} />
      </Button>
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        title="Smazat hodnotu"
        onClick={onDelete}
      >
        <Trash2 aria-hidden size={14} />
      </Button>
    </li>
  );
}

export function TagManager({ values, onRename, onDelete }: TagManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.message ?? "Akce se nezdařila.");
      else {
        setError(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-[length:var(--text-caption)] text-netflix-red">
          {error}
        </p>
      ) : null}

      {FIXED_CATEGORIES.map((category) => {
        const rows = values.filter((v) => v.category === category);
        return (
          <AdminCard key={category} title={category} description={`${rows.length} hodnot`}>
            {rows.length === 0 ? (
              <p className="text-[length:var(--text-caption)] text-ash">Žádné hodnoty.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-graphite">
                {rows.map((row) => (
                  <TagRow
                    key={row.id}
                    row={row}
                    pending={pending}
                    onRename={(value) => run(() => onRename(row.id, value))}
                    onDelete={() => {
                      if (window.confirm(`Smazat hodnotu „${row.value}"? Odebere se ze všech médií.`)) {
                        run(() => onDelete(row.id));
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </AdminCard>
        );
      })}
    </div>
  );
}
