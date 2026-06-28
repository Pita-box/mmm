# Plan 002: DB-backed sessions — live revocation, real logout, rolling inactivity (R15.3/15.4, R1.6/2.3)

> **Executor instructions**: Follow step by step; verify each step before the
> next; touch only in-scope files; obey STOP conditions; update the status row in
> `advisor-plans/README.md` when done.
>
> **Drift check (no VCS)**: open `app/src/lib/access-context.ts`,
> `app/src/lib/session.ts`, `app/src/lib/access-guard.ts`,
> `app/src/app/auth-actions.ts`, and `app/src/services/auth-repository.ts`;
> confirm the excerpts below match. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the auth hot path)
- **Depends on**: 001 (non-placeholder, fail-closed signing secret)
- **Category**: security / correctness
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters

Authentication identity is currently a **self-contained signed cookie** that
snapshots `userId`, `role`, `accountStatus`, `subscriptionStatus`, and
`lastActivityAt` at login. Nothing on the request path re-reads the DB. Three
requirements are therefore unmet:

- **R15.3/R15.4** — blocking an account must end its sessions within ~5 s. The
  admin block action runs `session.deleteMany({ where: { userId } })`, but the
  access path never reads the `Session` table, so the delete is effectively dead
  code and a blocked user keeps full access (including their admin role) until
  the cookie expires.
- **R1.6/R2.3** — "30-minute *inactivity*" is actually a fixed 30-minute cap
  from login: `lastActivityAt` in the cookie is never refreshed, so an active
  user is logged out at 30 min and an idle user with a stale tab stays valid.
- Logout (`signOutAction`) only clears the cookie; the `Session` row it created
  at login is never deleted, so rows accumulate unbounded.

The fix: put the **session id** in the cookie and validate it against the DB on
protected requests in the Node guard (`enforceAccess`) — re-reading the user's
current `status` and the session's `lastActivityAt`, refreshing activity, and
denying when the session row is gone or the account is blocked. The Edge
middleware keeps doing the cheap cookie-signature gate (it cannot use Prisma);
the authoritative DB check lives in the Node layer that already exists
(`access-guard.ts`).

## Current state

- `app/src/lib/access-context.ts` — `SessionPrincipal` carries
  `{ userId, role, accountStatus, subscriptionStatus, lastActivityAt }`;
  `signSessionCookie`/`resolveSessionPrincipal` HMAC-sign/verify it; cookie name
  `SESSION_COOKIE = "mmm_session"`. The module-level TODO explicitly states DB
  revocation + `lastActivityAt` refresh are unbuilt (deferred to "task 21.2").
- `app/src/lib/session.ts` — `establishSession` sets the cookie with
  `maxAge: 30*60`, `httpOnly`, `sameSite:"lax"`, `secure` in prod;
  `getSessionPrincipal` reads the cookie only; `clearSession` deletes the cookie;
  `requireSession`/`requireAdmin` redirect/forbid based on the cookie principal.
- `app/src/lib/access-guard.ts` — `enforceAccess(request)` calls
  `evaluateAccessWithVisibility` (which adds the DB page-visibility map) then
  maps to a response; it does NOT currently re-validate the session against the DB.
- `app/src/app/auth-actions.ts` — on successful `authService.login(...)` it
  builds a principal and calls `establishSession`; `signOutAction` calls only
  `clearSession`.
- `app/src/services/auth-repository.ts` — `createSession`/`findSessionById`/
  `deleteSession` exist on `AuthRepository` (Prisma + in-memory impls); the
  Prisma `Session` model has `{ id, userId, lastActivityAt, expiresAt }`.
- `AuthService.login` already creates a DB `Session` row (`repo.createSession`)
  and returns it — its `id` is currently discarded by the cookie layer.

Convention: services return `Result<T,E>` (`app/src/lib/result.ts`); access
decisions go through the pure `decideAccess` (`app/src/lib/access.ts`) — keep it
the single decision authority. Edge middleware must not import Prisma (kept out
of the Edge bundle via `access-guard.ts`).

## Commands you will need

