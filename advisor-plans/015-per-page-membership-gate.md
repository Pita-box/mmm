# Plan 015: Enforce membership gating per-page (fix client-navigation bypass)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 824f901..HEAD -- app/src/app/\(app\)/layout.tsx app/src/components/MembershipGate.tsx app/src/middleware.ts app/src/app/\(app\)/page.tsx app/src/app/\(app\)/search/page.tsx app/src/app/\(app\)/models/page.tsx "app/src/app/(app)/models/[id]/page.tsx" app/src/app/\(app\)/collections/page.tsx "app/src/app/(app)/collections/[id]/page.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (security)
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `824f901`, 2026-06-29

## Why this matters

Membership gating (blur overlay + sample media instead of real content for
users without an active membership) is currently implemented in the shared
route-group layout `app/src/app/(app)/layout.tsx`. **Next.js App Router does not
re-render shared layouts on client-side (soft) navigation** — only the changed
page segment is fetched. So a non-member who first loads an allowed route
(`/settings`, which the layout exempts) and then clicks any `<Link>` to `/`,
`/models`, etc. receives the **real page content** (and real streaming/thumbnail
tokens), because the layout's gating decision is not recomputed and the page
segment renders normally. This defeats the entire security guarantee ("content
must not reach the client; can't be bypassed via DOM removal").

The fix moves gating from the layout into each user-facing **page** (pages
always re-render on navigation), mirroring the existing `requireVisibleSection`
pattern. Pages return the gate UI early instead of rendering real content, so
non-members never receive real data on any navigation path.

## Current state

### The flawed gate (in the layout)

`app/src/app/(app)/layout.tsx` (current):

```tsx
  const pathname = hdrs.get("x-pathname") ?? "";
  const member =
    user !== null &&
    isActiveMember({
      subscriptionStatus: user.subscriptionStatus,
      membershipExpiresAt: user.membershipExpiresAt,
    });
  const gated =
    principal.role === "User" && !member && pathname !== "/settings";

  let gateMedia: MediaCardItem[] = [];
  if (gated) {
    const now = new Date();
    const samples = await prisma.membershipGateSample.findMany({
      orderBy: { createdAt: "desc" },
      include: { media: true },
    });
    gateMedia = samples
      .map((s) => s.media)
      .filter((m) => isApproved(m, now))
      .map((m) => toCardItem(m, principal.userId, {}, now));
  }
  // ...
      {gated ? <MembershipGate media={gateMedia} /> : children}
```

The layout also reads `headers()` for `x-pathname`, which `middleware.ts` sets:

```ts
  if (decision.outcome === "allow") {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }
```

### Building blocks that already exist (reuse them)

- `app/src/lib/membership.ts` — `isActiveMember({ subscriptionStatus, membershipExpiresAt }, now?)` (pure, tested). Active = `subscriptionStatus === "active" && (membershipExpiresAt == null || membershipExpiresAt > now)`.
- `app/src/components/MembershipGate.tsx` — client component, props `{ media: readonly MediaCardItem[] }`. Renders blurred masonry of sample thumbnails + the pricing/Telegram popup. **Keep as-is.**
- `app/src/services/media-service.ts` — `isApproved(item, now)`.
- `app/src/lib/media-presentation.ts` — `toCardItem(item, userId, {}, now)`.
- `app/src/lib/section-visibility.ts` — exemplar of the "shared server guard called per page" pattern (`requireVisibleSection(sectionKey, role)` → calls `notFound()`). Read it to match style.

### Exemplar page (the insertion pattern)

`app/src/app/(app)/search/page.tsx` (current, representative of all gated pages):

```tsx
export default async function SearchPage() {
  const principal = await requireSession();
  await requireVisibleSection("search", principal.role);
  const now = new Date();
  // ... data fetch + return <section>...
}
```

Every user-facing page follows the same opening shape: `const principal = await requireSession();` then (usually) `await requireVisibleSection(...)`.

### Conventions

- Server components in this repo are async functions that read via `prisma` / services and return JSX. Helpers that gate access live in `app/src/lib/*` and are called at the top of pages (see `section-visibility.ts`).
- The app UI text is Czech; match surrounding comments.
- The gate must apply **only to role `User`** (Admin/Distributor are staff and exempt) and the membership check must read **live** from the DB (not the session principal, which can be stale).

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit`               | exit 0, no output   |
| Tests     | `pnpm test`                            | all pass (≥322)     |
| Lint      | `pnpm run lint`                        | exit 0, no errors   |

Run all commands from the `app/` directory. **Do NOT run `pnpm run build` or delete `.next/`** — the user may have `pnpm dev` running and it corrupts the shared cache. `tsc` + `pnpm test` are sufficient here.

## Scope

**In scope** (modify):
- `app/src/lib/membership-gate.tsx` (create)
- `app/src/app/(app)/layout.tsx` (remove gating; revert to pre-gate shape)
- `app/src/app/(app)/page.tsx` (home — add gate)
- `app/src/app/(app)/search/page.tsx` (add gate)
- `app/src/app/(app)/models/page.tsx` (add gate)
- `app/src/app/(app)/models/[id]/page.tsx` (add gate)
- `app/src/app/(app)/collections/page.tsx` (add gate)
- `app/src/app/(app)/collections/[id]/page.tsx` (add gate)
- `app/src/middleware.ts` (remove the now-unused `x-pathname` header injection)
- `app/src/lib/membership-gate.test.ts` (create)

**Out of scope** (do NOT touch):
- `app/src/components/MembershipGate.tsx` — the gate UI is correct; reuse it.
- `app/src/lib/membership.ts` — pure helper is correct and tested.
- `app/src/app/(app)/settings/page.tsx` — **must NOT be gated** (users manage their account here). Do not add the gate to it.
- `app/src/app/(app)/upload/page.tsx` and `app/src/app/(app)/admin/**` — uploader/admin-only; role `User` can't reach them, so no gate needed. Leave them.
- Any change to `decideAccess` / `access.ts` paywall logic.

## Git workflow

- Branch: `advisor/015-per-page-membership-gate`
- Commit per logical unit; conventional-commit style (e.g. `fix(security): enforce membership gate per page`). Match `git log`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the shared per-page gate helper

Create `app/src/lib/membership-gate.tsx`:

```tsx
/**
 * Per-page membership gate (server). Volá se na začátku každé user-facing
 * stránky: pro roli `User` bez platného členství vrátí `MembershipGate`
 * (rozmazané sample + výzva) MÍSTO obsahu stránky — obsah se tak nikdy
 * nevyrenderuje ani nepošle klientovi. Na rozdíl od layoutu se stránka
 * re-renderuje při každé (i soft) navigaci, takže bariéru nelze obejít.
 *
 * Staff (Admin/Distributor) se negatuje. Členství se čte živě z DB.
 */
import type { ReactNode } from "react";
import { prisma } from "./prisma";
import { isActiveMember } from "./membership";
import { isApproved } from "@/services/media-service";
import { toCardItem } from "./media-presentation";
import { MembershipGate } from "@/components/MembershipGate";
import type { SessionPrincipal } from "./access-context";

/**
 * Vrátí gate UI, pokud principal nemá platné členství (jen role `User`),
 * jinak `null` (stránka pokračuje normálně).
 */
export async function membershipGate(
  principal: SessionPrincipal,
  now: Date = new Date(),
): Promise<ReactNode | null> {
  if (principal.role !== "User") return null;

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { subscriptionStatus: true, membershipExpiresAt: true },
  });
  if (
    user !== null &&
    isActiveMember(
      {
        subscriptionStatus: user.subscriptionStatus,
        membershipExpiresAt: user.membershipExpiresAt,
      },
      now,
    )
  ) {
    return null;
  }

  // Sample náhledy — jen Approved_Media (proxy /api/thumb je vyžaduje).
  const samples = await prisma.membershipGateSample.findMany({
    orderBy: { createdAt: "desc" },
    include: { media: true },
  });
  const media = samples
    .map((s) => s.media)
    .filter((m) => isApproved(m, now))
    .map((m) => toCardItem(m, principal.userId, {}, now));

  return <MembershipGate media={media} />;
}
```

**Verify**: `pnpm exec tsc --noEmit` → exit 0. (If `SessionPrincipal` is not exported from `@/lib/access-context`, STOP — see STOP conditions.)

### Step 2: Add the gate to each user-facing page

For **each** of these six pages, insert the gate immediately after the existing
`requireSession()` (and `requireVisibleSection(...)` if present), before any
real data fetch / return:

- `app/src/app/(app)/page.tsx` (home)
- `app/src/app/(app)/search/page.tsx`
- `app/src/app/(app)/models/page.tsx`
- `app/src/app/(app)/models/[id]/page.tsx`
- `app/src/app/(app)/collections/page.tsx`
- `app/src/app/(app)/collections/[id]/page.tsx`

Pattern (adapt the variable name `principal` to whatever the page already uses;
all six use `principal`):

```tsx
import { membershipGate } from "@/lib/membership-gate";
// ...
  const principal = await requireSession();
  await requireVisibleSection("<key>", principal.role); // keep if already present
  const gate = await membershipGate(principal);
  if (gate) return gate;
  // ... existing logic unchanged
