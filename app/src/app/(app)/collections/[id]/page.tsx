/**
 * Detail kolekce — obsah privátní kolekce (R14.3, R14.4, R14.5).
 *
 * Načte položky přes `Collection_Service.getItems` s kontrolou vlastnictví:
 * cizí kolekce → forbidden, neexistující → not_found (R14.5). U každého média
 * je akce odebrat z kolekce (R14.3). Náhledy jdou přes proxy Streaming_URL.
 */
import Link from "next/link";
import { FolderX, FolderOpen } from "lucide-react";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { membershipGate } from "@/lib/membership-gate";
import { collectionService } from "@/services/collection-service";
import { isErr, isOk } from "@/lib/result";
import { CollectionGallery } from "@/components/CollectionGallery";
import { toCardItem } from "@/lib/media-presentation";
import { removeMediaAction } from "../collections-actions";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requireSession();
  await requireVisibleSection("collections", principal.role);
  const gate = await membershipGate(principal);
  if (gate) return gate;
  const { id } = await params;
  const now = new Date();

  const itemsResult = await collectionService.getItems(id, principal.userId);
  if (isErr(itemsResult)) {
    // Cizí nebo neexistující kolekce — žádný obsah se neodhalí (R14.5).
    return (
      <section>
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          <FolderX aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Kolekce není dostupná.
        </p>
        <p className="text-center">
          <Link href="/collections" className="text-netflix-red hover:underline">
            Zpět na kolekce
          </Link>
        </p>
      </section>
    );
  }

  const collection = await collectionService.getCollection(id, principal.userId);
  const name = isOk(collection) ? collection.value.name : "Kolekce";
  const media = itemsResult.value.map((item) =>
    toCardItem(item, principal.userId, {}, now),
  );
  const count = media.length;
  const countLabel =
    count === 1 ? "1 soubor" : count >= 2 && count <= 4 ? `${count} soubory` : `${count} souborů`;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--text-heading-sm)] font-black text-[color:var(--color-chalk-white)]">
            {name}
          </h1>
          <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--color-silver)]">
            {countLabel}
          </p>
        </div>
        <Link href="/collections" className="text-[length:var(--text-caption)] text-silver hover:text-netflix-red">
          Zpět na kolekce
        </Link>
      </header>

      {media.length > 0 ? (
        <CollectionGallery
          collectionId={id}
          media={media}
          onRemove={removeMediaAction}
        />
      ) : (
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-ash)]">
          <FolderOpen aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Tato kolekce je prázdná.
        </p>
      )}
    </section>
  );
}