| Purpose   | Command (from `app/`)        | Expected            |
|-----------|------------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit`     | exit 0              |
| Tests     | `pnpm test`                  | all pass            |
| Build     | `pnpm run build`             | exit 0, no edge warning |
| Lint      | `pnpm run lint`              | exit 0              |

## Scope

**In scope:**
- `app/src/lib/access-context.ts` — add `sessionId` to `SessionPrincipal`; keep signing.
- `app/src/app/auth-actions.ts` — pass the login session id into the cookie; delete the row on sign-out.
- `app/src/lib/session.ts` — `establishSession(principal incl. sessionId)`; `clearSession` deletes the DB row.
- `app/src/lib/access-guard.ts` — `enforceAccess` re-validates the session vs DB (existence + `user.status` + inactivity), refreshes `lastActivityAt`.
- `app/src/services/auth-repository.ts` — add a `touchSession(id, now)` (update `lastActivityAt`) and a `findActiveSessionWithUser(id)` read if helpful.
- Test files for the above (create).

**Out of scope:**
- `app/src/lib/access.ts` pure `decideAccess` logic and its property tests — do not change the decision rules; only change how `accountStatus`/`lastActivityAt` reach the Node guard.
- Edge `middleware.ts` — it stays a cookie-signature gate; do NOT add Prisma there.
- Subscription freshness (stale `subscriptionStatus`) — acceptable to keep from the cookie for now; note as follow-up, do not expand scope.

## Steps

### Step 1: Carry the session id in the cookie principal

Add `sessionId: string` to `SessionPrincipal` (`access-context.ts`) and include
it in `isValidPrincipal`. Update `auth-actions.ts` to put `login` result's
session `id` into the principal before `establishSession`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Re-validate the session against the DB in the Node guard

In `access-guard.ts` `enforceAccess`: after the cookie decision says allow,
look up the session row by `sessionId`; if missing → treat as unauthenticated
(redirect/401 via the existing `accessDecisionToResponse` with a `redirectSignIn`/
`deny401` outcome). Load the owning `user.status`; if `blocked` → unauthenticated.
Recompute inactivity from the **DB** `lastActivityAt` (30 min, reuse
`SESSION_INACTIVITY_LIMIT_MS` from `access.ts`); if expired → unauthenticated and
delete the row. Otherwise refresh `lastActivityAt = now` (`touchSession`).

Keep this in the Node layer only. The pure `decideAccess` can still run first on
the cookie snapshot as a cheap pre-filter.

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm run build` → exit 0 with no
edge-runtime/Prisma warning (confirms Prisma didn't leak into the Edge bundle).

### Step 3: Real logout + block actually revokes

`signOutAction` (and `clearSession`): delete the DB session row for the cookie's
`sessionId` (via `AuthService.logout`/`repo.deleteSession`) in addition to
clearing the cookie. The existing admin block action's `session.deleteMany` now
has teeth (Step 2 reads the table).

**Verify**: `pnpm test` → all pass.

### Step 4: Tests

Add `app/src/lib/access-guard.test.ts` (node env) using the in-memory
`AuthRepository` (and/or a fake prisma) to assert: (a) a deleted/blocked session
yields a deny outcome; (b) an expired (`now - lastActivityAt >= 30min`) session
denies and removes the row; (c) an active session refreshes `lastActivityAt`.
Add an `auth-actions` logout test asserting the row is deleted. Model structure
after `app/src/services/auth-service.test.ts` (uses `InMemoryAuthRepository`).

**Verify**: `pnpm test` → all pass, including the new tests.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm run build` exits 0 with no Edge/Prisma bundle warning
- [ ] `pnpm test` exits 0; new `access-guard` + logout tests exist and pass
- [ ] A blocked user's next protected request is denied (covered by a test)
- [ ] `grep -n "sessionId" app/src/lib/access-context.ts` shows the field exists
- [ ] No change to `app/src/lib/access.ts` decision rules (`git`/diff N/A — confirm by reading; its property tests still pass)
- [ ] `advisor-plans/README.md` status row for 002 updated

## STOP conditions

- Importing the session-DB lookup pulls Prisma into the Edge middleware bundle
  (build warning / size jump) — STOP; the DB check must stay in `access-guard.ts`
  (Node), never in `middleware.ts`.
- The "Current state" excerpts don't match the live code.
- Plan 001 is not DONE (placeholder signing secret still trusted in prod) — STOP;
  DB sessions on a forgeable cookie don't close the hole.
- A step's verification fails twice after a reasonable fix.

## Maintenance notes

- Stale `subscriptionStatus` in the cookie is deliberately left for a follow-up;
  when `PAYMENTS_ENABLED` is turned on, re-read it in the same DB check.
- Reviewer: confirm the Edge bundle stayed Prisma-free and that `decideAccess`
  rules are unchanged (only the data source for `accountStatus`/`lastActivityAt`
  moved to the DB in the Node guard).
- The cron scheduler can later also purge expired `Session` rows.
