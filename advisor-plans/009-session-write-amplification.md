# Plan 009: Odstranit write-amplifikaci relace ve streamovací proxy

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření a potvrď očekávaný výsledek, než půjdeš dál. Při jakékoli STOP
> podmínce zastav a nahlas — neimprovizuj. Po dokončení aktualizuj stavový
> řádek 009 v `advisor-plans/README.md`.
>
> **Drift check (no VCS)**: otevři `app/src/lib/session.ts`
> (`validateAndTouchSession`, `getSessionPrincipal`) a
> `app/src/app/api/stream/[token]/route.ts` (volání `getSessionPrincipal`).
> Pokud se živý kód liší od výňatků v „Current state" níže, ber to jako STOP.

## Status
- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW (přidává read-only variantu; chování stránek beze změny)
- **Depends on**: none (logicky navazuje na plán 002/003, oba DONE)
- **Category**: perf
- **Planned at**: no VCS; baseline = 2026-06-28 build session

## Why this matters
`getSessionPrincipal()` při **každém** volání spustí `validateAndTouchSession`,
která vždy provede `session.update({ lastActivityAt })` — tedy **zápis do DB na
každý požadavek**. Streamovací proxy (`/api/stream/[token]`) volá
`getSessionPrincipal()` na každý požadavek na obsah: mřížka s 24 kartami =
24 zápisů do stejné tabulky, a přehrávání videa přes HTTP Range generuje mnoho
dílčích požadavků → desítky až stovky zápisů do **jednoho** session řádku během
jednoho přehrání. To je zbytečná write-amplifikace a kontence na jednom řádku
(row-lock), která neúměrně zatěžuje Postgres/Supabase a zpomaluje seek.

Posun `lastActivityAt` (rolling 30min inaktivita, R1.6/R2.3) má smysl u
**navigace mezi stránkami**, ne u každého bajtu streamu. Cíl: zachovat
rolling inaktivitu pro stránky/akce, ale ve streamovací proxy relaci jen
**ověřit bez zápisu**.

## Current state
- `app/src/lib/session.ts`:
  - `validateAndTouchSession(principal, db?, now?)` — přečte session + živý
    stav účtu, při vypršení smaže záznam, jinak **vždy** zapíše
    `lastActivityAt` a vrátí principála. Výňatek:
    ```ts
    await db.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date(now) },
    });
    return { ...principal, role: session.user.role, /* … */ };
    ```
  - `getSessionPrincipal()` — `resolveSessionPrincipal(cookie)` →
    `validateAndTouchSession(principal)` (touch varianta).
  - `requireSession`/`requireAdmin`/`requireUploader` staví na
    `getSessionPrincipal()`.
- `app/src/app/api/stream/[token]/route.ts` — `GET` začíná:
  ```ts
  const principal = await getSessionPrincipal();
  if (principal === null) { /* 401 */ }
  ```
  Tj. proxy používá **touch** variantu (zápis na každý request).
- Existující testy: `app/src/lib/session.test.ts` (vzor struktury testů session),
  `app/src/app/api/stream/[token]/route.test.ts` (handler testy proxy).

Convention: služby/utility vrací `Result`/principál nebo `null`, nikdy
nevyhazují přes hranici; fake Prisma se v testech předává jako poslední arg
(`db`); pnpm only; `// ponytail:` komentář u záměrných zjednodušení.

## Commands you will need
| Purpose   | Command (z `app/`)                          | Expected |
|-----------|---------------------------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`                    | exit 0   |
| Tests     | `pnpm test`                                 | all pass |
| Jeden soubor | `pnpm test -- session`                   | pass     |
| Build     | `pnpm run build`                            | exit 0   |
| Lint      | `pnpm run lint`                             | exit 0   |

## Scope
**In scope (jediné soubory, které měň):**
- `app/src/lib/session.ts` — přidat read-only validační variantu + parametrizovat
  `validateAndTouchSession`, aby šlo touch vypnout.
- `app/src/app/api/stream/[token]/route.ts` — použít read-only variantu.
- `app/src/lib/session.test.ts` — test, že read-only varianta NEzapisuje
  `lastActivityAt`, ale stále odmítne neexistující/zablokovanou/vypršelou relaci.

**Out of scope (NEMĚNIT):**
- `requireSession`/`requireAdmin`/`requireUploader` a stránky/akce — ty musí
  dál posouvat `lastActivityAt` (rolling inaktivita pro navigaci).
- `access-context.ts` (podpis cookie), middleware, jakákoli změna formátu cookie.
- Webhooky, cron, ostatní route.

## Steps

### Step 1: Read-only validační varianta v `session.ts`
Refaktoruj `validateAndTouchSession` tak, aby šlo přeskočit zápis. Doporučená
podoba — přidej volitelný `touch` flag (default `true`, zachová dnešní chování):
```ts
export async function validateSession(
  principal: SessionPrincipal,
  options: { touch?: boolean } = {},
  db: Pick<PrismaClient, "session"> = prisma,
  now: number = Date.now(),
): Promise<SessionPrincipal | null> {
  const session = await db.session.findUnique({ /* … beze změny … */ });
  if (session === null) return null;
  if (session.user.status !== "active") return null;
  if (now - session.lastActivityAt.getTime() >= SESSION_INACTIVITY_LIMIT_MS) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (options.touch !== false) {
    await db.session.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date(now) },
    });
  }
  return {
    ...principal,
    role: session.user.role,
    accountStatus: session.user.status,
    subscriptionStatus: session.user.subscriptionStatus,
    // při touch=false vrať skutečné lastActivityAt z DB, ne „now"
    lastActivityAt: (options.touch === false
      ? session.lastActivityAt
      : new Date(now)
    ).toISOString(),
  };
}
```
Zachovej zpětnou kompatibilitu: ponech `validateAndTouchSession` jako tenký
wrapper, který volá `validateSession(principal, { touch: true }, db, now)`
(aby existující testy/volání nepukly). Přidej `// ponytail:` komentář, že
read-only varianta existuje kvůli write-amplifikaci ve streamu.

