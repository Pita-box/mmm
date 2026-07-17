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
import { useState } from "react";
import type { Role, AccountStatus, SubscriptionStatus } from "@/lib/domain";
import { isActiveMember } from "@/lib/membership";
import { AdminCard, Button, Badge } from "./admin-ui";

/** Řádek přehledu uživatelů. */
export interface AdminUserRow {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly subscriptionStatus: SubscriptionStatus;
  /** ISO datum konce platnosti členství, nebo `null` (bez expirace / neaktivní). */
  readonly membershipExpiresAt: string | null;
}

const ROLES: readonly Role[] = ["User", "Distributor", "Admin"];

function formatCreatedAt(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(date);
}

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
  /** Nastavení aktivního členství + volitelné expirace (ISO datum, nebo null). */
  readonly onSetMembership?: (
    userId: string,
    active: boolean,
    expiresAt: string | null,
  ) => void | Promise<void>;
}

function RoleBadge({ role }: { readonly role: Role }) {
  const tone =
    role === "Admin" ? "accent" : role === "Distributor" ? "positive" : "neutral";
  return <Badge tone={tone}>{role}</Badge>;
}

function StatusBadge({ status }: { readonly status: AccountStatus }) {
  return status === "active" ? (
    <Badge tone="positive">Active</Badge>
  ) : (
    <Badge tone="negative">Blocked</Badge>
  );
}

/** Stav členství + ovládání (aktivace s volitelnou expirací / deaktivace). */
function MembershipControl({
  row,
  onSetMembership,
}: {
  readonly row: AdminUserRow;
  readonly onSetMembership?: UsersOverviewProps["onSetMembership"];
}) {
  // <input type="date"> chce YYYY-MM-DD; předvyplň existující expirací.
  const [date, setDate] = useState(
    row.membershipExpiresAt ? row.membershipExpiresAt.slice(0, 10) : "",
  );
  const member = isActiveMember({
    subscriptionStatus: row.subscriptionStatus,
    membershipExpiresAt: row.membershipExpiresAt ? new Date(row.membershipExpiresAt) : null,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {member ? (
        <Badge tone="positive">
          Membership{row.membershipExpiresAt ? ` until ${row.membershipExpiresAt.slice(0, 10)}` : " ∞"}
        </Badge>
      ) : (
        <Badge tone="neutral">No membership</Badge>
      )}
      <label className="sr-only" htmlFor={`exp-${row.id}`}>
        Membership expiry for {row.email}
      </label>
      <input
        id={`exp-${row.id}`}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        title="Expiry date (empty = no expiry)"
        className="rounded-[var(--radius-lg)] border border-graphite bg-[color:var(--color-deep-space)] px-2 py-1 text-[length:var(--text-caption)] text-chalk-white"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          void onSetMembership?.(row.id, true, date ? new Date(date).toISOString() : null);
        }}
      >
        Activate
      </Button>
      {member && (
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            void onSetMembership?.(row.id, false, null);
          }}
        >
          Revoke
        </Button>
      )}
    </div>
  );
}

export function UsersOverview({
  users = [],
  currentUserId,
  onToggleStatus,
  onChangeRole,
  onSetMembership,
}: UsersOverviewProps) {
  return (
    <AdminCard
      title="Users"
      description="Account roles and status. Change a role, block or unblock an account."
    >
      {users.length === 0 ? (
        <p className="text-[length:var(--text-body)] text-silver">
          No user accounts yet.
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
                className="flex flex-col gap-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[length:var(--text-body)] text-chalk-white">
                      {user.email}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[length:var(--text-caption)] text-silver">
                        Created: {formatCreatedAt(user.createdAt)}
                      </span>
                      <RoleBadge role={user.role} />
                      <StatusBadge status={user.status} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      Role for user {user.email}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role}
                      disabled={isSelf}
                      title={isSelf ? "You can't change your own role" : "Change role"}
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
                      {user.status === "active" ? "Block" : "Unblock"}
                    </Button>
                  </div>
                </div>
                <MembershipControl row={user} onSetMembership={onSetMembership} />
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}
