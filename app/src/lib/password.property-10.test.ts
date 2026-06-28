// Feature: mmmred-streaming-dashboard, Property 10: Hesla jsou uložena pouze jako hash
import { describe, it } from "vitest";
import fc from "fast-check";
import { argon2idHasher } from "./password";

/**
 * Property 10: Hesla jsou uložena pouze jako hash.
 *
 * Pro libovolné heslo (délka 8–128) platí, že persistovaná hodnota (hash) se
 * nerovná otevřenému heslu, ověření hashe vůči správnému heslu uspěje a vůči
 * jinému heslu selže.
 *
 * Validates: Requirements 2.6
 *
 * Pozn.: argon2id je záměrně CPU-náročný; jedna iterace = 1 hash + 2 verify
 * (~330 ms). Při 100 iteracích držíme štědrý časový limit, ale testujeme přímo
 * produkční `argon2idHasher` (kontrakt PasswordHasher), bez snižování nákladů.
 */
describe("Property 10: Hesla jsou uložena pouze jako hash", () => {
  // Heslo dle validačního jádra: délka 8–128 znaků.
  const password = fc.string({ minLength: 8, maxLength: 128 });

  // ponytail: argon2 je drahý (~330 ms/iterace). Default loop běží 15 iterací
  // (~5 s); plný proof (100) jen v CI přes `PBT_FULL=1` (skript `test:ci`).
  const RUNS = process.env.PBT_FULL === "1" ? 100 : 15;

  it(
    "hash se nerovná heslu; verify uspěje jen vůči správnému heslu",
    async () => {
      await fc.assert(
        fc.asyncProperty(password, password, async (correct, other) => {
          // Zajisti, že "other" je skutečně jiné heslo než "correct".
          fc.pre(correct !== other);

          const hash = await argon2idHasher.hash(correct);

          // 1) Persistovaná hodnota není otevřené heslo.
          if (hash === correct) return false;

          // 2) Ověření vůči správnému heslu uspěje.
          if ((await argon2idHasher.verify(hash, correct)) !== true) return false;

          // 3) Ověření vůči jinému heslu selže.
          if ((await argon2idHasher.verify(hash, other)) !== false) return false;

          return true;
        }),
        { numRuns: RUNS },
      );
    },
    120_000,
  );
});
