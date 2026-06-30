# Plan 016: Delete video posters when deleting a model with its media

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 824f901..HEAD -- app/src/app/\(app\)/admin/admin-actions.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (resource leak)
- **Planned at**: commit `824f901`, 2026-06-29

## Why this matters

Videos now have a self-generated poster stored on Google Drive
(`MediaItem.posterDriveFileId`). `deleteMediaAction` already deletes the poster
file from Drive when a single medium is deleted. But `deleteModelProfileAction`
with `withMedia=true` deletes each medium's main `driveFileId` and the DB rows —
**without deleting `posterDriveFileId`**. Result: every poster of a model's
videos is left orphaned on Drive on each "delete model + media". Over time this
accumulates dead files (storage + clutter) and is inconsistent with the
single-delete path.

## Current state

`app/src/app/(app)/admin/admin-actions.ts` — `deleteModelProfileAction` (current):

```ts
export async function deleteModelProfileAction(
  modelId: string,
  withMedia: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    if (withMedia) {
      const items = await prisma.mediaItem.findMany({
        where: { modelId },
        select: { driveFileId: true },
      });
      for (const it of items) {
        // idempotentní (404 = ok); případné selhání nebrání smazání záznamů.
        await driveStorage.deleteFile(it.driveFileId);
      }
      await prisma.$transaction([
        prisma.mediaItem.deleteMany({ where: { modelId } }),
        prisma.modelProfile.delete({ where: { id: modelId } }),
      ]);
    } else {
      await prisma.modelProfile.delete({ where: { id: modelId } });
    }
  } catch {
    return { ok: false, message: "Smazání modelu se nezdařilo." };
  }
  revalidatePath("/admin/models");
  revalidatePath("/models");
  revalidatePath("/");
  return OK;
}
```

For reference, the single-delete path already does this correctly
(`deleteMediaAction` in the same file):

```ts
  if (media.posterDriveFileId) await driveStorage.deleteFile(media.posterDriveFileId);
```

`driveStorage.deleteFile` is idempotent (returns ok on 404) — see
`app/src/lib/google-drive-storage.ts`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass (≥322)     |
| Lint      | `pnpm run lint`          | exit 0              |

Run from `app/`. Do NOT run `pnpm run build` / delete `.next/` (dev cache).

## Scope

**In scope** (modify):
- `app/src/app/(app)/admin/admin-actions.ts` (only `deleteModelProfileAction`)

**Out of scope** (do NOT touch):
- `deleteMediaAction` — already correct.
- Any change to the deletion order or transaction semantics beyond adding poster cleanup.

## Git workflow

- Branch: `advisor/016-delete-model-orphan-posters`
- One commit; conventional-commit style (e.g. `fix: delete video posters on model+media delete`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Include `posterDriveFileId` in the query and delete it

In `deleteModelProfileAction`, change the `withMedia` branch so the `findMany`
selects `posterDriveFileId` too, and delete each non-null poster from Drive
alongside the main file:

```ts
    if (withMedia) {
      const items = await prisma.mediaItem.findMany({
        where: { modelId },
        select: { driveFileId: true, posterDriveFileId: true },
      });
      for (const it of items) {
        // idempotentní (404 = ok); případné selhání nebrání smazání záznamů.
        await driveStorage.deleteFile(it.driveFileId);
        if (it.posterDriveFileId) await driveStorage.deleteFile(it.posterDriveFileId);
      }
      await prisma.$transaction([
        prisma.mediaItem.deleteMany({ where: { modelId } }),
        prisma.modelProfile.delete({ where: { id: modelId } }),
      ]);
    } else {
```

Leave the `else` branch and everything else unchanged.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Full verification

**Verify**:
- `pnpm test` → all pass.
- `pnpm run lint` → exit 0.

## Test plan

No new unit test is required (the action is thin glue over Prisma + the Drive
stub, and the existing suite has no handler test harness for this action). The
change is a one-line addition mirroring the proven `deleteMediaAction` pattern.
If the executor wants a regression test, it would require mocking `driveStorage`
and `prisma` — out of scope here; note it as a deferred follow-up instead.

## Done criteria

ALL must hold:

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` passes
- [ ] `pnpm run lint` exits 0
- [ ] `grep -n "posterDriveFileId" app/src/app/\(app\)/admin/admin-actions.ts` shows it referenced inside `deleteModelProfileAction` (select + delete)
- [ ] Only `admin-actions.ts` modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report if:
- The "Current state" excerpt of `deleteModelProfileAction` doesn't match the live code.
- `driveStorage.deleteFile` signature differs from `(driveFileId: string) => Promise<Result<...>>`.

## Maintenance notes

- If a third deletion path is ever added (e.g. bulk media delete), it must also
  clean up `posterDriveFileId`. Consider extracting a small
  `deleteMediaFilesFromDrive(item)` helper if a third copy appears (rule of three).
- Reviewer: confirm poster deletion is best-effort (failure must not block the DB
  transaction), consistent with the existing comment.
