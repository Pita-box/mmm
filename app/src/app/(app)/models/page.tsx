/**
 * Stránka Models — seznam všech modelů jako karty (R13.1, R13.3).
 *
 * Data se čtou z `Model_Service.listProfiles()`. Každá karta nese jméno a
 * (zatím) placeholder vizuál (R13.2); profilová fotka se napojí přes proxy
 * Streaming_URL později. Neexistuje-li žádný model, zobrazí se prázdný stav
 * (R13.3).
 */
import { ModelCard } from "@/components/ModelCard";
import { modelService } from "@/services/model-service";
import { requireSession } from "@/lib/session";
import { Users } from "lucide-react";

export default async function ModelsPage() {
  await requireSession();
  const profiles = await modelService.listProfiles();

  return (
    <section>
      <h1 className="mb-8 text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
        Models
      </h1>

      {profiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {profiles.map((model) => (
            <ModelCard key={model.id} model={{ id: model.id, name: model.name }} />
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
