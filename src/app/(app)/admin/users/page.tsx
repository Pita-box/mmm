/**
 * Admin — přehled uživatelů (task 21.2, R15.1/R15.2/R15.5/R15.6). Načte reálné
 * účty a změnu stavu napojuje na `setUserStatusAction` (vč. revokace relací).
 */
import { UsersOverview, type AdminUserRow } from "@/components/admin";
import type { AccountStatus, Role } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  setUserStatusAction,
  setUserRoleAction,
  setUserMembershipAction,
} from "../admin-actions";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const rows = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      subscriptionStatus: true,
      membershipExpiresAt: true,
    },
  });

  const users: AdminUserRow[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    subscriptionStatus: u.subscriptionStatus,
    membershipExpiresAt: u.membershipExpiresAt?.toISOString() ?? null,
  }));

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

  async function onSetMembership(
    userId: string,
    active: boolean,
    expiresAt: string | null,
  ): Promise<void> {
    "use server";
    await setUserMembershipAction(userId, active, expiresAt);
  }

  return (
    <UsersOverview
      users={users}
      currentUserId={admin.userId}
      onToggleStatus={onToggleStatus}
      onChangeRole={onChangeRole}
      onSetMembership={onSetMembership}
    />
  );
}