```

Notes:
- `app/src/app/(app)/page.tsx` (home) has **no** `requireVisibleSection` call — insert `const gate = await membershipGate(principal); if (gate) return gate;` right after `const principal = await requireSession();`.
- Pages that compute `const now = new Date();` may pass it: `await membershipGate(principal, now)` (optional; default is fine).

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Remove gating from the layout

Edit `app/src/app/(app)/layout.tsx` back to its pre-gate shape:

- Remove imports no longer used here: `headers` (from `next/headers`), `MembershipGate`, `isActiveMember`, `isApproved`, `toCardItem`, `MediaCardItem` type.
- Remove `hdrs` from the `Promise.all`, and remove `subscriptionStatus` / `membershipExpiresAt` from the `prisma.user.findUnique` select (keep `displayName`).
- Remove the `pathname` / `member` / `gated` / `gateMedia` block.
- Restore the render to: `<NotificationBanner ... />` then `{children}` (no conditional gate).

Resulting layout body should match the original (commit before the gate was
added): it selects only `displayName`, and renders `{children}` directly.

**Verify**: `pnpm exec tsc --noEmit` → exit 0 (no unused-import errors).

### Step 4: Remove the now-unused `x-pathname` injection from middleware

In `app/src/middleware.ts`, the `x-pathname` header was added only for the
layout gate (now removed). Revert the `allow` branch so middleware no longer
clones request headers:

- Remove `import { NextResponse } from "next/server";` (only added for this).
- Remove the `if (decision.outcome === "allow") { ... return NextResponse.next({...}) }` block.
- The function should end with `return accessDecisionToResponse(decision, request);` as before.

**Verify**: `pnpm exec tsc --noEmit` → exit 0. `grep -n "x-pathname" app/src` → no matches.

### Step 5: Tests

Create `app/src/lib/membership-gate.test.ts`. Because `membershipGate` reads
`prisma`, test the **decision** by injecting a minimal fake (follow the existing
fake-Prisma pattern in `app/src/services/media-service.persistence.test.ts`), OR
— simpler and preferred — refactor the pure decision out is NOT required;
instead assert the two pure-logic branches via `isActiveMember` are already
covered, and add a focused test that `membershipGate` returns `null` for a
non-`User` role **without touching the DB**:

```ts
import { describe, it, expect } from "vitest";
import { membershipGate } from "./membership-gate";

