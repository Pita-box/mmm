// Feature: mmmred-streaming-dashboard, Property 6: Globálně skrytá sekce vrací 404 a stav přetrvává
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { PrismaClient, PageVisibility } from "@prisma/client";
import { createPageVisibilityService } from "./page-visibility-service";
import {
  decideAccess,
  type RequestContext,
  type AccessConfig,
} from "@/lib/access";
import { isOk } from "@/lib/result";

/**
 * Property 6: Globálně skrytá sekce vrací 404 a stav přetrvává.
 *
 * Pro libovolnou sekci platí, že je-li nastavena jako globálně skrytá,
 * požadavek na její cestu vrátí 404 (`decideAccess` → `deny404`); skrytí a
 * následné zobrazení sekce vrátí viditelnost do původního stavu (round-trip)
 * a nastavený stav viditelnosti přetrvává napříč relacemi (nová instance
 * služby nad stejnou perzistencí vidí stejný stav) až do explicitní změny.
 *
 * Test kombinuje perzistentní `createPageVisibilityService(prisma)`
 * (setHidden / isHidden / getHiddenSections) nad minimálním in-memory fake
 * Prisma klientem s čistou rozhodovací funkcí `decideAccess` z `@/lib/access`.
 *
 * **Validates: Requirements 16.2, 16.3, 16.5**
 */

/**
 * Minimální ruční in-memory fake PrismaClient pro model `PageVisibility`.
 *
 * Implementuje jen to, co Page_Visibility_Service volá:
 * `pageVisibility.upsert` (vloží nebo aktualizuje řádek dle `sectionKey`),
 * `pageVisibility.findUnique` a `pageVisibility.findMany`. Mapa `store` žije
 * v closure, takže **přetrvává napříč voláními i napříč instancemi služby**
 * vytvořenými nad stejným klientem — tím simuluje perzistenci přes relace
 * (R16.5). Žádná DB, žádný I/O.
 */
function createFakePrisma(): PrismaClient {
  const store = new Map<string, PageVisibility>();

  const pageVisibility = {
    async upsert({
      where,
      create,
      update,
    }: {
      where: { sectionKey: string };
      create: { sectionKey: string; hidden: boolean };
      update: { hidden: boolean };
    }): Promise<PageVisibility> {
      const existing = store.get(where.sectionKey);
      const row: PageVisibility = existing
        ? { ...existing, hidden: update.hidden }
        : { sectionKey: create.sectionKey, hidden: create.hidden };
      store.set(where.sectionKey, { ...row });
      return { ...row };
    },
    async findUnique({
      where,
    }: {
      where: { sectionKey: string };
    }): Promise<PageVisibility | null> {
      const row = store.get(where.sectionKey);
      return row ? { ...row } : null;
    },
    async findMany(): Promise<PageVisibility[]> {
      return [...store.values()].map((r) => ({ ...r }));
    },
  };

  return { pageVisibility } as unknown as PrismaClient;
}

const config: AccessConfig = { paymentsEnabled: false };

/**
 * Sestaví plně autentizovaný aktivní kontext (čerstvá relace, role User),
 * aby v pořadí vyhodnocení `decideAccess` zbylo jen rozhodnutí o viditelnosti
 * sekce. Cesta `/{sectionKey}` mapuje na sekci dle prvního segmentu.
 */
function makeContext(
  sectionKey: string,
  hiddenSections: Readonly<Record<string, boolean>>,
): RequestContext {
  const now = new Date("2026-01-01T12:00:00.000Z");
  return {
    path: `/${sectionKey}`,
    isApiRoute: false,
    now,
    session: { lastActivityAt: new Date(now.getTime() - 1000) },
    role: "User",
    accountStatus: "active",
    hiddenSections,
    subscriptionStatus: "inactive",
  };
}

/**
 * Klíče sekcí: 1–24 alfanumerických/pomlčkových znaků. Vyloučeny veřejné
 * cesty (signin/signup/paywall), které `decideAccess` vždy povolí ještě před
 * kontrolou viditelnosti — tam by 404 nemělo nastat bez ohledu na skrytí.
 */
