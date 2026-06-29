/**
 * Stránka Models — seznam všech modelů jako collage dlaždice (R13.1, R13.3).
 *
 * Data se čtou z `Model_Service.listProfilesWithPreview()` — každá dlaždice nese
 * jméno, počet médií a collage z posledních 3 Approved_Media (náhledy přes proxy
 * `/api/thumb/<token>`, R6.4). Neexistuje-li žádný model, zobrazí se prázdný stav
 * (R13.3).
 */
import { MediaCollageCard } from "@/components/MediaCollageCard";
import { modelService } from "@/services/model-service";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { thumbUrlFor } from "@/lib/media-presentation";
import { Users } from "lucide-react";

export default async function ModelsPage() {
  const principal = await requireSession();
  await requireVisibleSection("models", principal.role);
  const profiles = await modelService.listProfilesWithPreview();

  return (
    <section>
      <h1 className="mb-8 text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
        Models
      </h1>

      {profiles.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {profiles.map((model) => (
            <MediaCollageCard
              key={model.id}
              href={`/models/${model.id}`}
              title={model.name}
              count={model.mediaCount}
              posters={model.recentMediaIds
                .map((id) => thumbUrlFor(id, principal.userId))
                .filter((u): u is string => Boolean(u))}
            />
          ))}
        </div>
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <Users aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Zatím nejsou k dispozici žádní modelové.
        </p>
      )}
    </section>
  );
}
