# Plan 006 (DIRECTION / spike): wire the real Google Drive Service Account storage

> **Executor instructions**: This is a design/spike plan, not a mechanical fix.
> Produce the implementation AND a short design note. Verify each gate; obey STOP
> conditions; update the status row in `advisor-plans/README.md` when done.
>
> **Drift check (no VCS)**: open `app/src/lib/drive.ts`,
> `app/src/services/drive-connector.ts` (the `DriveStorage` interface +
> `createStubDriveStorage`), and `app/src/app/api/stream/[token]/route.ts`;
> confirm excerpts match. On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M (new external integration)
- **Risk**: MED (live third-party I/O, credential handling)
- **Depends on**: 001 (secrets documented + rotated + fail-closed)
- **Category**: direction
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters (product value)

This is the single biggest gap between "tests green" and "product works." The
app's defining capability — admins upload photos/videos that members stream —
is **non-functional end to end** because the storage layer is a stub:
`app/src/lib/drive.ts` exports `driveStorage = createStubDriveStorage()`, whose
`authenticate`/`upload`/`streamFile` return `auth_failed` and whose `deleteFile`
is a no-op `ok()`. Every real upload fails fast and every stream 502s. The
credentials to do this for real already exist in `app/.env`
(`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GDRIVE_ROOT_FOLDER_ID`), and the
`DriveStorage` interface is stable, so the architecture is one implementation
away from a working MVP.

## Current state

- `app/src/services/drive-connector.ts` — defines the `DriveStorage` interface:
  `authenticate(): Promise<Result<void, DriveError>>`,
  `upload(bytes, { mimeType, name }): Promise<Result<{ driveFileId }, DriveError>>`,
  `streamFile(driveFileId): Promise<Result<ReadableStream, DriveError>>`,
  `deleteFile(driveFileId): Promise<Result<void, DriveError>>`. `createStubDriveStorage()`
  returns `auth_failed` for the first three and `ok()` for delete. The token
  signing/verify core (`signStreamingToken`/`verifyStreamingToken`) is real and
  must be reused unchanged.
- `app/src/lib/drive.ts` — wires the stub as the live `driveStorage` and lazily
  builds the connector. This is the single swap point.
- Consumers: `uploadMediaAction` (plan 004) calls `upload`/`deleteFile`;
  `api/stream/[token]/route.ts` (plan 003) calls `streamFile`.
