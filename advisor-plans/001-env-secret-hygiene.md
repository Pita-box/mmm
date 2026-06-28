# Plan 001: Secret hygiene — `.env.example`, fail-closed placeholder secrets, rotation guidance

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If a STOP condition occurs, stop and report. When done,
> update the status row for this plan in `advisor-plans/README.md`.
>
> **Drift check (run first, no VCS)**: open `app/src/lib/access-context.ts`,
> `app/src/services/drive-connector.ts`, and `app/.gitignore` and confirm the
> "Current state" excerpts below still match. On a mismatch, STOP and report.
>
> **SECURITY HANDLING RULE**: never copy a secret *value* into any file, commit,
> log, or report. Reference only the key name and the credential type. The
> `.env.example` you create contains key names and placeholder descriptions
> only — never real values.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters

The signed session cookie is the entire authentication signal for the app
(see plan 002). Its HMAC key `SESSION_COOKIE_SECRET` and the streaming-token key
`STREAMING_TOKEN_SECRET` are currently the literal placeholder
`dev-only-change-me-…`. If either placeholder reaches a shared or production
environment, anyone can forge an `Admin`/`active` session cookie or a streaming
token for any media — full takeover, no DB compromise needed. Separately, the
working `app/.env` holds live high-value third-party secrets (Supabase
service-role JWT, Google OAuth client secret + refresh token, Telegram bot
token) with no `.env.example` and no documented rotation path, so new
contributors have no safe onboarding reference and the secrets sit in plaintext.

This plan makes the app **fail closed** on placeholder secrets in production,
adds a key-names-only `.env.example`, and records rotation guidance. It does NOT
rotate the secrets itself (that is an owner action against the live Supabase /
Google / Telegram consoles).

## Current state

- `app/.env` — present, gitignored (see `app/.gitignore` lists `.env`), NOT
  committed (no git repo). Contains these keys (values intentionally not shown):
  `SUPABASE_CONNECTION_STRING`, `DATABASE_URL` (defined **twice** — a config
  smell; the second wins), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REFRESH_TOKEN`, `GDRIVE_ROOT_FOLDER_ID`, `MMM_TELEGRAM_BOT_TOKEN`,
  `MMM_TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_TELEGRAM_GROUP_URL`,
  `STREAMING_TOKEN_SECRET` (placeholder), `PAYMENTS_ENABLED`,
  `SESSION_COOKIE_SECRET` (placeholder).
- `app/src/lib/access-context.ts` — `getSessionSecret()` returns
  `process.env.SESSION_COOKIE_SECRET` (or undefined if empty); `signSessionCookie`
  returns `null` when the secret is missing (already fail-closed on *missing*,
  but NOT on the known placeholder value).
- `app/src/services/drive-connector.ts` — `createDriveConnector` throws if
  `STREAMING_TOKEN_SECRET` is empty (fail-closed on missing, not on placeholder).
- There is no `app/.env.example`.

Convention to follow: this is a Next.js app; `NEXT_PUBLIC_*` vars are
client-exposed by design (do not put secrets behind that prefix). The repo uses
pnpm only (`.kiro/steering/tooling.md`).

## Commands you will need

| Purpose   | Command (run from `app/`)     | Expected on success |
|-----------|-------------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit`      | exit 0, no errors   |
| Tests     | `pnpm test`                   | all pass            |
| Lint      | `pnpm run lint`               | exit 0              |

## Scope

**In scope:**
- `app/.env.example` (create)
- `app/src/lib/env.ts` (create — a tiny startup assertion helper)
- `app/src/lib/access-context.ts` (modify `getSessionSecret` only)
- `app/src/services/drive-connector.ts` (modify the secret-resolution guard only)
- `app/.env` (fix only the duplicate `DATABASE_URL`: delete one of the two
  identical lines — do NOT change any value, do NOT add/remove other keys)

**Out of scope (do NOT touch):**
- Any real secret value in `app/.env`.
- The pure crypto in `access-context.ts` / `drive-connector.ts` (signing/verify logic).
- Session DB design (that is plan 002).

## Steps

### Step 1: Create `app/.env.example` (key names + descriptions only, NO values)

List every key from `app/.env` with an empty value and a one-line comment. Mark
which are client-exposed (`NEXT_PUBLIC_*`) and which must be strong secrets.
Include `DIRECT_URL` (for Prisma migrations — see plan 006) and a comment that
`STREAMING_TOKEN_SECRET` and `SESSION_COOKIE_SECRET` must be high-entropy random
strings in any non-local environment (e.g. `openssl rand -base64 48`).

**Verify**: `test -f app/.env.example && ! grep -Eq "dev-only-change-me|eyJ|AIza|[0-9]{6,}:[A-Za-z0-9_-]{30,}" app/.env.example && echo OK` → prints `OK` (file exists and contains no secret-shaped values).

### Step 2: Add a production fail-closed assertion `app/src/lib/env.ts`

Export `assertProductionSecrets()` that, when `process.env.NODE_ENV === "production"`,
throws if `SESSION_COOKIE_SECRET` or `STREAMING_TOKEN_SECRET` is missing, shorter
than 32 chars, or starts with `dev-only-change-me`. In dev it is a no-op (allow
placeholders locally). Keep it dependency-free.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Reject placeholder secrets at the secret-resolution boundaries

In `access-context.ts` `getSessionSecret()` and `drive-connector.ts` secret
resolution, treat a value starting with `dev-only-change-me` as "present" only
when `NODE_ENV !== "production"`; in production, treat it as missing (so signing
returns `null` / connector throws, exactly as for a truly missing secret). Do
not change behavior in dev/test.

**Verify**: `pnpm test` → all pass (existing session/stream tests still green,
since tests don't run with `NODE_ENV=production`).

### Step 4: De-duplicate `DATABASE_URL` in `app/.env`

Remove the redundant second `DATABASE_URL=` line so the key is defined once. Do
not alter the surviving value.

**Verify**: `grep -c "^DATABASE_URL=" app/.env` → prints `1`.

## Test plan

- No new behavioral tests strictly required (the change is a production guard).
- Optionally add `app/src/lib/env.test.ts` (node env) asserting
  `assertProductionSecrets` throws for a placeholder/short secret when
  `NODE_ENV==="production"` (set/restore `process.env` in the test) and is a
  no-op otherwise. Model structure after `app/src/lib/validation.test.ts`.

## Done criteria

- [ ] `app/.env.example` exists, lists all keys, contains no secret-shaped values
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm run lint` exits 0
- [ ] `grep -c "^DATABASE_URL=" app/.env` prints `1`
- [ ] `advisor-plans/README.md` status row for 001 updated

## STOP conditions

- The "Current state" excerpts don't match the live files.
- `app/.env` is found to be git-tracked (run `git status` — if it IS tracked,
  STOP: the secrets are committed/burned and rotation must happen before any
  further change; report this immediately).
- Removing a `DATABASE_URL` line would change the effective value (the two lines
  are NOT identical) — STOP and report.

## Maintenance notes

- **Owner action (cannot be done by the executor):** rotate the Supabase
  service-role key, Google OAuth client secret + refresh token, and Telegram bot
  token, and generate fresh random `SESSION_COOKIE_SECRET` /
  `STREAMING_TOKEN_SECRET` per environment. The audit treats the current values
  as exposed-at-rest.
- Reviewer should confirm no secret value appears in `.env.example` or `env.ts`.
- `assertProductionSecrets()` should be called once at server startup (e.g. from
  the root layout or instrumentation hook) in a follow-up; wiring the call site
  is deferred — note it but don't block this plan on it.
