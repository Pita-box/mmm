/**
 * Admin — správa štítků (kategorie + hodnoty). Přejmenování a mazání hodnot
 * v rámci 6 fixních kategorií. Jen Admin.
 */
import { TagManager } from "@/components/admin";
import { tagService } from "@/services/tag-service";
import { requireAdmin } from "@/lib/session";
import { renameTagValueAction, deleteTagValueAction } from "../admin-actions";

export default async function AdminTagsPage() {
  await requireAdmin();
  const values = await tagService.listValuesWithId();

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-[length:var(--text-heading-sm)] font-black text-chalk-white">
          Tags and categories
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] text-silver">
          Rename or delete tag values. Categories are fixed; tags are used to
          filter media.
        </p>
      </header>

      <TagManager
        values={values}
        onRename={renameTagValueAction}
        onDelete={deleteTagValueAction}
      />
    </section>
  );
}
