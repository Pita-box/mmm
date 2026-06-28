"use client";

/**
 * UsersOverview — přehled uživatelů a změna stavu účtu (task 20.6).
 *
 * Zobrazuje seznam účtů s e-mailem, rolí (Admin / User) a stavem
 * (active / blocked) — R15.5. Každý řádek nabízí akci zablokovat / odblokovat
 * (R15.1, R15.2). Prázdný seznam zobrazí informativní zprávu (R15.6).
 *
 * Komponenta je prezentační: data i akce přicházejí přes props. Skutečné
 * načtení uživatelů a změnu stavu (Auth_Service / Admin_Console backend) doplní
 * task 21.2 — `onToggleStatus` je zatím TODO stub.
 */
import type { Role, AccountStatus } from "@/lib/domain";
import { AdminCard, Button, Badge } from "./admin-ui";

/** Řádek přehledu uživatelů. */
export interface AdminUserRow {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly status: AccountStatus;
}

const ROLES: readonly Role[] = ["User", "Distributor", "Admin"];

export interface UsersOverviewProps {
  readonly users?: readonly AdminUserRow[];
  /** ID přihlášeného admina — jeho vlastní role nejde měnit (anti-lockout). */
  readonly currentUserId?: string;
  /**
   * Přepnutí stavu účtu na `next`. Při selhání zachovat původní stav (R15.7).
   */
  readonly onToggleStatus?: (
    userId: string,
    next: AccountStatus,
  ) => void | Promise<void>;
  /** Změna role uživatele (feature „distributor"). */
  readonly onChangeRole?: (
    userId: string,
    role: Role,
  ) => void | Promise<void>;
}

function RoleBadge({ role }: { readonly role: Role }) {
  const tone =
    role === "Admin" ? "accent" : role === "Distributor" ? "positive" : "neutral";
  return <Badge tone={tone}>{role}</Badge>;
}

function StatusBadge({ status }: { readonly status: AccountStatus }) {
  return status === "active" ? (
    <Badge tone="positive">Aktivní</Badge>
  ) : (
    <Badge tone="negative">Zablokován</Badge>
  );
}

export function UsersOverview({
  users = [],
  currentUserId,
  onToggleStatus,
  onChangeRole,
}: UsersOverviewProps) {
  return (
    <AdminCard
      title="Přehled uživatelů"
      description="Role a stav účtů. Roli lze změnit, účet zablokovat nebo odblokovat."
    >
      {users.length === 0 ? (
        <p className="text-[length:var(--text-body)] text-silver">
          Zatím nejsou žádné uživatelské účty.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-graphite">
          {users.map((user) => {
            const next: AccountStatus =
              user.status === "active" ? "blocked" : "active";
            const isSelf = user.id === currentUserId;
            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[length:var(--text-body)] text-chalk-white">
                    {user.email}
                  </span>
                  <span className="flex items-center gap-2">
                    <RoleBadge role={user.role} />
                    <StatusBadge status={user.status} />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${user.id}`}>
                    Role uživatele {user.email}
                  </label>
                  <select
                    id={`role-${user.id}`}
                    value={user.role}
                    disabled={isSelf}
                    title={isSelf ? "Vlastní roli nelze měnit" : "Změnit roli"}
                    onChange={(e) => {
                      void onChangeRole?.(user.id, e.target.value as Role);
                    }}
                    className="rounded-[var(--radius-lg)] border border-graphite bg-[color:var(--color-deep-space)] px-2 py-1 text-[length:var(--text-caption)] text-chalk-white disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant={user.status === "active" ? "danger" : "secondary"}
                    onClick={() => {
                      void onToggleStatus?.(user.id, next);
                    }}
                  >
                    {user.status === "active" ? "Zablokovat" : "Odblokovat"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}
