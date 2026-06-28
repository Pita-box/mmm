"use client";

/**
 * DriveImportButton — spustí import existujících souborů z Drive složky (plán 007).
 *
 * Soubory se na Drive nahrávají mimo web (Drive web / desktop klient / rclone);
 * tohle tlačítko jen zavolá serverovou akci `onImport`, která složku vylistuje a
 * založí chybějící `MediaItem` (jako `hidden`). Po úspěchu obnoví seznam.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderDown } from "lucide-react";
import { AdminCard, Button } from "./admin-ui";

export interface DriveImportButtonProps {
  /** Server akce importu; vrací výsledek pro hlášku (počty / chyba). */
  readonly onImport: () => Promise<{ ok: boolean; message?: string }>;
}

export function DriveImportButton({ onImport }: DriveImportButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <AdminCard
      title="Synchronizace s Google Drive"
      description="Nahrajte videa do sdílené Drive složky (web, desktop klient nebo rclone), pak synchronizujte. Velké soubory tak server nezatíží. Nové soubory se naimportují jako skryté (doplňte model/štítky a publikujte); média, jejichž soubor na Drive už není, se odeberou."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await onImport();
              setIsError(!res.ok);
              setMessage(res.message ?? (res.ok ? "Synchronizace dokončena." : "Synchronizace selhala."));
              if (res.ok) router.refresh();
            })
          }
        >
          <FolderDown aria-hidden size={16} />
          {pending ? "Synchronizuji…" : "Synchronizovat z Drive"}
        </Button>
        {message ? (
          <span
            role="status"
            className={`text-[length:var(--text-caption)] ${
              isError ? "text-netflix-red" : "text-silver"
            }`}
          >
            {message}
          </span>
        ) : null}
      </div>
    </AdminCard>
  );
}