describe("membershipGate", () => {
  it("staff (Admin/Distributor) se negatuje (vrací null, bez DB)", async () => {
    const base = { userId: "u1", sessionId: "s1", accountStatus: "active",
      subscriptionStatus: "inactive", lastActivityAt: new Date().toISOString() } as const;
    expect(await membershipGate({ ...base, role: "Admin" })).toBeNull();
    expect(await membershipGate({ ...base, role: "Distributor" })).toBeNull();
  });
});
```

This passes without a DB because the `role !== "User"` short-circuit returns
before any `prisma` call. If TypeScript complains about the principal shape,
import the `SessionPrincipal` type and satisfy it.

**Verify**: `pnpm test` → all pass, including the new test.

## Test plan

- New: `app/src/lib/membership-gate.test.ts` — staff short-circuit returns null without DB access (named above).
- Existing `app/src/lib/membership.test.ts` continues to cover the active/expired/inactive decision matrix (do not duplicate it).
- Manual check to note in the PR (not automated): as a `User` without membership, hard-load `/`, then soft-navigate to `/models` and `/search` — each must show the gate, not real content.

## Done criteria

ALL must hold:

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` passes; `app/src/lib/membership-gate.test.ts` exists and passes
- [ ] `pnpm run lint` exits 0
- [ ] `grep -rn "x-pathname" app/src` → no matches
- [ ] `grep -rn "MembershipGate" app/src/app/\(app\)/layout.tsx` → no matches (gate removed from layout)
- [ ] `app/src/app/(app)/settings/page.tsx` does NOT import `membershipGate`
- [ ] Each of the six listed pages imports and calls `membershipGate`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- `SessionPrincipal` is not exported from `app/src/lib/access-context.ts`, or its
  field names differ from `{ userId, role, subscriptionStatus, ... }` — the helper
  signature depends on it.
- Any of the six pages does not start with `const principal = await requireSession()`
  (structure drifted) — report which page differs.
- The "Current state" layout excerpt does not match the live file.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- **Never put this gate back into a layout.** Layouts don't re-render on soft
  navigation; gating must stay at the page level (or move to middleware with a
  DB-free signal). This is the whole point of the plan.
- When a **new user-facing page** is added under `(app)` (reachable by role
  `User`), it must call `membershipGate` too. Add a note to any "new page"
  checklist.
- The gate issues `/api/thumb` tokens only for **sample** media, so non-members
  never receive tokens for non-sample content. If a future page issues stream
  tokens before calling the gate, that leaks — call the gate first.
- Reviewer should confirm `/settings` remains reachable for non-members and that
  `/upload` + `/admin/**` are unaffected.
