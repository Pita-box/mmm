# Plan 003: Streaming proxy — bind token to the requester and reject non-approved media (R6.2/6.4)

> **Executor instructions**: Follow step by step; verify each step; touch only
> in-scope files; obey STOP conditions; update the status row in
> `advisor-plans/README.md` when done.
>
> **Drift check (no VCS)**: open `app/src/app/api/stream/[token]/route.ts`,
> `app/src/services/drive-connector.ts`, `app/src/services/media-service.ts`
> (the `isApproved` export), and `app/src/lib/session.ts`; confirm the excerpts
> below match. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 002 (a reliable server-side session principal)
- **Category**: security
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters

`/api/stream/[token]` is the only path that serves private Drive bytes. Today it
verifies the short-lived token's signature/expiry and then streams — but:

1. It never checks that the token's `userId` matches the **current session**, so
   a leaked/shared token works for anyone for up to 300 s.
2. It never checks `media.status`/`publishAt`, so a token minted for an item
   that is now `hidden` or scheduled-in-the-future still streams it.
3. The middleware matcher (`(?!_next/static|_next/image|favicon.ico|.*\\..*)`)
   excludes any path containing a dot; the token is `payload.signature` (has a
   dot), so the Edge auth gate is **skipped** for this route — yet the route's
   doc-comment claims "authentication is enforced by middleware." Misleading and
   load-bearing.

The token is `userId`-bound at issuance and short-lived, so this is not a wide-
open hole, but the route must enforce the binding and the visibility invariant
itself rather than relying on middleware that doesn't run here.

## Current state

- `app/src/app/api/stream/[token]/route.ts` — `GET` does:
  `verifyStreamingToken(decodeURIComponent(token), new Date())` → on error 410/401;
  `prisma.mediaItem.findUnique({ where: { id: verified.value.mediaId } })` → 404
  if null; then `driveStorage.streamFile(media.driveFileId)` → 502 on error, else
  200 with `Content-Type: media.mimeType`, `Cache-Control: private, no-store`.
  It does NOT read the session and does NOT check `media.status`. The header
  doc-comment says auth is enforced by middleware (not true for this route).
- `verified.value` is a `StreamingTokenPayload` `{ mediaId, userId, exp }`
  (`app/src/services/drive-connector.ts`).
- `app/src/services/media-service.ts` exports the pure
  `isApproved(item, now): boolean` (= `status === "published" && publishAt != null
  && publishAt <= now`).
- `app/src/lib/session.ts` exports `getSessionPrincipal()` (returns the current
  request's principal or null) — after plan 002 this includes `sessionId` and is
  DB-validated via the guard, but for this route you read the principal directly.

Convention: route handlers return typed JSON errors and never throw across the
boundary (see `api/cron/scheduler/route.ts` and `api/webhooks/stripe/route.ts`).
`isErr`/`isOk` from `app/src/lib/result.ts`.

## Commands you will need

| Purpose   | Command (from `app/`)     | Expected   |
|-----------|---------------------------|------------|
| Typecheck | `pnpm exec tsc --noEmit`  | exit 0     |
| Tests     | `pnpm test`               | all pass   |
| Build     | `pnpm run build`          | exit 0     |

## Scope

**In scope:**
- `app/src/app/api/stream/[token]/route.ts` — add session binding + media-state check; fix the doc-comment.
- `app/src/app/api/stream/[token]/route.test.ts` (create) — handler tests.

**Out of scope:**
- The token crypto in `drive-connector.ts` (signing/verify) — unchanged.
- The middleware matcher — do NOT try to make middleware cover dotted paths;
  the route enforces its own auth (defense in depth). Changing the matcher risks
  static-asset regressions and is unnecessary once the route self-checks.
- `isApproved` logic — reuse as-is.

## Steps

### Step 1: Require a session and bind it to the token

At the top of `GET`, read the current principal (`getSessionPrincipal()`); if
null → 401 JSON. After `verifyStreamingToken` succeeds, if
`verified.value.userId !== principal.userId` → 403 JSON (token not issued to this
requester). Keep the existing 410 (expired) / 401 (invalid) mapping.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Reject non-approved media

After loading `media`, if `!isApproved(media, new Date())` → 404 JSON (do not
distinguish hidden vs scheduled to the client). Only then call `streamFile`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Correct the misleading doc-comment

Replace the "authentication is enforced by middleware" line with an accurate note:
the route enforces its own session + token-binding + Approved_Media checks
because the middleware matcher does not cover dotted token paths.

**Verify**: `grep -n "middleware" app/src/app/api/stream/\[token\]/route.ts` →
the remaining mention (if any) accurately describes that middleware does NOT gate
this route.

### Step 4: Handler tests

Create `route.test.ts` (node env) that imports the `GET` export and calls it with
a crafted `NextRequest` + `context.params` Promise. Use a fake/mocked
`getSessionPrincipal`, a fake `driveStorage.streamFile`, and a fake/mock prisma
(reuse the integration-test mocking style in `app/tests/upload.integration.test.ts`).
Assert: (a) no session → 401; (b) token `userId` ≠ session → 403; (c) expired
token → 410; (d) invalid token → 401; (e) non-approved media → 404; (f) happy
path → 200 and the response body/headers never contain `driveFileId` or a Google
Drive domain (assert against `DRIVE_DOMAINS` from `drive-connector.ts`).

**Verify**: `pnpm test` → all pass including the new tests.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; `route.test.ts` exists and covers 401/403/410/404/200
- [ ] `pnpm run build` exits 0
- [ ] The route reads `getSessionPrincipal` and compares `userId`
      (`grep -n "getSessionPrincipal\|userId" route.ts` shows both)
- [ ] The response never serializes `driveFileId` / a Drive domain (asserted by a test)
- [ ] `advisor-plans/README.md` status row for 003 updated

## STOP conditions

- Plan 002 is not DONE — `getSessionPrincipal` may not be DB-validated yet; a
  session-binding check on a forgeable cookie is weak. Confirm 002 DONE first.
- The "Current state" excerpts don't match the live route.
- Reading the session in this route forces Prisma/edge issues (it should not —
  the route is already `runtime = "nodejs"`).

## Maintenance notes

- If streaming is later moved to signed CDN URLs, this binding logic moves with it.
- Reviewer: confirm the happy-path test actually asserts the absence of
  `driveFileId`/Drive domains in the streamed response, not just a 200.
- Once plan 006 implements real Drive streaming, re-run this route's tests against
  the real connector behind the existing `DriveStorage` interface (tests should
  still use the fake).
