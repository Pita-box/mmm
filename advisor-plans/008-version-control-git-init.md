# Plan 008: Zavést verzování (git init) bez úniku tajemství

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření. Při jakékoli STOP podmínce zastav a nahlas. Po dokončení aktualizuj
> stavový řádek 008 v `advisor-plans/README.md`.
>
> **Drift check**: repo nemá VCS (baseline = build session 2026-06-28). Před
> startem ověř, že platí „Current state" níže (žádný `.git` v kořeni).

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (žádná změna kódu) — ALE pozor na commit tajemství (viz STOP)
- **Depends on**: none
- **Category**: dx
- **Planned at**: no VCS; baseline = 2026-06-28 build session

## Why this matters
Celý projekt (`~/Documents/WEB/mmmred`) není git repozitář — žádná historie,
žádný rollback, žádné review diffů, a advisor plány nemůžou drift-checkovat přes
SHA. Pro aktivně se vyvíjející aplikaci je to největší provozní riziko. Cíl: mít
git s první revizí a **zaručeně neverzovaným `.env`** (obsahuje živá tajemství —
Supabase, Google, Telegram, session/streaming secrets).

## Current state
- `git -C ~/Documents/WEB/mmmred rev-parse` → „not a git repository".
- `app/.gitignore` existuje (Next default: `node_modules`, `.next`, `.env*` apod.).
- Kořen `~/Documents/WEB/mmmred/` **nemá** `.gitignore`.
- Tajemství: `app/.env` (živé hodnoty). `app/.env.example` (jen názvy klíčů — smí do gitu).
- Cizí složky ve stromu, které se NESMÍ verzovat: `app/node_modules`, `app/.next`,
  a dle steeringu `~/Documents/WEB/mmmred/.kiro` je projektová (smí), ale
  `~/kiro-telegram-bridge/` je MIMO tento repo (kořen je `mmmred`, takže se netýká).

## Commands you will need
| Purpose | Command (z kořene `~/Documents/WEB/mmmred`) | Expected |
|---|---|---|
| Init | `git init` | exit 0 |
| Ignore check | `git check-ignore app/.env` | vypíše `app/.env` (= je ignorován) |
| Tracked preview | `git add -A -n` (dry-run) | v seznamu NENÍ `app/.env` ani `node_modules`/.next |
| Status | `git status` | žádné tajemství ve „to be committed" |

## Scope
**In scope:**
- `~/Documents/WEB/mmmred/.gitignore` (vytvořit)
- `git init` + první commit v kořeni `~/Documents/WEB/mmmred`

**Out of scope:**
- Jakákoli změna kódu pod `app/src`, schémat, plánů.
- `git remote add` / push / PR — NEDĚLAT (lokální only, dokud operátor neřekne).

## Steps

### Step 1: Vytvoř kořenový `.gitignore`
Vytvoř `~/Documents/WEB/mmmred/.gitignore` s minimálně:
```
# deps & build
**/node_modules/
**/.next/
# secrets — NIKDY neverzovat
**/.env
**/.env.local
**/.env*.local
# OS
.DS_Store
```
(`app/.env.example` zůstává verzovaný — `.gitignore` ho neignoruje.)

**Verify**: `git init` (pokud ještě neproběhl) → `git check-ignore app/.env` vypíše `app/.env`.

### Step 2: `git init` + ověř, že tajemství nejsou ve stage
`git init` v kořeni. Pak `git add -A -n` (dry run) a zkontroluj výstup.

**Verify**: `git add -A -n | grep -E "(^|/)\.env$"` → **prázdné** (žádný `.env`).
Také `git add -A -n | grep -E "node_modules|\.next/"` → prázdné.

### Step 3: První commit
`git add -A` → `git commit -m "chore: initial commit (existing MMMRED app)"`.

**Verify**: `git ls-files | grep -E "(^|/)\.env$"` → **prázdné** (potvrzení, že `.env` NENÍ verzován). `git log --oneline` → 1 commit.

## Done criteria
- [ ] `~/Documents/WEB/mmmred/.gitignore` existuje a ignoruje `**/.env`, `**/node_modules/`, `**/.next/`
- [ ] `git ls-files | grep -E "(^|/)\.env$"` je prázdné (žádné živé tajemství v gitu)
- [ ] `git ls-files | grep -c "app/.env.example"` = 1 (onboarding soubor verzován)
- [ ] `git log --oneline` má první commit
- [ ] žádný remote nepřidán (`git remote` prázdné)

## STOP conditions
- Pokud `git add -A -n` ukazuje JAKÝKOLI `.env` (kromě `.env.example`) → STOP, oprav `.gitignore`, NEcommituj. (Committnuté tajemství je spálené i po smazání.)
- Pokud `git ls-files` po commitu obsahuje `node_modules`/`.next`/`.env` → STOP, commit zahoď (`git reset`) a oprav ignore.

## Maintenance notes
- Po tomto plánu mají budoucí advisor plány reálný SHA pro drift-check.
- Až bude potřeba remote/deploy, řeší to operátor (mimo tento plán).
- Pozn.: existující `advisor-plans/` referují „no VCS" baseline — po git initu lze
  příští plány stampovat `git rev-parse --short HEAD`.
