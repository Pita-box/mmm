// Feature: mmmred-streaming-dashboard, Property 38: Změna hesla respektuje stávající heslo a délku
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isOk, isErr } from "@/lib/result";
import { validatePassword } from "@/lib/validation";

/**
 * Property 38: Změna hesla respektuje stávající heslo a délku.
 *
 * Pro libovolnou dvojici (stávající heslo, nové heslo) platí, že změna uspěje
 * právě tehdy, když je zadáno správné stávající heslo a nové heslo má délku
 * 8–128; jinak zůstane heslo nezměněné.
 *
 * Ověření, že heslo zůstalo (ne)změněné, je provedeno přes `login`:
 *  - po úspěšné změně se přihlásí nové heslo a staré už ne,
 *  - po neúspěšné změně se stále přihlásí původní heslo a nové ne.
 *
 * **Validates: Requirements 18.3, 18.4, 18.5**
 *
 * Test pracuje přímo s čistou logikou AuthService nad in-memory repozitářem
 * (fake, ne mock) a determinním fake hasherem — žádná DB ani argon2.
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

/** Známé platné stávající heslo registrovaného účtu (délka 8–128). */
const REAL_PASSWORD = "currentPassword123";

/**
 * Generátor zadaného „stávajícího" hesla: buď přesně to správné, nebo
 * libovolný jiný (zpravidla nesprávný) řetězec. Tím pokrýváme obě větve
 * ověření stávajícího hesla (R18.3 vs R18.4).
 */
const providedCurrentArb = fc.oneof(
  fc.constant(REAL_PASSWORD),
  fc.string({ minLength: 0, maxLength: 140 }),
);

/**
 * Generátor nového hesla napříč celým prostorem délek (včetně hraničních
 * 7/8/128/129), aby se testovaly obě větve délkové validace (R18.5).
 */
const newPasswordArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 7 }), // pod limitem
  fc.string({ minLength: 8, maxLength: 128 }), // v limitu
  fc.string({ minLength: 129, maxLength: 160 }), // nad limitem
  fc.string({ minLength: 0, maxLength: 160 }), // libovolné
);

describe("Property 38: Změna hesla respektuje stávající heslo a délku", () => {
  it("changePassword uspěje právě při správném stávajícím hesle a platné délce nového; jinak heslo zůstane nezměněné", async () => {
    await fc.assert(
      fc.asyncProperty(
        providedCurrentArb,
        newPasswordArb,
        async (providedCurrent, newPassword) => {
          // Čistý stav pro každý běh: vlastní repo i služba.
          const repo = new InMemoryAuthRepository();
          const svc = new AuthService(repo, fakeHasher);

          const registered = await svc.register({
            email: "user@example.com",
            password: REAL_PASSWORD,
          });
          expect(isOk(registered)).toBe(true);
          if (!isOk(registered)) return;
          const userId = registered.value.id;

          // Očekávaný výsledek dle specifikace.
          const currentCorrect = providedCurrent === REAL_PASSWORD;
          const newLengthOk = validatePassword(newPassword);
          const shouldSucceed = currentCorrect && newLengthOk;

          const result = await svc.changePassword(
            userId,
            providedCurrent,
            newPassword,
          );

          expect(isOk(result)).toBe(shouldSucceed);

          if (shouldSucceed) {
            // Heslo se změnilo: nové heslo se přihlásí, staré už ne.
            expect(isOk(await svc.login({ email: "user@example.com", password: newPassword }))).toBe(true);
            // Pozn.: pokud by se shodou okolností nové == staré heslo, obě by
            // se přihlásila; ten případ je zde vyloučen, protože staré heslo
            // je platné a tedy spadá do větve shouldSucceed jen když je delší
            // než limit nedovoluje — ošetřeno níže.
            if (newPassword !== REAL_PASSWORD) {
              expect(isErr(await svc.login({ email: "user@example.com", password: REAL_PASSWORD }))).toBe(true);
            }
          } else {
            // Heslo zůstalo nezměněné: původní heslo se stále přihlásí.
            expect(isOk(await svc.login({ email: "user@example.com", password: REAL_PASSWORD }))).toBe(true);
            // Nové heslo (pokud se liší od původního) se nepřihlásí.
            if (newPassword !== REAL_PASSWORD) {
              expect(isErr(await svc.login({ email: "user@example.com", password: newPassword }))).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
