import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { validateAndTouchSession, validateSession } from "./session";
import { SESSION_INACTIVITY_LIMIT_MS } from "./access";
import type { SessionPrincipal } from "./access-context";

/** Plán 002: DB-backed validace relace — revokace, inaktivita, refresh. */

const NOW = new Date("2026-01-01T12:00:00.000Z").getTime();

const principal: SessionPrincipal = {
  userId: "u1",
  sessionId: "s1",
  role: "User",
  accountStatus: "active",
  subscriptionStatus: "inactive",
  lastActivityAt: new Date(NOW - 1000).toISOString(),
};

/** Minimální fake `db.session` se záznamem o voláních delete/update. */
function fakeDb(row: unknown) {
  const calls = { deleted: 0, updated: 0 };
  const db = {
    session: {
      findUnique: async () => row,
      delete: async () => {
        calls.deleted += 1;
        return row;
      },
      update: async () => {
        calls.updated += 1;
        return row;
      },
    },
  } as unknown as Pick<PrismaClient, "session">;
  return { db, calls };
}

const sessionRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  lastActivityAt: new Date(NOW - 1000),
  user: { role: "User", status: "active", subscriptionStatus: "inactive" },
  ...over,
});

describe("validateAndTouchSession (plán 002)", () => {
  it("chybějící session → null (revokováno/odhlášeno)", async () => {
    const { db } = fakeDb(null);
    expect(await validateAndTouchSession(principal, db, NOW)).toBeNull();
  });

  it("zablokovaný účet → null (R15.3/15.4)", async () => {
    const { db } = fakeDb(
      sessionRow({ user: { role: "User", status: "blocked", subscriptionStatus: "inactive" } }),
    );
    expect(await validateAndTouchSession(principal, db, NOW)).toBeNull();
  });

  it("vypršelá inaktivita → null a záznam smazán (R1.6/2.3)", async () => {
    const { db, calls } = fakeDb(
      sessionRow({ lastActivityAt: new Date(NOW - SESSION_INACTIVITY_LIMIT_MS) }),
    );
    expect(await validateAndTouchSession(principal, db, NOW)).toBeNull();
    expect(calls.deleted).toBe(1);
  });

  it("aktivní → posune lastActivityAt a vrátí živé hodnoty z DB", async () => {
    const { db, calls } = fakeDb(
      sessionRow({ user: { role: "Admin", status: "active", subscriptionStatus: "active" } }),
    );
    const result = await validateAndTouchSession(principal, db, NOW);
    expect(result).not.toBeNull();
    expect(calls.updated).toBe(1);
    // role/subscription se přečtou z DB (oprava staleness ze SEC-03).
    expect(result?.role).toBe("Admin");
    expect(result?.subscriptionStatus).toBe("active");
    expect(result?.lastActivityAt).toBe(new Date(NOW).toISOString());
  });
});

describe("validateSession touch=false (plán 009 — read-only, žádná write-amplifikace)", () => {
  it("aktivní → vrátí principála a NEzapíše lastActivityAt", async () => {
    const { db, calls } = fakeDb(
      sessionRow({ user: { role: "Admin", status: "active", subscriptionStatus: "active" } }),
    );
    const result = await validateSession(principal, { touch: false }, db, NOW);
    expect(result).not.toBeNull();
    expect(calls.updated).toBe(0); // žádný zápis do DB
    expect(result?.role).toBe("Admin"); // živé hodnoty se pořád čtou
    // lastActivityAt zůstává původní z DB, neposouvá se na „now".
    expect(result?.lastActivityAt).toBe(new Date(NOW - 1000).toISOString());
  });

  it("chybějící session → null (i bez touch)", async () => {
    const { db, calls } = fakeDb(null);
    expect(await validateSession(principal, { touch: false }, db, NOW)).toBeNull();
    expect(calls.updated).toBe(0);
  });

  it("zablokovaný účet → null (i bez touch)", async () => {
    const { db } = fakeDb(
      sessionRow({ user: { role: "User", status: "blocked", subscriptionStatus: "inactive" } }),
    );
    expect(await validateSession(principal, { touch: false }, db, NOW)).toBeNull();
  });

  it("vypršelá inaktivita → null a záznam smazán (úklid běží i bez touch)", async () => {
    const { db, calls } = fakeDb(
      sessionRow({ lastActivityAt: new Date(NOW - SESSION_INACTIVITY_LIMIT_MS) }),
    );
    expect(await validateSession(principal, { touch: false }, db, NOW)).toBeNull();
    expect(calls.deleted).toBe(1);
    expect(calls.updated).toBe(0);
  });
});
