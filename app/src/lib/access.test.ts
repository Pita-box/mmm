import { describe, it, expect } from "vitest";
import {
  decideAccess,
  SESSION_INACTIVITY_LIMIT_MS,
  type RequestContext,
  type AccessConfig,
} from "./access";

const NOW = new Date("2026-01-01T12:00:00.000Z");

/** Sestaví kontext s rozumnými výchozími hodnotami (přihlášený aktivní User). */
function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    path: "/",
    isApiRoute: false,
    now: NOW,
    session: { lastActivityAt: NOW },
    role: "User",
    accountStatus: "active",
    hiddenSections: {},
    subscriptionStatus: "inactive",
    ...overrides,
  };
}

const MVP: AccessConfig = { paymentsEnabled: false };
const POST_MVP: AccessConfig = { paymentsEnabled: true };

describe("decideAccess — veřejné cesty (R1.3)", () => {
  it.each(["/signin", "/signup", "/paywall"])(
    "povolí veřejnou cestu %s i bez relace",
    (path) => {
      const decision = decideAccess(
        ctx({ path, session: null, role: null }),
        MVP,
      );
      expect(decision.outcome).toBe("allow");
    },
  );

  it("povolí veřejnou cestu s koncovým lomítkem", () => {
    expect(decideAccess(ctx({ path: "/signin/", session: null }), MVP).outcome).toBe(
      "allow",
    );
  });
});

describe("decideAccess — autentizace (R1.1, R1.2, R21.4)", () => {
  it("neautentizovaný požadavek na stránku → redirectSignIn s callbackUrl", () => {
    const decision = decideAccess(
      ctx({ path: "/models", session: null, role: null }),
      MVP,
    );
    expect(decision.outcome).toBe("redirectSignIn");
    expect(decision.callbackUrl).toBe("/models");
  });

  it("neautentizovaný požadavek na media API → deny401 (žádný redirect)", () => {
    const decision = decideAccess(
      ctx({ path: "/api/media", isApiRoute: true, session: null, role: null }),
      MVP,
    );
    expect(decision.outcome).toBe("deny401");
    expect(decision.callbackUrl).toBeUndefined();
  });
});

describe("decideAccess — stav účtu a vypršení relace (R1.6, R15.3, R15.4)", () => {
  it("zablokovaný účet je považován za neautentizovaný", () => {
    const decision = decideAccess(
      ctx({ path: "/models", accountStatus: "blocked" }),
      MVP,
    );
    expect(decision.outcome).toBe("redirectSignIn");
    expect(decision.callbackUrl).toBe("/models");
  });

  it("relace přesně na hranici 30 min inaktivity je vypršelá", () => {
    const stale = new Date(NOW.getTime() - SESSION_INACTIVITY_LIMIT_MS);
    const decision = decideAccess(
      ctx({ path: "/models", session: { lastActivityAt: stale } }),
      MVP,
    );
    expect(decision.outcome).toBe("redirectSignIn");
  });

  it("relace těsně pod hranicí inaktivity je stále platná", () => {
    const fresh = new Date(NOW.getTime() - (SESSION_INACTIVITY_LIMIT_MS - 1));
    const decision = decideAccess(
      ctx({ path: "/models", session: { lastActivityAt: fresh } }),
      MVP,
    );
    expect(decision.outcome).toBe("allow");
  });
});

describe("decideAccess — page visibility (R16.3)", () => {
  it("skrytá sekce vrací 404", () => {
    const decision = decideAccess(
      ctx({ path: "/models/123", hiddenSections: { models: true } }),
      MVP,
    );
    expect(decision.outcome).toBe("deny404");
  });

  it("ne-skrytá sekce projde dál", () => {
    const decision = decideAccess(
      ctx({ path: "/models", hiddenSections: { search: true } }),
      MVP,
    );
    expect(decision.outcome).toBe("allow");
  });

  it("skrytí má přednost před kontrolou role (404 i pro admin cestu)", () => {
    const decision = decideAccess(
      ctx({ path: "/admin/users", role: "User", hiddenSections: { admin: true } }),
      MVP,
    );
    expect(decision.outcome).toBe("deny404");
  });

  it("Admin má přístup i ke skryté sekci (skrytí blokuje jen ostatní role)", () => {
    const decision = decideAccess(
      ctx({ path: "/models/123", role: "Admin", hiddenSections: { models: true } }),
      MVP,
    );
    expect(decision.outcome).toBe("allow");
  });
});

describe("decideAccess — role (R3.3, R9.6)", () => {
  it("User na administrátorské stránce → deny403", () => {
    expect(
      decideAccess(ctx({ path: "/admin/users", role: "User" }), MVP).outcome,
    ).toBe("deny403");
  });

  it("User na administrátorském API → deny403", () => {
    expect(
      decideAccess(
        ctx({ path: "/api/admin/media", isApiRoute: true, role: "User" }),
        MVP,
      ).outcome,
    ).toBe("deny403");
  });

  it("Admin na administrátorské cestě → allow", () => {
    expect(
      decideAccess(ctx({ path: "/admin/users", role: "Admin" }), MVP).outcome,
    ).toBe("allow");
  });

  it("User na běžné chráněné cestě → allow", () => {
    expect(decideAccess(ctx({ path: "/models", role: "User" }), MVP).outcome).toBe(
      "allow",
    );
  });
});

describe("decideAccess — platební režim (R20.6, R21.1, R21.2, R21.5)", () => {
  it("MVP režim: neaktivní předplatné nebrání přístupu", () => {
    expect(
      decideAccess(ctx({ path: "/models", subscriptionStatus: "inactive" }), MVP)
        .outcome,
    ).toBe("allow");
  });

  it("post-MVP režim: neaktivní předplatné → redirectPaywall", () => {
    expect(
      decideAccess(
        ctx({ path: "/models", subscriptionStatus: "inactive" }),
        POST_MVP,
      ).outcome,
    ).toBe("redirectPaywall");
  });

  it("post-MVP režim: aktivní předplatné → allow", () => {
    expect(
      decideAccess(
        ctx({ path: "/models", subscriptionStatus: "active" }),
        POST_MVP,
      ).outcome,
    ).toBe("allow");
  });

  it("post-MVP režim: i media API s neaktivním předplatným → redirectPaywall", () => {
    expect(
      decideAccess(
        ctx({
          path: "/api/media",
          isApiRoute: true,
          subscriptionStatus: "inactive",
        }),
        POST_MVP,
      ).outcome,
    ).toBe("redirectPaywall");
  });
});