Přidej i pohodlný getter bez zápisu, který si přečte cookie:
```ts
/** Ověří relaci z cookie BEZ posunu lastActivityAt (pro hot-path proxy). */
export async function getSessionPrincipalReadOnly(): Promise<SessionPrincipal | null> {
  const store = await cookies();
  const principal = await resolveSessionPrincipal(store.get(SESSION_COOKIE)?.value);
  if (principal === null) return null;
  return validateSession(principal, { touch: false });
}
```

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: Streamovací proxy použije read-only variantu
V `app/src/app/api/stream/[token]/route.ts` nahraď
```ts
const principal = await getSessionPrincipal();
```
za
```ts
const principal = await getSessionPrincipalReadOnly();
```
a uprav import. Logika 401/403/404 zůstává beze změny — pořád ověřujeme,
že relace existuje, účet je aktivní a inaktivita nevypršela; jen
neposouváme `lastActivityAt`.

**Verify**: `pnpm test -- stream` → existující handler testy proxy projdou.

### Step 3: Test, že read-only NEzapisuje
Do `app/src/lib/session.test.ts` přidej případy (modeluj podle existující
struktury fake `session` v tomto souboru):
- `validateSession(p, { touch: false }, fakeDb)` vrátí principála **a**
  `fakeDb.session.update` NEbyl zavolán (spy/čítač = 0).
- `validateSession(p, { touch: false }, fakeDb)` u **neexistující** relace
  vrátí `null`.
- `validateSession(p, { touch: false }, fakeDb)` u účtu se `status !== "active"`
  vrátí `null`.
- `validateSession(p, { touch: false }, fakeDb)` u **vypršelé** inaktivity
  vrátí `null` a `session.delete` byl zavolán (úklid běží i bez touch).
- regrese: `validateAndTouchSession` (wrapper) stále `update` volá (touch=true).

**Verify**: `pnpm test -- session` → všechny (vč. nových) projdou.

## Test plan
- Soubor: `app/src/lib/session.test.ts` (rozšířit, vzor = existující testy tamtéž).
- Pokrytí: touch=false neprovede `update` (happy path), odmítnutí
  neexistující/zablokované/vypršelé relace beze změny chování, úklid
  vypršelé relace běží i bez touch, regrese touch=true.
- Verifikace: `pnpm test` → vše zelené vč. nových testů.

## Done criteria
- [ ] `pnpm exec tsc --noEmit` exit 0
- [ ] `app/src/lib/session.ts` má read-only variantu (`validateSession` s
      `touch` + `getSessionPrincipalReadOnly`); `validateAndTouchSession`
      zachováno jako wrapper (zpětně kompatibilní)
- [ ] stream route volá `getSessionPrincipalReadOnly()` (žádný `session.update`
      na request streamu) — `grep -n "getSessionPrincipal\b" app/src/app/api/stream/\[token\]/route.ts` nic nevrací (jen read-only varianta)
- [ ] nové testy v `session.test.ts` ověřují, že touch=false nezapisuje
- [ ] `pnpm test` exit 0, `pnpm run build` exit 0, `pnpm run lint` exit 0
- [ ] žádný soubor mimo In-scope změněn
- [ ] `advisor-plans/README.md` řádek 009 aktualizován

## STOP conditions
- `validateAndTouchSession`/`getSessionPrincipal` v živém kódu nevypadá jako
  výňatek výše (drift) → STOP.
- Pro vypnutí touch by bylo potřeba měnit `requireSession`/stránky → STOP
  (to je mimo scope; stránky musí dál touchnout).
- Verifikace selže dvakrát po rozumné opravě → STOP a nahlas.

## Maintenance notes
- Pokud někdy přidáme „online presence" / „last seen", zvaž lehčí throttling
  (touch max. 1×/min) místo úplného vypnutí — ale ve streamu nikdy per-request.
- Per-request memoizace principála (zmíněná v komentáři `session.ts`) je
  ortogonální další optimalizace; tento plán ji neřeší.
- Reviewer ať ověří, že žádná jiná hot-path route (thumbnaily — plán 010)
  nepoužívá touch variantu.