- `app/.env` keys present: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REFRESH_TOKEN`, `GDRIVE_ROOT_FOLDER_ID` (values not shown — handled per
  plan 001). Design.md specifies a Service Account via `googleapis`; the present
  env is an OAuth refresh-token setup — **resolve this discrepancy in the spike
  (Step 1)** rather than assuming.

Convention: never throw across the `DriveStorage` boundary — return
`Result<T, DriveError>`; `DriveError` codes already include `auth_failed`,
`upload_failed`, `timeout`, etc. (`app/src/lib/errors.ts`). pnpm only.

## Commands you will need

| Purpose   | Command (from `app/`)                  | Expected |
|-----------|----------------------------------------|----------|
| Add dep   | `pnpm add googleapis`                  | exit 0   |
| Typecheck | `pnpm exec tsc --noEmit`               | exit 0   |
| Tests     | `pnpm test`                            | all pass (stub still used in tests) |
| Build     | `pnpm run build`                       | exit 0   |

## Scope

**In scope:**
- A short design note at the top of the new implementation file (or
  `advisor-plans/006-notes.md`) answering the open questions below.
- `app/src/lib/google-drive-storage.ts` (create) — real `DriveStorage` impl.
- `app/src/lib/drive.ts` — select real vs stub by config (e.g. presence of
  `GOOGLE_REFRESH_TOKEN` / a `DRIVE_STORAGE=real|stub` flag); default to stub in
  test/CI so the suite stays hermetic.
- `app/prisma/schema.prisma` — add `directUrl = env("DIRECT_URL")` to the
  datasource (folds in deferred DEPS-02; the first real migration will need it).
- `app/.env.example` — add `DRIVE_STORAGE` and `DIRECT_URL` keys (names only).

**Out of scope:**
- Token signing/verify (`drive-connector.ts`) — reuse unchanged.
- The upload action's transaction logic (plan 004) and the stream route's auth
  (plan 003) — this plan only makes their `DriveStorage` calls real.
- Resumable/chunked uploads and CDN signing — list as follow-ups, don't build.

## Open questions to resolve in the spike (Step 1)

1. **Service Account vs OAuth refresh token.** design.md says Service Account;
   `.env` has `GOOGLE_REFRESH_TOKEN` (OAuth). Pick one, justify it, and note what
   `.env` keys the chosen path needs. (Refresh-token OAuth is simpler to keep
   working with the existing env; Service Account needs a JSON key + folder
   sharing.) Record the decision.
2. **Streaming shape.** `streamFile` must return a web `ReadableStream` of bytes
   (the route pipes it into `NextResponse`). Decide how to adapt the googleapis
   response stream (Node `Readable`) to a web stream, and whether to support HTTP
   Range requests for video seeking (recommended follow-up, not required for v1).
3. **Upload target & size.** Files go under `GDRIVE_ROOT_FOLDER_ID`; enforce the
   500 MB limit before upload (already validated in the action). Decide naming.
4. **Timeout.** `DriveError` has a `timeout` code; pick a sensible upload timeout
   (design.md mentions 120 s) and map failures to the existing codes.

## Steps

### Step 1: Write the design note (answer the four open questions)

Short markdown (≤1 page) capturing the decisions above. This is the spike's
primary deliverable — a reviewer should be able to approve the approach from it.

**Verify**: the note exists and answers all four questions.

### Step 2: Implement `google-drive-storage.ts` against the `DriveStorage` interface

Implement `authenticate`/`upload`/`streamFile`/`deleteFile` returning
`Result<…, DriveError>`, never throwing. Map auth failures → `auth_failed`,
upload failures → `upload_failed`, timeouts → `timeout`. Keep all googleapis
usage inside this file.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Config-select real vs stub in `drive.ts`; keep tests hermetic

`drive.ts` returns the real storage when configured (e.g. `DRIVE_STORAGE==="real"`
or a refresh token is present AND not in test), else the stub. Tests and CI must
keep using the stub (no network). Add `directUrl` to the Prisma datasource and
the new env keys to `.env.example`.

**Verify**: `pnpm test` → all pass (still hermetic, stub in tests);
`pnpm run build` → exit 0.

### Step 4: Manual smoke (document, do not automate against live Drive)

Document the manual smoke steps (upload a small file via the admin form, confirm
a `MediaItem` row + a Drive file, hit `/api/stream/<token>` and receive bytes).
Do NOT add a live-network test to the suite.

**Verify**: smoke steps documented in the design note.

## Done criteria

- [ ] Design note answers all four open questions
- [ ] `app/src/lib/google-drive-storage.ts` implements `DriveStorage`, never throws
- [ ] `pnpm exec tsc --noEmit` exits 0; `pnpm run build` exits 0
- [ ] `pnpm test` exits 0 and remains hermetic (stub used in tests)
- [ ] `drive.ts` selects real vs stub by config; default stub in test
- [ ] Prisma datasource has `directUrl`; `.env.example` lists `DRIVE_STORAGE` + `DIRECT_URL`
- [ ] `advisor-plans/README.md` status row for 006 updated

## STOP conditions

- Plan 001 not DONE (secrets not rotated/documented/fail-closed) — STOP; do not
  wire code that consumes live Google credentials first.
- The chosen auth path needs a credential not present in `.env` and not
  obtainable without owner action — STOP, document what's needed, report.
- googleapis pulls in an Edge-incompatible dependency that breaks the build —
  STOP; this code is Node-runtime only (the stream route is already `runtime="nodejs"`).

## Maintenance notes

- Follow-ups explicitly deferred: HTTP Range support for video seeking, resumable
  uploads for large files, CDN-signed URLs, and width/height extraction (the
  upload action currently hardcodes `0,0`).
- Once real storage lands, re-run plans 003 and 004's tests (they use the stub by
  design) and do the manual smoke against a staging Drive folder.
- Reviewer: confirm the test suite stayed hermetic and no live network call runs
  in `pnpm test`.
