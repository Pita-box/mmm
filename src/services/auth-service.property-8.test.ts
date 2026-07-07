// Feature: mmmred-streaming-dashboard, Property 8: Nový účet má právě jednu výchozí roli User
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isOk } from "@/lib/result";
import { validateEmail, validatePassword } from "@/lib/validation";

/**
 * Property 8: Nový účet má právě jednu výchozí roli User.
 *
 * Pro libovolný nově vytvořený účet platí, že má přiřazenu právě jednu roli
 * z {Admin, User} a výchozí hodnotou je User; nikdy neexistuje účet bez role
 * nebo s více rolemi.
 *
 * **Validates: Requirements 3.1, 3.2**
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

/** Povolená množina rolí — účet musí mít právě jednu z nich (R3.1). */
const ALLOWED_ROLES = new Set(["Admin", "User"]);

/** Generátor segmentu e-mailu bez bílých znaků a bez znaku `@`. */
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

describe("Property 8: nový účet má právě jednu výchozí roli User", () => {
  it("každý nově registrovaný účet má roli přesně User", async () => {
    await fc.assert(
      fc.asyncProperty(validRegistration, async (input) => {
        // Čerstvá služba pro každou iteraci → žádná kolize unikátního e-mailu.
        const svc = new AuthService(new InMemoryAuthRepository(), fakeHasher);

        const result = await svc.register(input);

        // Platný vstup musí vést k vytvoření účtu.
        expect(isOk(result)).toBe(true);
        if (!isOk(result)) return;

        const { role } = result.value;
        // Role je právě jedna z {Admin, User} (R3.1) a výchozí je User (R3.2).
        expect(ALLOWED_ROLES.has(role)).toBe(true);
        expect(role).toBe("User");
      }),
      { numRuns: 100 },
    );
  });
});
