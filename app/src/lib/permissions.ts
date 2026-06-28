/**
 * Oprávnění podle role — čisté funkce (feature „distributor").
 *
 * Matice:
 *  - User        … jen prohlížení
 *  - Distributor … nahrávat + editovat média/modely; mazat JEN vlastní média
 *  - Admin        … vše (vč. správy uživatelů, rolí, viditelnosti, oznámení)
 */
import type { Role } from "./domain";

/** Smí nahrávat a editovat média/modely (Distributor i Admin). */
export function canUpload(role: Role): boolean {
  return role === "Admin" || role === "Distributor";
}

/** Smí spravovat uživatele, role, viditelnost a oznámení (jen Admin). */
export function canManageAdmin(role: Role): boolean {
  return role === "Admin";
}

/**
 * Smí smazat dané médium? Admin jakékoli; Distributor jen to, které sám nahrál
 * (`uploaderId === userId`); User nikdy. Legacy média bez `uploaderId` (null)
 * smí mazat jen Admin.
 */
export function canDeleteMedia(
  role: Role,
  userId: string,
  media: { readonly uploaderId: string | null },
): boolean {
  if (role === "Admin") return true;
  if (role === "Distributor") return media.uploaderId === userId;
  return false;
}
