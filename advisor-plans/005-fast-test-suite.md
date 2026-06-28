# Plan 005: Fast test suite — keep the argon2 property proof out of the default loop

> **Executor instructions**: Follow step by step; verify; touch only in-scope
> files; obey STOP conditions; update the status row in `advisor-plans/README.md`.
>
> **Drift check (no VCS)**: open `app/src/lib/password.property-10.test.ts`,
> `app/package.json`, and `app/vitest.config.ts`; confirm excerpts match. On
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: no VCS; baseline = 2026-06-23 build session

## Why this matters

`pnpm test` takes ~27.8 s, of which ~26.5 s is a single file:
`password.property-10.test.ts` runs the **real argon2id** hasher (1 hash + 2
verifies) × `numRuns: 100`. Every other test file is single-digit milliseconds
(next slowest ~288 ms). The entire feedback loop — local TDD, pre-commit, CI — is
gated by one expensive proof. The security property it checks (a password is
stored only as a non-reversible hash; verify succeeds only for the correct
password) is valuable and must be kept, but it does not need 100 real-argon2
iterations on every run. Auth_Service logic is already covered separately via the
fast deterministic `PasswordHasher` fake, so coverage is not lost.

## Current state

- `app/src/lib/password.property-10.test.ts` — `fc.asyncProperty(password, password, …)`
  over the real `argon2idHasher`, `{ numRuns: 100 }`, with a 120 000 ms timeout.
  Tagged `// Feature: mmmred-streaming-dashboard, Property 10: …`.
- `app/package.json` scripts: `"test": "vitest --run"`, `"test:watch": "vitest"`.
- `app/vitest.config.ts` — vitest config (global env `node`; component tests opt
  into jsdom via per-file `// @vitest-environment jsdom`).

The spec's testing convention (design.md) says each correctness property is one
property test with ≥100 iterations. Keep that contract for the **CI/slow** run;
the default dev loop can run the same property at a lower iteration count.

## Commands you will need

| Purpose       | Command (from `app/`)             | Expected |
|---------------|-----------------------------------|----------|
| Typecheck     | `pnpm exec tsc --noEmit`          | exit 0   |
| Default tests | `pnpm test`                       | all pass, fast |
| Slow/CI tests | `pnpm run test:ci` (new)          | all pass, includes 100-iter argon2 |

## Scope

**In scope:**
- `app/src/lib/password.property-10.test.ts` — make iteration count configurable.
- `app/package.json` — add a `test:ci` script (and keep `test` fast).

**Out of scope:**
- Any other test file.
- The `PasswordHasher`/argon2 implementation.
- Weakening or deleting the property — it must still run at ≥100 iterations in CI.

## Steps

### Step 1: Make the argon2 property's iteration count environment-driven

In `password.property-10.test.ts`, read the run count from an env var with a
small default for the fast loop and 100 for CI, e.g.:
`const RUNS = process.env.PBT_FULL === "1" ? 100 : 15;` and use
`{ numRuns: RUNS }`. Keep the 120 s timeout. Leave the tag comment and assertions
unchanged. (15 real-argon2 iterations still exercises the invariant in ~4–5 s;
CI runs the full 100.)

**Verify**: `pnpm test` → all pass and the suite wall-clock is well under ~10 s
(was ~27.8 s). `time pnpm test` is a convenient check.

### Step 2: Add a `test:ci` script that runs the full proof

In `package.json` add `"test:ci": "PBT_FULL=1 vitest --run"`. `test` stays
`vitest --run` (fast). Document in the script comment / AGENTS.md (deferred) that
CI uses `test:ci`.

**Verify**: `pnpm run test:ci` → all pass (this run is allowed to take ~27 s; it
includes the 100-iteration argon2 proof).

## Test plan

No new tests — this reshapes an existing one's iteration count and adds a CI
script. The property's assertions are unchanged.

## Done criteria

- [ ] `pnpm test` exits 0 and completes in well under half the previous wall time
- [ ] `pnpm run test:ci` exits 0 and runs the argon2 property at 100 iterations
- [ ] `grep -n "PBT_FULL" app/src/lib/password.property-10.test.ts app/package.json` shows both wired
- [ ] The property's tag comment and assertions are unchanged
- [ ] `advisor-plans/README.md` status row for 005 updated

## STOP conditions

- Lowering iterations makes the property flaky (it should not — argon2 is
  deterministic per input) — STOP and report.
- The "Current state" excerpts don't match.

## Maintenance notes

- Wire `test:ci` into the actual CI workflow when one is added (none present today).
- If more real-crypto property tests are added later, route them through the same
  `PBT_FULL` gate so the default loop stays fast.
