// Feature: mmmred-streaming-dashboard, Property 12: Blokace po opakovaných neúspěšných pokusech
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  AuthService,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
} from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isOk, isErr } from "@/lib/result";
import { validateEmail, validatePassword } from "@/lib/validation";

/**
 * Property 12: Blokace po opakovaných neúspěšných pokusech.
 *
 * Pro libovolnou sekvenci pokusů o přihlášení platí, že po 5 po sobě jdoucích
 * neúspěšných pokusech je účet zablokován pro další pokusy po dobu 15 minut
 * (i správné heslo je odmítnuto s `locked_out`) a po uplynutí této doby je
 * opět možné se úspěšně přihlásit správným heslem.
 *
 * **Validates: Requirements 2.8**
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

/** Generátor platného e-mailu `local@domain` o délce 5–254 (viz validateEmail). */
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

/**
 * Špatné heslo, které se zaručeně liší od správného (fake hasher ověřuje
 * shodu řetězce). Připojením prefixu vznikne odlišný, stále neprázdný řetězec.
 */
function wrongPasswordFor(correct: string): string {
  return `WRONG#${correct}`;
}

describe("Property 12: Blokace po opakovaných neúspěšných pokusech", () => {
  it("po 5 neúspěšných pokusech je účet 15 min blokován a poté lze opět přihlásit", async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validPasswordArb,
        // Libovolný počet neúspěšných pokusů dosahující/překračující limit.
        fc.integer({ min: MAX_FAILED_ATTEMPTS, max: MAX_FAILED_ATTEMPTS + 10 }),
        async (email, password, failedCount) => {
          const repo = new InMemoryAuthRepository();
          const svc = new AuthService(repo, fakeHasher);

          const registered = await svc.register({ email, password });
          expect(isOk(registered)).toBe(true);

          const now = new Date("2025-01-01T12:00:00Z");
          const wrong = wrongPasswordFor(password);

          // Sekvence neúspěšných pokusů (každý se špatným heslem).
          for (let i = 0; i < failedCount; i++) {
            const attempt = await svc.login({ email, password: wrong }, now);
            expect(isErr(attempt)).toBe(true);
          }

          // Účet je nyní zablokován — i správné heslo je odmítnuto s `locked_out`.
          const blocked = await svc.login({ email, password }, now);
          expect(isErr(blocked)).toBe(true);
          if (isErr(blocked)) expect(blocked.error.code).toBe("locked_out");

          // Těsně před koncem okna stále platí blokace.
          const stillLocked = await svc.login(
            { email, password },
            new Date(now.getTime() + LOCKOUT_DURATION_MS - 1),
          );
          expect(isErr(stillLocked)).toBe(true);
          if (isErr(stillLocked)) {
            expect(stillLocked.error.code).toBe("locked_out");
          }

          // Po uplynutí 15 min se lze správným heslem opět přihlásit.
          const later = new Date(now.getTime() + LOCKOUT_DURATION_MS + 1);
          const success = await svc.login({ email, password }, later);
          expect(isOk(success)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
