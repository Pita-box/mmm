import { describe, it, expect } from "vitest";
import {
  AuthService,
  normalizeEmail,
  isLockedOut,
  computeSessionExpiry,
  SESSION_INACTIVITY_MS,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
} from "./auth-service";
import { InMemoryAuthRepository } from "./auth-repository";
import type { PasswordHasher } from "@/lib/password";
import { isOk, isErr } from "@/lib/result";

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

describe("pure helpers", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("isLockedOut is true only while lockedUntil is in the future", () => {
    const now = new Date("2025-01-01T12:00:00Z");
    expect(isLockedOut({ lockedUntil: null }, now)).toBe(false);
    expect(
      isLockedOut({ lockedUntil: new Date(now.getTime() + 1000) }, now),
    ).toBe(true);
    expect(
      isLockedOut({ lockedUntil: new Date(now.getTime() - 1000) }, now),
    ).toBe(false);
  });

  it("computeSessionExpiry adds the 30-minute inactivity window", () => {
    const now = new Date("2025-01-01T12:00:00Z");
    expect(computeSessionExpiry(now).getTime()).toBe(
      now.getTime() + SESSION_INACTIVITY_MS,
    );
  });
});

describe("register", () => {
  it("creates a User-role account with inactive subscription", async () => {
    const svc = makeService();
    const result = await svc.register({
      email: "New@Example.com",
      password: "password123",
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.role).toBe("User");
      expect(result.value.subscriptionStatus).toBe("inactive");
      expect(result.value.email).toBe("new@example.com"); // normalized
      expect(result.value.passwordHash).not.toBe("password123"); // hashed
    }
  });

  it("rejects invalid email and password without creating an account", async () => {
    const svc = makeService();
    expect(isErr(await svc.register({ email: "bad", password: "password123" }))).toBe(true);
    expect(isErr(await svc.register({ email: "ok@example.com", password: "short" }))).toBe(true);
  });

  it("rejects a duplicate email case-insensitively", async () => {
    const svc = makeService();
    await svc.register({ email: "dupe@example.com", password: "password123" });
    const again = await svc.register({ email: "DUPE@EXAMPLE.COM", password: "password123" });
    expect(isErr(again)).toBe(true);
    if (isErr(again)) expect(again.error.code).toBe("email_taken");
  });
});

describe("login / logout round-trip", () => {
  it("logs in with correct credentials and invalidates session on logout", async () => {
    const repo = new InMemoryAuthRepository();
    const svc = new AuthService(repo, fakeHasher);
    await svc.register({ email: "a@example.com", password: "password123" });

    const login = await svc.login({ email: "a@example.com", password: "password123" });
    expect(isOk(login)).toBe(true);
    if (!isOk(login)) return;

    expect(await repo.findSessionById(login.value.id)).not.toBeNull();
    await svc.logout(login.value.id);
    expect(await repo.findSessionById(login.value.id)).toBeNull();
  });

  it("rejects wrong password with a generic error", async () => {
    const svc = makeService();
    await svc.register({ email: "b@example.com", password: "password123" });
    const login = await svc.login({ email: "b@example.com", password: "wrongpass1" });
    expect(isErr(login)).toBe(true);
    if (isErr(login)) expect(login.error.code).toBe("invalid_credentials");
  });
});

describe("lockout after repeated failures", () => {
  it("locks the account for 15 minutes after 5 consecutive failures", async () => {
    const svc = makeService();
    await svc.register({ email: "c@example.com", password: "password123" });
    const now = new Date("2025-01-01T12:00:00Z");

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await svc.login({ email: "c@example.com", password: "wrongpass1" }, now);
    }

    // Even with the correct password, login is now blocked.
    const blocked = await svc.login({ email: "c@example.com", password: "password123" }, now);
    expect(isErr(blocked)).toBe(true);
    if (isErr(blocked)) expect(blocked.error.code).toBe("locked_out");

    // After the lockout window elapses, login succeeds again.
    const later = new Date(now.getTime() + LOCKOUT_DURATION_MS + 1000);
    const ok = await svc.login({ email: "c@example.com", password: "password123" }, later);
    expect(isOk(ok)).toBe(true);
  });
});

describe("changePassword", () => {
  it("changes the password only with correct current password and valid length", async () => {
    const repo = new InMemoryAuthRepository();
    const svc = new AuthService(repo, fakeHasher);
    const reg = await svc.register({ email: "d@example.com", password: "password123" });
    if (!isOk(reg)) throw new Error("setup failed");
    const userId = reg.value.id;

    // Wrong current password → rejected.
    expect(isErr(await svc.changePassword(userId, "nope", "newpassword1"))).toBe(true);
    // Too-short new password → rejected.
    expect(isErr(await svc.changePassword(userId, "password123", "short"))).toBe(true);
    // Valid change → succeeds and new password works for login.
    expect(isOk(await svc.changePassword(userId, "password123", "newpassword1"))).toBe(true);
    expect(isOk(await svc.login({ email: "d@example.com", password: "newpassword1" }))).toBe(true);
  });
});
