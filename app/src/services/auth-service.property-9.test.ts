// Feature: mmmred-streaming-dashboard, Property 9: Unikátnost e-mailu při registraci
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AuthService, normalizeEmail } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { validateEmail } from "@/lib/validation";
import { isOk, isErr } from "@/lib/result";

/**
 * Property 9: Unikátnost e-mailu při registraci.
 *
 * Pro libovolný již registrovaný e-mail platí, že opakovaná registrace téhož
 * e-mailu (porovnání bez ohledu na velikost písmen) je odmítnuta a nevznikne
 * nový účet.
 *
 * **Validates: Requirements 2.2**
 *
 * Test pracuje přímo s čistou logikou AuthService nad in-memory repozitářem
 * (fake, ne mock) a determinním fake hasherem — žádná DB ani argon2.
 */

/** Determinní fake hasher — rychlý, bez argon2, pro logické property testy. */
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `h:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `h:${plain}`;
  },
};

/** Segment z malých alfanumerických znaků o dané délce. */
function segment(min: number, max: number): fc.Arbitrary<string> {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  return fc
    .array(fc.constantFrom(...chars), { minLength: min, maxLength: max })
    .map((a) => a.join(""));
}

/** TLD jen z písmen (2–4), aby `local@domain.tld` byl vždy platný e-mail. */
function letters(min: number, max: number): fc.Arbitrary<string> {
  const chars = "abcdefghijklmnopqrstuvwxyz".split("");
  return fc
    .array(fc.constantFrom(...chars), { minLength: min, maxLength: max })
    .map((a) => a.join(""));
}

/**
 * Generátor: platný (lowercase) e-mail + sada bitů pro odvození variant
 * lišících se pouze velikostí písmen (upper/lower/mixed).
 */
const emailWithCaseVariantsArb = fc
  .record({
    local: segment(1, 15),
    domain: segment(1, 15),
    tld: letters(2, 4),
    caseBits: fc.array(fc.boolean(), { minLength: 1, maxLength: 64 }),
  })
  .map(({ local, domain, tld, caseBits }) => {
    const email = `${local}@${domain}.${tld}`;
    const mixed = email
      .split("")
      .map((ch, i) => (caseBits[i % caseBits.length] ? ch.toUpperCase() : ch.toLowerCase()))
      .join("");
    return {
      email,
      // Varianty, které normalizují na stejný e-mail (case-insensitive).
      variants: [email.toUpperCase(), email.toLowerCase(), mixed],
    };
  })
  // Pojistka: pracujeme jen s e-maily, které jádro považuje za platné.
  .filter(({ email }) => validateEmail(email));

describe("Property 9: Unikátnost e-mailu při registraci", () => {
  it("opakovaná registrace téhož e-mailu (case-insensitive) je odmítnuta a nevznikne nový účet", async () => {
    await fc.assert(
      fc.asyncProperty(emailWithCaseVariantsArb, async ({ email, variants }) => {
        const repo = new InMemoryAuthRepository();
        const svc = new AuthService(repo, fakeHasher);

        // První registrace platného e-mailu uspěje a vytvoří právě jeden účet.
        const first = await svc.register({ email, password: "password123" });
        expect(isOk(first)).toBe(true);
        if (!isOk(first)) return;
        const originalId = first.value.id;

        const normalized = normalizeEmail(email);

        // Každá varianta lišící se jen velikostí písmen musí být odmítnuta
        // s kódem `email_taken`, aniž by vznikl nový/jiný účet.
        for (const variant of variants) {
          const again = await svc.register({ email: variant, password: "password456" });
          expect(isErr(again)).toBe(true);
          if (isErr(again)) {
            expect(again.error.code).toBe("email_taken");
          }

          // Účet zůstává týž jediný (stejné id) — počet účtů nevzrostl.
          const found = await repo.findUserByEmail(normalized);
          expect(found).not.toBeNull();
          expect(found?.id).toBe(originalId);
        }
      }),
      { numRuns: 100 },
    );
  });
});
