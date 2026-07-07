// Feature: mmmred-streaming-dashboard, Property 42: Nový účet má výchozí neaktivní předplatné
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import { defaultSubscriptionStatus } from "./subscription-service";
import type { PasswordHasher } from "@/lib/password";
import { isOk } from "@/lib/result";
import { validateEmail, validatePassword } from "@/lib/validation";

/**
 * Property 42: Nový účet má výchozí neaktivní předplatné.
 *
 * Pro libovolný nově vytvořený účet platí, že jeho výchozí stav předplatného
 * je neaktivní (`subscriptionStatus === "inactive"`). Ověřuje se jak přes
 * `AuthService.register` (in-memory repozitář + fake hasher, žádná DB), tak
 * přes čistý helper `defaultSubscriptionStatus()`.
 *
 * **Validates: Requirements 20.7**
 *
 * Test pracuje s čistou logikou nad in-memory repozitářem (fake, ne mock) a
 * deterministním fake hasherem — žádná DB ani argon2.
 */

/** Determinní fake hasher — rychlý, bez argon2, pro logické testy. */
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `h:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `h:${plain}`;
  },
};

/** Generátor segmentu e-mailu bez bílých znaků, bez `@` a bez `.`. */
const segment = (minLength: number) =>
  fc.string({ unit: "grapheme-ascii", minLength, maxLength: 12 }).filter(
    (s) => /^[^\s@.]+$/.test(s),
  );

/** Generátor platné registrace (e-mail local@domain.tld 5–254, heslo 8–128). */
const validRegistration = fc
  .record({
    local: segment(1),
    domain: segment(1),
    tld: segment(2),
    password: fc.string({ minLength: 8, maxLength: 128 }),
  })
  .map(({ local, domain, tld, password }) => ({
    email: `${local}@${domain}.${tld}`,
    password,
  }))
  .filter((r) => validateEmail(r.email) && validatePassword(r.password));

describe("Property 42: nový účet má výchozí neaktivní předplatné", () => {
  it("každý nově registrovaný účet má subscriptionStatus 'inactive'", async () => {
    await fc.assert(
      fc.asyncProperty(validRegistration, async (input) => {
        // Čerstvá služba pro každou iteraci → žádná kolize unikátního e-mailu.
        const svc = new AuthService(new InMemoryAuthRepository(), fakeHasher);

        const result = await svc.register(input);

        // Platný vstup musí vést k vytvoření účtu.
        expect(isOk(result)).toBe(true);
        if (!isOk(result)) return;

        // Výchozí stav předplatného nového účtu je neaktivní (R20.7).
        expect(result.value.subscriptionStatus).toBe("inactive");
      }),
      { numRuns: 100 },
    );
  });

  it("čistý helper defaultSubscriptionStatus() vrací 'inactive'", () => {
    // Helper je deterministický a nezávislý na vstupu — invariant musí platit
    // bez ohledu na okolní stav (R20.7).
    fc.assert(
      fc.property(fc.anything(), () => {
        expect(defaultSubscriptionStatus()).toBe("inactive");
      }),
      { numRuns: 100 },
    );
  });
});
