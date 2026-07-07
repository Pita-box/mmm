import { describe, it, expect } from "vitest";
import { AuthService } from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isErr } from "@/lib/result";

/**
 * Task 4.9 — generická chyba přihlášení (R2.3, R2.4).
 *
 * Cíl: nesprávná kombinace e-mailu a hesla je odmítnuta GENERICKOU chybou,
 * která neprozradí, které pole bylo špatně. Konkrétně: neznámý e-mail a
 * správný e-mail s chybným heslem musí vrátit STEJNÝ chybový kód
 * `invalid_credentials` se STEJNOU zprávou (žádné rozlišení pole).
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

function makeService() {
  return new AuthService(new InMemoryAuthRepository(), fakeHasher);
}

const KNOWN_EMAIL = "known@example.com";
const KNOWN_PASSWORD = "password123";

describe("generic login error (R2.3, R2.4)", () => {
  it("rejects an unknown email with the generic invalid_credentials error", async () => {
    const svc = makeService();
    const login = await svc.login({
      email: "nobody@example.com",
      password: KNOWN_PASSWORD,
    });

    expect(isErr(login)).toBe(true);
    if (!isErr(login)) return;
    expect(login.error.code).toBe("invalid_credentials");
    // Generická chyba nesmí prozradit, které pole bylo špatně.
    expect(login.error).not.toHaveProperty("field");
  });

  it("rejects a wrong password with the generic invalid_credentials error", async () => {
    const svc = makeService();
    await svc.register({ email: KNOWN_EMAIL, password: KNOWN_PASSWORD });

    const login = await svc.login({
      email: KNOWN_EMAIL,
      password: "wrongpass1",
    });

    expect(isErr(login)).toBe(true);
    if (!isErr(login)) return;
    expect(login.error.code).toBe("invalid_credentials");
    expect(login.error).not.toHaveProperty("field");
  });

  it("returns an identical error for unknown email and wrong password (no field disclosure)", async () => {
    const svc = makeService();
    await svc.register({ email: KNOWN_EMAIL, password: KNOWN_PASSWORD });

    const unknownEmail = await svc.login({
      email: "nobody@example.com",
      password: KNOWN_PASSWORD,
    });
    const wrongPassword = await svc.login({
      email: KNOWN_EMAIL,
      password: "wrongpass1",
    });

    expect(isErr(unknownEmail)).toBe(true);
    expect(isErr(wrongPassword)).toBe(true);
    if (!isErr(unknownEmail) || !isErr(wrongPassword)) return;

    // Stejný kód i zpráva → odmítnutí neodhalí, zda existuje účet ani které
    // pole je špatně (R2.4).
    expect(unknownEmail.error.code).toBe("invalid_credentials");
    expect(wrongPassword.error.code).toBe("invalid_credentials");
    expect(unknownEmail.error.code).toBe(wrongPassword.error.code);
    expect(unknownEmail.error.message).toBe(wrongPassword.error.message);
    expect(unknownEmail.error).toEqual(wrongPassword.error);
  });
});
