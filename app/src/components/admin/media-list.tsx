"use client";

/**
 * AdminMediaList — seznam médií s mazáním (feature „distributor").
 *
 * Tlačítko Smazat je aktivní jen pro média, která daný uživatel smí smazat
 * (`canDelete` spočítá server přes `canDeleteMedia`): Admin jakékoli, Distributor
 * jen vlastní. Server akce `onDelete` provede autorizaci ještě jednou
 * (defense-in-depth). Prezentační komponenta — data i akce přes props.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Eye, EyeOff } from "lucide-react";
import type { MediaStatus } from "@/lib/domain";
import { AdminCard, Button, Badge } from "./admin-ui";
import {
  MediaEditPanel,
  type MediaModelOption,
  type MediaTagChip,
} from "./media-edit-panel";

export interface AdminMediaRow {
  readonly id: string;
  readonly label: string;
  readonly status: MediaStatus;
  /** Smí přihlášený uživatel toto médium smazat? */
  readonly canDelete: boolean;
  /** Aktuálně přiřazený model (nebo null). Pro editační panel (plán 011). */
  readonly modelId: string | null;
  /** Štítky média (chips s možností odebrání). */
  readonly tags: readonly MediaTagChip[];
}

export interface AdminMediaListProps {
  readonly rows: readonly AdminMediaRow[];
  /** Nabídka modelů pro přiřazení v editačním panelu. */
  readonly models: readonly MediaModelOption[];
  /** Server akce mazání; vrací výsledek pro chybovou hlášku. */
  readonly onDelete: (id: string) => Promise<{ ok: boolean; message?: string }>;
  /** Server akce změny viditelnosti (publikovat / skrýt). */
  readonly onSetPublished: (
    id: string,
    published: boolean,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Server akce přiřazení/odpojení modelu (plán 011). */
  readonly onAssignModel: (
    id: string,
    modelId: string | null,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Server akce přidání štítku (plán 011). */
  readonly onAddTag: (
    id: string,
    category: string,
    value: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Server akce odebrání štítku (plán 011). */
  readonly onRemoveTag: (
    id: string,
    tagValueId: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}

function StatusBadge({ status }: { readonly status: MediaStatus }) {
  const tone =
    status === "published" ? "positive" : status === "hidden" ? "negative" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function AdminMediaList({
  rows,
  models,
  onDelete,
  onSetPublished,
  onAssignModel,
  onAddTag,
  onRemoveTag,
}: AdminMediaListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <AdminCard
      title="Média"
      description="Smazat lze vlastní nahrávky (Distributor) nebo jakékoli (Admin)."
    >
      {error ? (
        <p role="alert" className="mb-3 text-[length:var(--text-caption)] text-netflix-red">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-[length:var(--text-body)] text-silver">
          Zatím žádná média.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-graphite">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[length:var(--text-body)] text-chalk-white">
                    {row.label}
                  </span>
                  <StatusBadge status={row.status} />
                </span>
                <span className="flex items-center gap-2">
                  {row.status === "published" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      title="Skrýt z webu"
                      onClick={() => run(() => onSetPublished(row.id, false))}
                    >
                      <EyeOff aria-hidden size={14} className="mr-1.5" />
                      Skrýt
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      title="Publikovat na web"
                      onClick={() => run(() => onSetPublished(row.id, true))}
                    >
                      <Eye aria-hidden size={14} className="mr-1.5" />
                      Publikovat
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!row.canDelete || pending}
                    title={row.canDelete ? "Smazat médium" : "Smazat smí jen vlastník nebo Admin"}
                    onClick={() => run(() => onDelete(row.id))}
                  >
                    <Trash2 aria-hidden size={14} className="mr-1.5" />
                    Smazat
                  </Button>
                </span>
              </div>
              <MediaEditPanel
                mediaId={row.id}
                currentModelId={row.modelId}
                models={models}
                tags={row.tags}
                onAssignModel={onAssignModel}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
              />
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}
