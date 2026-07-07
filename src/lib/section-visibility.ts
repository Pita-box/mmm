/**
 * Vynucení viditelnosti sekce na úrovni stránek (R16.3 + požadavek).
 *
 * Skrytá sekce není jen schovaná z navigace — pro ostatní role je i nedostupná
 * (404). Admin má přístup vždy. Server Components volají tuto stráž (Edge
 * middleware nečte viditelnost z DB; stránky ji proto vynucují zde, v Node).
 */
import { notFound } from "next/navigation";
import type { Role } from "@/lib/domain";
import { pageVisibilityService } from "@/services/page-visibility-service";

/**
 * Pokud je sekce globálně skrytá a uživatel není Admin, vyhodí `notFound()`
 * (vykreslí 404 template). Admin pokračuje bez omezení.
 */
export async function requireVisibleSection(
  sectionKey: string,
  role: Role,
): Promise<void> {
  if (role === "Admin") return;
  if (await pageVisibilityService.isHidden(sectionKey)) {
    notFound();
  }
}
