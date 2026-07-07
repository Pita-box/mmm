// Feature: mmmred-streaming-dashboard, Property 7: Validace registračního vstupu
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import { validateEmail, validatePassword } from "@/lib/validation";
import type { PasswordHasher } from "@/lib/password";
import { isOk } from "@/lib/result";

/**
 * **Validates: Requirements 2.1, 2.7**
 *
 * Property 7: Pro libovolný řetězec e-mailu a hesla platí, že registrace
 * uspěje právě tehdy, když e-mail odpovídá formátu local@domain o délce
 * 5–254 znaků a heslo má délku 8–128 znaků; při neplatném vstupu nevznikne
 * žádný účet.
 *
 * Testuje se přímo proti AuthService s in-memory repository a deterministickým
 * fake hasherem (bez argon2/DB), aby šlo pokrýt mnoho vstupů přes hranice.
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

// ─── Generátory ───────────────────────────────────────────────────────────────

/** Platný e-mail local@domain s celkovou délkou v rozsahu [5, 254]. */
const validEmailArb: fc.Arbitrary<string> = fc
  .tuple(
    // lokální část: alespoň 1 znak bez bílých znaků a bez '@'
    fc.string({ minLength: 1, maxLength: 60 }),
    // poddoména: alespoň 1 znak
    fc.string({ minLength: 1, maxLength: 60 }),
    // TLD: alespoň 1 znak
    fc.string({ minLength: 1, maxLength: 20 }),
  )
  .map(([local, domain, tld]) => {
    const clean = (s: string) => s.replace(/[\s@.]/g, "x") || "x";
    return `${clean(local)}@${clean(domain)}.${clean(tld)}`;
  })
  .filter((email) => validateEmail(email));

/** Platné heslo: délka v rozsahu [8, 128]. */
const validPasswordArb: fc.Arbitrary<string> = fc
  .string({ minLength: 8, maxLength: 128 })
  .filter((p) => validatePassword(p));

/** Libovolný řetězec (validní i nevalidní e-mail), včetně hraničních délek. */
const anyEmailArb: fc.Arbitrary<string> = fc.oneof(
  validEmailArb,
  fc.string({ maxLength: 300 }),
  // hraniční délky kolem 5 a 254
  fc.string({ minLength: 4, maxLength: 6 }),
  fc.string({ minLength: 253, maxLength: 255 }),
  // tvar bez tečky v doméně / bez '@'
  fc.string({ minLength: 1, maxLength: 30 }).map((s) => `${s}@nodot`),
);

/** Libovolný řetězec hesla, včetně hraničních délek kolem 8 a 128. */
const anyPasswordArb: fc.Arbitrary<string> = fc.oneof(
  validPasswordArb,
  fc.string({ maxLength: 200 }),
  fc.string({ minLength: 7, maxLength: 9 }),
  fc.string({ minLength: 127, maxLength: 129 }),
);

function makeService() {
  const repo = new InMemoryAuthRepository();
  return { repo, svc: new AuthService(repo, fakeHasher) };
}

describe("Property 7: validace registračního vstupu", () => {
  it("registrace uspěje právě tehdy, když je e-mail i heslo platné; jinak nevznikne účet", async () => {
    await fc.assert(
      fc.asyncProperty(anyEmailArb, anyPasswordArb, async (email, password) => {
        const { repo, svc } = makeService();
        const expected = validateEmail(email) && validatePassword(password);

        const result = await svc.register({ email, password });

        // Úspěch právě tehdy, když je vstup platný (iff).
        expect(isOk(result)).toBe(expected);

        // Při neplatném vstupu nevznikne žádný účet.
        if (!expected) {
          const found = await repo.findUserByEmail(email.trim().toLowerCase());
          expect(found).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
