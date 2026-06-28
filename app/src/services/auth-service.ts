/**
 * Auth_Service — registrace, přihlášení, odhlášení a změna hesla (R2, R3, R18).
 *
 * Logika je oddělená od I/O: persistenci řeší `AuthRepository`, hashování
 * `PasswordHasher`. Čisté pomocné funkce (`normalizeEmail`, `isLockedOut`,
 * `computeSessionExpiry`) nemají vedlejší efekty a jsou přímo testovatelné.
 *
 * Klíčové invarianty:
 *  - hesla se ukládají pouze jako hash (R2.6),
 *  - nový účet má roli User a neaktivní předplatné (R3.2, R20.7) — default v DB,
 *  - e-mail je unikátní bez ohledu na velikost písmen (R2.2),
 *  - relace vyprší po 30 min inaktivity (R2.3, R1.6),
 *  - 5 chybných pokusů → blok na 15 min (R2.8).
 */
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";
import type { AuthError } from "@/lib/errors";
import { validateEmail, validatePassword } from "@/lib/validation";
import { argon2idHasher, type PasswordHasher } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  PrismaAuthRepository,
  type AuthRepository,
  type UserRecord,
  type SessionRecord,
} from "./auth-repository";

// ─── Konstanty politiky ─────────────────────────────────────────────────────

/** Počet po sobě jdoucích neúspěšných pokusů, který spustí blokaci (R2.8). */
export const MAX_FAILED_ATTEMPTS = 5;
/** Doba blokace po překročení limitu pokusů: 15 minut (R2.8). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
/** Inaktivita, po které relace vyprší: 30 minut (R2.3, R1.6). */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

// ─── Čisté pomocné funkce ────────────────────────────────────────────────────

/**
 * Normalizace e-mailu pro case-insensitive unikátnost (R2.2): trim + lower.
 * Ukládá se normalizovaná podoba, takže unikátnost vynutí i DB constraint.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Je účet aktuálně zablokovaný? Pravda právě tehdy, když `lockedUntil` existuje
 * a je v budoucnu vůči `now`. Po uplynutí doby blokace vrací false (R2.8).
 */
export function isLockedOut(
  user: Pick<UserRecord, "lockedUntil">,
  now: Date,
): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

/** Čas vypršení nové relace = now + 30 min inaktivity (R2.3). */
export function computeSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_INACTIVITY_MS);
}

// ─── Služba ───────────────────────────────────────────────────────────────────

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly hasher: PasswordHasher = argon2idHasher,
  ) {}

  /** Čistá validace e-mailu (R2.1, R2.7) — delegováno na sdílené jádro. */
  validateEmail(email: string): boolean {
    return validateEmail(email);
  }

  /** Čistá validace hesla (R2.1, R2.7, R18.5) — délka 8–128. */
  validatePassword(password: string): boolean {
    return validatePassword(password);
  }

  /** Wrapper nad čistou funkcí pro splnění rozhraní AuthService z designu. */
  isLockedOut(user: Pick<UserRecord, "lockedUntil">, now: Date): boolean {
    return isLockedOut(user, now);
  }

  /**
   * Registrace nového účtu (R2.1, R2.2, R2.7, R3.2, R20.7).
   * Uspěje právě při platném e-mailu i hesle a dosud nepoužitém e-mailu.
   */
  async register(input: {
    email: string;
    password: string;
  }): Promise<Result<UserRecord, AuthError>> {
    if (!this.validateEmail(input.email)) {
      return err({
        code: "validation",
        field: "email",
        message: "E-mail musí být ve formátu local@domain o délce 5–254 znaků.",
      });
    }
    if (!this.validatePassword(input.password)) {
      return err({
        code: "validation",
        field: "password",
        message: "Heslo musí mít délku 8–128 znaků.",
      });
    }

    const normalizedEmail = normalizeEmail(input.email);
    const existing = await this.repo.findUserByEmail(normalizedEmail);
    if (existing) {
      return err({
        code: "email_taken",
        message: "Zadaný e-mail je již registrován.",
      });
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.repo.createUser({
      email: normalizedEmail,
      passwordHash,
    });
    return ok(user);
  }

  /**
   * Přihlášení (R2.3, R2.4, R2.8). Při správné kombinaci vytvoří relaci
   * s 30min inaktivitou; po 5 chybných pokusech účet zablokuje na 15 min.
   * Chyba je generická — neprozradí, které pole je špatně (R2.4).
   */
  async login(
    input: { email: string; password: string },
    now: Date = new Date(),
  ): Promise<Result<SessionRecord, AuthError>> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = await this.repo.findUserByEmail(normalizedEmail);

    // Neexistující účet: generická chyba, žádné prozrazení existence (R2.4).
    if (!user) {
      return err({
        code: "invalid_credentials",
        message: "Nesprávná kombinace e-mailu a hesla.",
      });
    }

    // Blokace má přednost před ověřením hesla (R2.8).
    if (isLockedOut(user, now)) {
      const retryAfterMinutes = Math.ceil(
        (user.lockedUntil!.getTime() - now.getTime()) / 60000,
      );
      return err({
        code: "locked_out",
        retryAfterMinutes,
        message: "Účet je dočasně zablokován kvůli opakovaným neúspěšným pokusům.",
      });
    }

    const passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.registerFailedAttempt(user, now);
      return err({
        code: "invalid_credentials",
        message: "Nesprávná kombinace e-mailu a hesla.",
      });
    }

    // Úspěch: vynuluj počítadlo pokusů a vytvoř relaci.
    if (user.failedLoginAttempts !== 0 || user.lockedUntil !== null) {
      await this.repo.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }
    const session = await this.repo.createSession({
      userId: user.id,
      lastActivityAt: now,
      expiresAt: computeSessionExpiry(now),
    });
    return ok(session);
  }

  /** Odhlášení (R2.5) — ukončí relaci. Idempotentní. */
  async logout(sessionId: string): Promise<void> {
    await this.repo.deleteSession(sessionId);
  }

  /**
   * Změna hesla (R18.3, R18.4, R18.5). Uspěje právě při správném stávajícím
   * hesle a novém hesle délky 8–128; jinak zůstane heslo nezměněné.
   */
  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<Result<void, AuthError>> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      return err({ code: "not_found", message: "Účet nebyl nalezen." });
    }

    const currentOk = await this.hasher.verify(user.passwordHash, current);
    if (!currentOk) {
      return err({
        code: "invalid_credentials",
        message: "Stávající heslo je nesprávné.",
      });
    }

    if (!this.validatePassword(next)) {
      return err({
        code: "validation",
        field: "password",
        message: "Nové heslo musí mít délku 8–128 znaků.",
      });
    }

    const passwordHash = await this.hasher.hash(next);
    await this.repo.updateUser(user.id, { passwordHash });
    return ok();
  }

  /**
   * Zaznamená neúspěšný pokus o přihlášení; při dosažení limitu nastaví blok
   * na 15 min a vynuluje počítadlo, aby další blok vyžadoval dalších 5 pokusů.
   */
  private async registerFailedAttempt(
    user: UserRecord,
    now: Date,
  ): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await this.repo.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
      });
    } else {
      await this.repo.updateUser(user.id, { failedLoginAttempts: attempts });
    }
  }
}

/** Produkční instance napojená na Prisma + argon2id. */
export const authService = new AuthService(new PrismaAuthRepository(prisma));
