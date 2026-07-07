/**
 * Hashování hesel (R2.6).
 *
 * `PasswordHasher` je úzký port se dvěma operacemi, aby šlo logiku
 * Auth_Service testovat s rychlou determinní implementací, zatímco produkce
 * používá `argon2id`. Hesla se nikdy neukládají v otevřené podobě — pouze jako
 * hash, jehož ověření proběhne konstantním porovnáním uvnitř argon2.
 */
import argon2 from "argon2";

export interface PasswordHasher {
  /** Vrátí neodvoditelný hash hesla. */
  hash(plain: string): Promise<string>;
  /** Ověří, zda heslo odpovídá danému hashi. */
  verify(hash: string, plain: string): Promise<boolean>;
}

/** Produkční hasher používající argon2id (R2.6). */
export const argon2idHasher: PasswordHasher = {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  },
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Poškozený/neznámý formát hashe → ověření selže, nikdy nevyhodí.
      return false;
    }
  },
};
