# Plan 004: Atomic media upload — transaction for media + tags, no orphans, surfaced tag errors (R5.1/5.4/5.6, R7.2)

> **Executor instructions**: Follow step by step; verify each step; touch only
> in-scope files; obey STOP conditions; update the status row in
> `advisor-plans/README.md` when done.
>
> **Drift check (no VCS)**: open `app/src/app/(app)/admin/admin-actions.ts`
> (`uploadMediaAction`), `app/src/services/media-service.ts`
> (`createMediaService`, `createMediaItem`), `app/src/services/tag-service.ts`
> (`createTagService`, `upsertValue`, `assignValueToMedia`), and
> `app/tests/upload.integration.test.ts`; confirm the excerpts below match.
> On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the compensating-rollback path)
- **Depends on**: none
- **Category**: correctness
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters

`uploadMediaAction` claims (in its doc-comment and the R5.4 invariant) that an
upload never leaves an orphaned record or file. It doesn't hold:

- The Drive file is uploaded first, then `createMediaItem` persists the row, then
  a tag loop runs. If a tag step **throws**, the `catch` deletes the Drive file
  but **not** the already-created `MediaItem` row → an orphaned DB row pointing at
  a now-deleted Drive file (a future stream 404/502). This is the exact inverse of
  the invariant the function advertises.
- The tag loop swallows failures: `if (isOk(value)) assignValueToMedia(...)` — a
  failed `upsertValue` or a failed `assignValueToMedia` (e.g. the 1–50 per-category
  limit, R7.6) is silently ignored, so media is created with partial/again silently
  dropped tags and the admin sees success.

The fix: create the media row and assign tags inside a **single Prisma
transaction**; on any failure (including tag errors), roll back the row AND
compensate the Drive upload, and return a descriptive error.

## Current state

`app/src/app/(app)/admin/admin-actions.ts` — `uploadMediaAction`:

```ts
const uploaded = await driveStorage.upload(bytes, { mimeType, name });
if (isErr(uploaded)) return { ok: false, message: uploaded.error.message };
const { driveFileId } = uploaded.value;

const mediaService = createMediaService(prisma);
const tagService = createTagService(prisma);
try {
  const created = await mediaService.createMediaItem({ modelId, driveFileId, ... });
  if (isErr(created)) { await driveStorage.deleteFile(driveFileId); return {ok:false,...}; }
  for (const category of FIXED_CATEGORIES) {
    for (const raw of input.tags[category] ?? []) {
      const value = await tagService.upsertValue(category, raw);
      if (isOk(value)) { await tagService.assignValueToMedia(created.value.id, value.value.id); }
      // ^ assign result ignored; upsert failure ignored
    }
  }
} catch {
  await driveStorage.deleteFile(driveFileId);   // deletes file but NOT the created MediaItem row
  return { ok: false, message: "Uložení média selhalo." };
}
```

Relevant service facts:
- `createMediaService(prisma)` and `createTagService(prisma)` are factories over a
  `PrismaClient`. Inside a `prisma.$transaction(async (tx) => …)` you can build
  `createMediaService(tx)` / `createTagService(tx)` so all writes share the tx
  (the existing `media-service.delete` already uses `prisma.$transaction([...])`).
- `tagService.assignValueToMedia(mediaId, tagValueId)` returns `Result<void, TagError>`
  (it enforces the 1–50/category limit and idempotency).
- `driveStorage.deleteFile(driveFileId)` is the compensating action (currently a
  stub no-op returning `ok()` — see plan 006; the control flow must still call it).

Convention: services return `Result<T,E>`; admin actions return `ActionResult
{ ok, message? }`; never throw across the action boundary.

## Commands you will need

| Purpose   | Command (from `app/`)                          | Expected |
|-----------|------------------------------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`                       | exit 0   |
| Tests     | `pnpm test`                                    | all pass |
| Upload IT | `pnpm test -- upload.integration`              | all pass |

## Scope

**In scope:**
- `app/src/app/(app)/admin/admin-actions.ts` — `uploadMediaAction` only.
- `app/tests/upload.integration.test.ts` — extend with the orphan/tag-failure cases.
- Optionally a small helper in `app/src/services/media-service.ts` if a
  `createMediaItemWithTags(tx, input, tags)` transactional helper reads cleaner —
  allowed, but keep the pure cores untouched.

**Out of scope:**
- Drive integration itself (plan 006). Keep using `driveStorage` as-is; the
  control flow must call `deleteFile` on rollback even though it's a stub today.
- Other admin actions in the file.
- Tag/media pure-core logic and their property tests.

## Steps

### Step 1: Wrap media creation + tagging in one transaction

Refactor so that, after a successful Drive `upload`, a single
`prisma.$transaction(async (tx) => { ... })` (a) creates the media row via
`createMediaService(tx)`, and (b) upserts + assigns every tag via
`createTagService(tx)`, returning/throwing on the first tag error so the tx rolls
back. If `createMediaItem` returns `err`, throw inside the tx to roll back.

### Step 2: Surface tag failures instead of swallowing them

Inside the tx, treat `isErr(upsertValue)` and `isErr(assignValueToMedia)` as
failures: abort the transaction and return a descriptive `ActionResult` naming
the offending category/value (e.g. exceeds the 1–50 per-category limit).

### Step 3: Compensate Drive on any rollback

If the transaction throws/rolls back for any reason, call
`driveStorage.deleteFile(driveFileId)` and return `{ ok:false, message }`. After
this step there is no path that leaves a committed `MediaItem` without its tags
or a Drive file without its row.

**Verify (steps 1–3)**: `pnpm exec tsc --noEmit` → exit 0.

### Step 4: Extend the integration tests

In `app/tests/upload.integration.test.ts` add cases (the file already mocks
`@/lib/drive`, `@/lib/prisma`, `requireAdmin`, `next/cache`): (a) a tag step
fails → action returns `ok:false`, NO media row remains committed, and
`deleteFile` was called with the uploaded `driveFileId`; (b) `assignValueToMedia`
returns a limit error → `ok:false`, message mentions the tag, no orphan. Make the
fake prisma's `$transaction(async fn)` roll back its in-memory writes when `fn`
throws (model the existing fakes that implement `$transaction`).

**Verify**: `pnpm test -- upload.integration` → all pass; `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; new orphan/tag-failure integration cases exist and pass
- [ ] On any tagging failure the action returns `ok:false` AND no `MediaItem`
      remains committed AND `deleteFile` was called (asserted by tests)
- [ ] No `MediaItem` is created outside a `$transaction` in `uploadMediaAction`
      (`grep -n "createMediaItem\|\$transaction" admin-actions.ts` confirms)
- [ ] `advisor-plans/README.md` status row for 004 updated

## STOP conditions

- The "Current state" excerpt of `uploadMediaAction` doesn't match the live code.
- Passing `tx` into `createMediaService`/`createTagService` proves impossible
  because a factory hard-codes the global `prisma` import — STOP and report (the
  factory signature would need a separate plan).
- A verification fails twice after a reasonable fix.

## Maintenance notes

- The compensating `deleteFile` is a no-op until plan 006 implements real Drive
  storage; the control flow is still correct and will become effective then.
- Reviewer: confirm the rollback test asserts BOTH "no committed media row" and
  "deleteFile called" — not just an `ok:false` return.
- If width/height extraction is added later (currently hardcoded `0,0`), it slots
  before the transaction; the atomicity boundary is unaffected.
