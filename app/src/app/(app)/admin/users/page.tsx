/**
 * Admin — přehled uživatelů (task 21.2, R15.1/R15.2/R15.5/R15.6). Načte reálné
 * účty a změnu stavu napojuje na `setUserStatusAction` (vč. revokace relací).
 */
import { UsersOverview, type AdminUserRow } from "@/components/admin";
import type { AccountStatus, Role } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { setUserStatusAction, setUserRoleAction } from "../admin-actions";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const users: AdminUserRow[] = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, status: true },
  });

  async function onToggleStatus(
    userId: string,
    next: AccountStatus,
  ): Promise<void> {
    "use server";
    await setUserStatusAction(userId, next);
  }

  async function onChangeRole(userId: string, role: Role): Promise<void> {
    "use server";
    await setUserRoleAction(userId, role);
  }

  return (
    <UsersOverview
      users={users}
      currentUserId={admin.userId}
      onToggleStatus={onToggleStatus}
      onChangeRole={onChangeRole}
    />
  );
}
