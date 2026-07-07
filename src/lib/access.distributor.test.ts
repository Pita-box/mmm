import { describe, it, expect } from "vitest";
import { decideAccess, type RequestContext, type AccessConfig } from "./access";

/** Feature „distributor": přístup role Distributor do admin sekcí. */

const MVP: AccessConfig = { paymentsEnabled: false };
const NOW = new Date("2026-01-01T12:00:00.000Z");

function ctx(path: string): RequestContext {
  return {
    path,
    isApiRoute: path.startsWith("/api/"),
    now: NOW,
    session: { lastActivityAt: new Date(NOW.getTime() - 1000) },
    role: "Distributor",
    accountStatus: "active",
    hiddenSections: {},
    subscriptionStatus: "inactive",
  };
}

describe("decideAccess — role Distributor", () => {
  it("smí na rozcestník /admin a sekce médií/modelů (vč. /api)", () => {
    for (const p of [
      "/admin",
      "/admin/media",
      "/admin/models",
      "/admin/models/123",
      "/api/admin/media",
    ]) {
      expect(decideAccess(ctx(p), MVP).outcome).toBe("allow");
    }
  });

  it("nesmí na Admin-only sekce (uživatelé, viditelnost, oznámení) → 403", () => {
    for (const p of ["/admin/users", "/admin/pages", "/admin/notifications"]) {
      expect(decideAccess(ctx(p), MVP).outcome).toBe("deny403");
    }
  });

  it("běžné chráněné cesty má jako každý přihlášený → allow", () => {
    expect(decideAccess(ctx("/models"), MVP).outcome).toBe("allow");
    expect(decideAccess(ctx("/search"), MVP).outcome).toBe("allow");
  });
});
