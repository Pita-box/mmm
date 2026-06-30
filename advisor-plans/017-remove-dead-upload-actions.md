# Plan 017: Remove dead server actions left after the upload-form removal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 824f901..HEAD -- app/src/app/\(app\)/admin/admin-actions.ts`
> Also re-confirm the dead code is still unused (Step 1) before deleting.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `824f901`, 2026-06-29

## Why this matters

`MediaUploadForm` (single-file admin upload) and `AdminMediaList` were deleted
when `/admin/media` was simplified to Drive-sync + bulk thumbnail generation.
Two server actions that only those components used are now dead code:
`uploadMediaAction` (server-side Drive upload — no caller; the app uploads via
the resumable wizard) and `finalizeDriveUploadAction` (used only by the deleted
`MediaUploadForm`). Their input types `UploadMediaInput` and `FinalizeUploadInput`
are likewise unused. Dead exports invite accidental reuse of an abandoned code
path and add maintenance noise. Removing them shrinks the trust surface (one
fewer Drive-upload entry point) and clarifies that finalize happens only via the
bulk wizard (`finalizeUploadsAction`).

## Current state

Confirmed unused at planning time: `grep -rn "uploadMediaAction\|finalizeDriveUploadAction" app/src` returns only the definitions and a doc-comment reference inside `app/src/app/(app)/admin/admin-actions.ts` — **no call sites**.

In `app/src/app/(app)/admin/admin-actions.ts`, the dead members are:

- `export interface UploadMediaInput { ... }` (file/modelId/tags/publishAt)
- `export async function uploadMediaAction(input: UploadMediaInput): Promise<ActionResult>` — does `validateUpload` → `driveStorage.upload(Buffer.from(await input.file.arrayBuffer()), ...)` → `persistMediaWithTags(...)`.
- `export interface FinalizeUploadInput { ... }` (driveFileId/mimeType/sizeBytes/modelId/tags/publishAt)
- `export async function finalizeDriveUploadAction(input: FinalizeUploadInput): Promise<ActionResult>` — `persistMediaWithTags(...)`.

**Keep** (still used — do NOT remove): `createUploadSessionAction`,
`finalizeUploadsAction`, `persistMediaWithTags`, `uploadPosterAction`,
`setMediaPosterAction`, and all others.

After removing `uploadMediaAction`, `validateUpload` (imported from
`@/services/media-service`) may become unused **in this file** — `classifyType`
stays (used by `createUploadSessionAction` / `finalizeUploadsAction`). The
executor must check and remove only newly-unused imports.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass (≥322)     |
| Lint      | `pnpm run lint`          | exit 0              |

Run from `app/`. Do NOT run `pnpm run build` / delete `.next/` (dev cache).

## Scope

**In scope** (modify):
- `app/src/app/(app)/admin/admin-actions.ts`

**Out of scope** (do NOT touch):
- `persistMediaWithTags` and every other action — only the four named dead members are removed.
- `app/src/services/media-service.ts` — do not change `validateUpload`/`classifyType` themselves; only adjust the import line in `admin-actions.ts` if one becomes unused.

## Git workflow

- Branch: `advisor/017-remove-dead-upload-actions`
- One commit; conventional-commit style (e.g. `chore: remove dead upload server actions`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-confirm the code is still dead

Run:

```
grep -rn "uploadMediaAction\|finalizeDriveUploadAction\|UploadMediaInput\|FinalizeUploadInput" app/src
```

Expected: matches **only** inside `app/src/app/(app)/admin/admin-actions.ts`
(definitions + the doc comment). If there is any call site in another file, **STOP**.

### Step 2: Remove the four dead members

In `app/src/app/(app)/admin/admin-actions.ts`, delete:
- `interface UploadMediaInput` and its doc comment,
- `uploadMediaAction` and its doc comment,
- `interface FinalizeUploadInput` and its doc comment,
- `finalizeDriveUploadAction` and its doc comment.

Leave `createUploadSessionAction` (which sits between them) in place.

**Verify**: `pnpm exec tsc --noEmit` → exit 0. If it reports `validateUpload` (or
any other symbol) is now unused, remove it from the import statement from
`@/services/media-service` (keep `classifyType`). Re-run until exit 0.

### Step 3: Full verification

**Verify**:
- `grep -rn "uploadMediaAction\|finalizeDriveUploadAction\|UploadMediaInput\|FinalizeUploadInput" app/src` → no matches.
- `pnpm test` → all pass.
- `pnpm run lint` → exit 0 (no unused-var warnings introduced).

## Test plan

No new tests. This is pure dead-code removal; the gate is that typecheck, the
full existing suite, and lint all stay green, proving nothing referenced the
removed symbols.

## Done criteria

ALL must hold:

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` passes (count unchanged, ≥322)
- [ ] `pnpm run lint` exits 0
- [ ] `grep -rn "uploadMediaAction\|finalizeDriveUploadAction\|UploadMediaInput\|FinalizeUploadInput" app/src` → no matches
- [ ] Only `admin-actions.ts` modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report if:
- Step 1 finds a real call site (the code is not dead — do not remove).
- Removing the actions cascades into unused symbols beyond a single import line
  (suggests a hidden dependency) — report what broke.

## Maintenance notes

- The only supported upload paths after this are the resumable wizard
  (`createUploadSessionAction` + `finalizeUploadsAction`, used by
  `UploadWizard`) and Drive sync (`importFromDriveAction`). If single-file
  server-side upload is ever needed again, restore from git history rather than
  re-deriving.
- Reviewer: confirm no route or component imported the removed actions.
