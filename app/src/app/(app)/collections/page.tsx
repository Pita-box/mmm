/**
 * Collections — seznam privátních kolekcí přihlášeného uživatele (R14.1, R14.4).
 *
 * Zobrazí pouze kolekce vlastněné aktuálním uživatelem (Collection_Service
 * filtruje dle vlastníka). Nabízí vytvoření nové kolekce a smazání existující
 * přes server actions (přímé `form action`).
 */
import Link from "next/link";
import { Library, Plus, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { collectionService } from "@/services/collection-service";
import { Field, TextInput, Button } from "@/components/admin";
import {
  createCollectionAction,
  deleteCollectionAction,
} from "./collections-actions";

export default async function CollectionsPage() {
  const principal = await requireSession();
  const collections = await collectionService.listCollections(principal.userId);

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
        <ul className="flex flex-col divide-y divide-graphite">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <Link
                href={`/collections/${collection.id}`}
                className="text-[length:var(--text-body)] text-chalk-white hover:text-netflix-red"
              >
                {collection.name}
              </Link>
              <form action={deleteCollectionAction}>
                <input type="hidden" name="id" value={collection.id} />
                <Button type="submit" variant="danger">
                  <Trash2 aria-hidden size={16} />
                  Smazat
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <Library aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Zatím nemáte žádné kolekce.
        </p>
      )}
    </section>
  );
}