const PUBLIC_KEYS = new Set(["signin", "signup", "paywall"]);
const sectionKeyArb = fc
  .stringMatching(/^[a-zA-Z0-9-]+$/)
  .filter((s) => s.length >= 1 && s.length <= 24 && !PUBLIC_KEYS.has(s));

/** Jeden příkaz: nastav viditelnost sekce na danou hodnotu. */
const commandArb = fc.record({
  sectionKey: sectionKeyArb,
  hidden: fc.boolean(),
});

/** Sekvence 1–15 příkazů — testuje toggling, round-trip i více sekcí. */
const commandsArb = fc.array(commandArb, { minLength: 1, maxLength: 15 });

describe("Property 6: globálně skrytá sekce vrací 404 a stav přetrvává", () => {
  it("skrytí → isHidden + deny404, round-trip zpět na viditelné, perzistence napříč relacemi", async () => {
    await fc.assert(
      fc.asyncProperty(commandsArb, async (commands) => {
        const prisma = createFakePrisma();
        const svc = createPageVisibilityService(prisma);

        // Očekávaný stav `section → hidden` po dosud provedených příkazech.
        const expected = new Map<string, boolean>();

        for (const { sectionKey, hidden } of commands) {
          const res = await svc.setHidden(sectionKey, hidden);
          // Uložení viditelnosti uspěje (fake nikdy neselže).
          expect(isOk(res)).toBe(true);
          expected.set(sectionKey, hidden);

          // isHidden odráží poslední nastavený stav (R16.2).
          expect(await svc.isHidden(sectionKey)).toBe(hidden);

          // decideAccess: skrytá sekce → deny404; viditelná → allow (R16.3).
          const map = await svc.getHiddenSections();
          const decision = decideAccess(makeContext(sectionKey, map), config);
          expect(decision.outcome).toBe(hidden ? "deny404" : "allow");
        }

        // Perzistovaná mapa odpovídá očekávání a přežije opakované čtení (R16.5).
        const first = await svc.getHiddenSections();
        const second = await svc.getHiddenSections();
        expect(second).toEqual(first);
        for (const [key, hidden] of expected) {
          expect(first[key]).toBe(hidden);
        }

        // Perzistence napříč relacemi: nová instance služby nad stejným
        // (perzistentním) klientem vidí identický stav až do explicitní změny.
        const svcNextSession = createPageVisibilityService(prisma);
        for (const [key, hidden] of expected) {
          expect(await svcNextSession.isHidden(key)).toBe(hidden);
          const map = await svcNextSession.getHiddenSections();
          const decision = decideAccess(makeContext(key, map), config);
          expect(decision.outcome).toBe(hidden ? "deny404" : "allow");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("round-trip: skrytí a následné zobrazení vrátí sekci do původního viditelného stavu", async () => {
    await fc.assert(
      fc.asyncProperty(sectionKeyArb, async (sectionKey) => {
        const prisma = createFakePrisma();
        const svc = createPageVisibilityService(prisma);

        // Výchozí stav: sekce bez záznamu je viditelná → allow.
        // (Pozn.: porovnává se přes `=== true`, takže i klíče shodné s názvy
        // vlastností prototypu jako "constructor" jsou korektně viditelné.)
        const before = await svc.getHiddenSections();
        expect(await svc.isHidden(sectionKey)).toBe(false);
        expect(
          decideAccess(makeContext(sectionKey, before), config).outcome,
        ).toBe("allow");

        // Skrytí → 404.
        await svc.setHidden(sectionKey, true);
        expect(await svc.isHidden(sectionKey)).toBe(true);
        const hiddenMap = await svc.getHiddenSections();
        expect(
          decideAccess(makeContext(sectionKey, hiddenMap), config).outcome,
        ).toBe("deny404");

        // Zobrazení → zpět na viditelné (round-trip).
        await svc.setHidden(sectionKey, false);
        expect(await svc.isHidden(sectionKey)).toBe(false);
        const shownMap = await svc.getHiddenSections();
        expect(
          decideAccess(makeContext(sectionKey, shownMap), config).outcome,
        ).toBe("allow");
      }),
      { numRuns: 100 },
    );
  });
});
