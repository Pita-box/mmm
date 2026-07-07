// Feature: mmmred-streaming-dashboard, Property 11: Round-trip přihlášení a odhlášení
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isOk } from "@/lib/result";
import { validateEmail, validatePassword } from "@/lib/validation";

/**
 * Property 11: Round-trip přihlášení a odhlášení.
 *
 * Pro libovolný platný účet platí, že po přihlášení existuje platná relace
 * (dohledatelná v repozitáři přes findSessionById) a po odhlášení tato relace
 * již není platná (findSessionById vrátí null).
 *
 * **Validates: Requirements 2.5**
 */

/** Determinní fake hasher — bez argon2, rychlý pro property běh (100+ iterací). */
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `h:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `h:${plain}`;
  },
};

/**
 * Generátor platného e-mailu `local@domain` o délce 5–254 (viz validateEmail).
 * Bez bílých znaků a bez znaku `@` v částech, s tečkou v doméně (TLD).
 */
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.stringMatching(/^[a-z0-9]{1,15}$/),
    fc.stringMatching(/^[a-z]{2,8}$/),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter(validateEmail);

/** Generátor platného hesla o délce 8–128 (viz validatePassword). */
const validPasswordArb = fc
  .string({ minLength: 8, maxLength: 128 })
  .filter(validatePassword);

describe("Property 11: Round-trip přihlášení a odhlášení", () => {
  it("po přihlášení existuje platná relace a po odhlášení už ne", async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validPasswordArb,
        async (email, password) => {
          // Čistý stav pro každý běh: vlastní repo i služba.
          const repo = new InMemoryAuthRepository();
          const svc = new AuthService(repo, fakeHasher);

          const registered = await svc.register({ email, password });
          expect(isOk(registered)).toBe(true);

          // Přihlášení vytvoří relaci.
          const login = await svc.login({ email, password });
          expect(isOk(login)).toBe(true);
          if (!isOk(login)) return;

          const sessionId = login.value.id;

          // Po přihlášení je relace platná (dohledatelná v repozitáři).
          expect(await repo.findSessionById(sessionId)).not.toBeNull();

          // Po odhlášení relace již není platná.
          await svc.logout(sessionId);
          expect(await repo.findSessionById(sessionId)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
