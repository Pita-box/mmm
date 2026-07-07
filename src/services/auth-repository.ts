/**
 * Perzistentní port pro Auth_Service.
 *
 * Auth_Service obsahuje pouze logiku (validace, lockout, round-trip relací) a
 * veškerý I/O deleguje na tento úzký port. Produkce používá
 * `PrismaAuthRepository` (PostgreSQL), testy mohou použít `InMemoryAuthRepository`
 * bez nutnosti běžící databáze — díky tomu jsou register/login/changePassword
 * přímo testovatelné (Properties 7–12, 38).
 *
 * `UserRecord` / `SessionRecord` zrcadlí Prisma modely `User` / `Session`
 * (viz prisma/schema.prisma), takže Prisma implementace je čistý průchod.
 */
import type { PrismaClient } from "@prisma/client";
import type { Role, AccountStatus, SubscriptionStatus } from "@/lib/domain";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  displayName: string | null;
  subscriptionStatus: SubscriptionStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
};

export type SessionRecord = {
  id: string;
  userId: string;
  lastActivityAt: Date;
  expiresAt: Date;
};

/** Data potřebná pro vytvoření účtu; ostatní pole mají default v DB / repu. */
export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

/** Změny stavu účtu spojené s pokusy o přihlášení / změnou hesla. */
export type UserPatch = Partial<
  Pick<
    UserRecord,
    "passwordHash" | "failedLoginAttempts" | "lockedUntil"
  >
>;

export interface AuthRepository {
  /** Najde účet podle normalizovaného e-mailu (case-insensitive uniqueness). */
  findUserByEmail(normalizedEmail: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Vytvoří účet s rolí User a neaktivním předplatným (default v DB). */
  createUser(input: CreateUserInput): Promise<UserRecord>;
  updateUser(id: string, patch: UserPatch): Promise<UserRecord>;
  createSession(session: {
    userId: string;
    lastActivityAt: Date;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
}

// ─── Prisma implementace ────────────────────────────────────────────────────

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
  displayName: true,
  subscriptionStatus: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
} as const;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({
      where: { email: normalizedEmail },
      select: userSelect,
    });
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({
      where: { id },
      select: userSelect,
    });
  }

  createUser(input: CreateUserInput): Promise<UserRecord> {
    // role (User) a subscriptionStatus (inactive) přebírají default ze schématu.
    return this.db.user.create({
      data: { email: input.email, passwordHash: input.passwordHash },
      select: userSelect,
    });
  }

  updateUser(id: string, patch: UserPatch): Promise<UserRecord> {
    return this.db.user.update({
      where: { id },
      data: patch,
      select: userSelect,
    });
  }

  createSession(session: {
    userId: string;
    lastActivityAt: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    return this.db.session.create({ data: session });
  }

  findSessionById(id: string): Promise<SessionRecord | null> {
    return this.db.session.findUnique({ where: { id } });
  }

  async deleteSession(id: string): Promise<void> {
    // deleteMany se nevyhazuje, když záznam neexistuje (idempotentní logout).
    await this.db.session.deleteMany({ where: { id } });
  }
}

// ─── In-memory implementace (pro testy bez DB) ──────────────────────────────

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

/**
 * Plnohodnotná in-memory náhrada (fake, nikoli mock) — uchovává reálné záznamy
 * a vynucuje stejné invarianty jako DB (unikátní e-mail, defaulty účtu).
 */
export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  async findUserByEmail(normalizedEmail: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.email === normalizedEmail) return { ...user };
    }
    return null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const existing = await this.findUserByEmail(input.email);
    if (existing) {
      throw new Error("unique constraint violation: email");
    }
    const user: UserRecord = {
      id: nextId("user"),
      email: input.email,
      passwordHash: input.passwordHash,
      role: "User",
      status: "active",
      displayName: null,
      subscriptionStatus: "inactive",
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async updateUser(id: string, patch: UserPatch): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw new Error("user not found");
    const updated: UserRecord = { ...user, ...patch };
    this.users.set(id, updated);
    return { ...updated };
  }

  async createSession(session: {
    userId: string;
    lastActivityAt: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const record: SessionRecord = { id: nextId("sess"), ...session };
    this.sessions.set(record.id, record);
    return { ...record };
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}
