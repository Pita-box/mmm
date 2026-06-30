/**
 * Collections — seznam privátních kolekcí přihlášeného uživatele (R14.1, R14.4).
 *
 * Zobrazí pouze kolekce vlastněné aktuálním uživatelem (Collection_Service
 * filtruje dle vlastníka). Nabízí vytvoření nové kolekce a smazání existující
 * přes server actions (přímé `form action`).
 */
import { Library, Plus, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { membershipGate } from "@/lib/membership-gate";
import { collectionService } from "@/services/collection-service";
import { thumbUrlFor } from "@/lib/media-presentation";
import { MediaCollageCard } from "@/components/MediaCollageCard";
import { Field, TextInput, Button } from "@/components/admin";
import {
  createCollectionAction,
  deleteCollectionAction,
} from "./collections-actions";

export default async function CollectionsPage() {
  const principal = await requireSession();
  await requireVisibleSection("collections", principal.role);
  const gate = await membershipGate(principal);
  if (gate) return gate;
  const collections = await collectionService.listCollectionsWithPreview(principal.userId);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
          Collections
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          Vaše privátní kolekce dostupného obsahu.
        </p>
      </header>

      <form
        action={createCollectionAction}
        className="flex items-end gap-3 rounded-[var(--radius-2xl)] border border-graphite bg-[color:var(--color-deep-space)] p-5"
      >
        <div className="flex-1">
          <Field label="Nová kolekce" htmlFor="collection-name">
            <TextInput
              id="collection-name"
              name="name"
              maxLength={100}
              placeholder="Název kolekce (1–100 znaků)"
              required
            />
          </Field>
        </div>
        <Button type="submit">
          <Plus aria-hidden size={18} />
          Vytvořit
        </Button>
      </form>

      {collections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {collections.map((collection) => (
            <div key={collection.id} className="flex flex-col gap-2">
              <MediaCollageCard
                href={`/collections/${collection.id}`}
                title={collection.name}
                count={collection.mediaCount}
                posters={collection.recentMediaIds
                  .map((id) => thumbUrlFor(id, principal.userId))
                  .filter((u): u is string => Boolean(u))}
              />
              <form action={deleteCollectionAction}>
                <input type="hidden" name="id" value={collection.id} />
                <button
                  type="submit"
                  className="flex cursor-pointer items-center gap-1.5 text-[length:var(--text-caption)] text-[color:var(--color-ash)] transition-colors hover:text-[color:var(--color-netflix-red)]"
                >
                  <Trash2 aria-hidden size={14} />
                  Smazat
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <Library aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Zatím nemáte žádné kolekce.
        </p>
      )}
    </section>
  );
}
