/**
 * Admin — viditelnost stránek (task 21.2, R16.1). Načte aktuální mapu skrytých
 * sekcí a přepínání napojuje na `setVisibilityAction`.
 */
import { PageVisibilityToggles } from "@/components/admin";
import { pageVisibilityService } from "@/services/page-visibility-service";
import { requireAdmin } from "@/lib/session";
import { setVisibilityAction } from "../admin-actions";

export default async function AdminPagesPage() {
  await requireAdmin();
  const hiddenSections = await pageVisibilityService.getHiddenSections();

  async function onToggle(sectionKey: string, hidden: boolean): Promise<void> {
    "use server";
    await setVisibilityAction(sectionKey, hidden);
  }

  return (
    <PageVisibilityToggles hiddenSections={hiddenSections} onToggle={onToggle} />
  );
}
