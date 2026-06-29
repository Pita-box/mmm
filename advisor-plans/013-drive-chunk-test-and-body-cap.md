# Plan 013: Drive-chunk proxy — handler test + strop velikosti těla

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření a potvrď očekávaný výsledek. Při jakékoli STOP podmínce zastav a
> nahlas. Po dokončení aktualizuj řádek 013 v `advisor-plans/README.md`.
>
> **Drift check**: `git diff --stat 9338b72..HEAD -- app/src/app/api/drive-chunk`
> Pokud se route od baseline změnila, porovnej „Current state" s živým kódem;
> na neshodu reaguj jako na STOP.

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests + security
- **Planned at**: commit `9338b72`, 2026-06-28

## Why this matters
`/api/drive-chunk` (plán 012) je bezpečnostně citlivá proxy: přeposílá tělo
požadavku na Google upload endpoint. Má auth (uploader) i SSRF guard, ale
**nemá žádný handler test** — regrese v authu/SSRF guardu by prošla tiše. Navíc
čte celé tělo přes `request.arrayBuffer()` **bez stropu velikosti**, takže
přihlášený uploader může poslat libovolně velké tělo a vyvolat RAM špičku.
Cíl: pokrýt route testy (auth, SSRF guard, happy path) a přidat strop velikosti.

## Current state
- `app/src/app/api/drive-chunk/route.ts` — `PUT` handler:
  ```ts
  export async function PUT(request: NextRequest): Promise<Response> {
    const principal = await getSessionPrincipalReadOnly();
    if (principal === null || (principal.role !== "Admin" && principal.role !== "Distributor")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const uploadUrl = request.headers.get("x-upload-url") ?? "";
    const range = request.headers.get("x-content-range") ?? "";
    if (!uploadUrl.startsWith(ALLOWED_PREFIX)) {
      return NextResponse.json({ error: "bad_upload_url" }, { status: 400 });
    }
    const body = Buffer.from(await request.arrayBuffer());   // ← bez stropu
    let res: Response;
    try {
      res = await fetch(uploadUrl, { method: "PUT", headers: range ? { "Content-Range": range } : {}, body, redirect: "manual" });
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
    if (res.status === 308) return NextResponse.json({ done: false });
    if (res.ok) { const data = (await res.json().catch(() => ({}))) as { id?: string }; return NextResponse.json({ done: true, id: data.id ?? "" }); }
    return NextResponse.json({ error: `drive_${res.status}` }, { status: 502 });
  }
  ```
  `ALLOWED_PREFIX = "https://www.googleapis.com/upload/"`. `runtime="nodejs"`, `dynamic="force-dynamic"`.
- Klient (`app/src/lib/resumable-upload.ts`) posílá chunky `UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024` (8 MB) přes `fetch("/api/drive-chunk", { method:"PUT", headers:{ "x-upload-url", "x-content-range" }, body: file.slice(...) })`.
- **Vzor handler testu** (mock hranic přes `vi.hoisted` + `vi.mock`): `app/src/app/api/stream/[token]/route.test.ts` a `app/src/app/api/thumb/[token]/route.test.ts`. Oba mockují `@/lib/session` a další moduly, importují `GET`, volají s fake `NextRequest`.

Convention: handler testy mockují `@/lib/session` (`getSessionPrincipalReadOnly`), volají exportovaný handler přímo; pnpm only; vitest.

## Commands you will need
| Purpose   | Command (z `app/`)              | Expected |
|-----------|---------------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`        | exit 0   |
| Test      | `pnpm test -- drive-chunk`      | pass     |
| Vše       | `pnpm test`                     | all pass |
| Build     | `pnpm run build`                | exit 0   |
| Lint      | `pnpm run lint`                 | exit 0   |

## Scope
**In scope:**
- `app/src/app/api/drive-chunk/route.ts` — přidat strop velikosti těla.
- `app/src/app/api/drive-chunk/route.test.ts` (vytvořit) — handler testy.

**Out of scope:**
- `resumable-upload.ts`, upload UI, jiné route.
- Změna SSRF prefixu nebo auth logiky (jen testovat stávající).

## Steps

### Step 1: Strop velikosti těla
V `route.ts` přidej konstantu a kontrolu PŘED `arrayBuffer()` (ať se obří tělo
nebufferuje zbytečně): nejdřív zkontroluj `Content-Length` hlavičku; po načtení
ověř i skutečnou délku (header lze podvrhnout).
```ts
// Strop: chunk je 8 MB; necháme rezervu na 16 MB. Větší tělo odmítneme (413).
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
...
const declared = Number(request.headers.get("content-length") ?? "0");
if (Number.isFinite(declared) && declared > MAX_CHUNK_BYTES) {
  return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
}
const body = Buffer.from(await request.arrayBuffer());
if (body.byteLength > MAX_CHUNK_BYTES) {
  return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
}
```
Vlož mezi SSRF guard a `fetch`. Pořadí kontrol: auth → SSRF → velikost → fetch.

**Verify**: `pnpm exec tsc --noEmit` → 0.

### Step 2: Handler testy
Vytvoř `app/src/app/api/drive-chunk/route.test.ts` podle vzoru
`thumb/[token]/route.test.ts`. Mockuj `@/lib/session`:
```ts
vi.mock("@/lib/session", () => ({
  getSessionPrincipalReadOnly: async () => h.principal,
}));
```
a globální `fetch` (přes `vi.stubGlobal("fetch", ...)` nebo `vi.spyOn(globalThis, "fetch")`).
Případy (volej `PUT(req)` s fake `NextRequest`-like objektem nesoucím
`headers.get()` a `arrayBuffer()`):
- **403** když `principal` je `null` nebo role `User`.
- **400** když `x-upload-url` nezačíná `https://www.googleapis.com/upload/`
  (SSRF guard) — princip uploader.
- **413** když `content-length` > 16 MB (nebo tělo > 16 MB).
- **happy 308**: validní URL, mock `fetch` vrátí `{ status: 308 }` → odpověď
  `{ done: false }`, HTTP 200.
- **happy 200**: mock `fetch` vrátí `ok:true, json: () => ({ id: "X" })` →
  odpověď `{ done: true, id: "X" }`.

Fake request helper (headers + arrayBuffer + nextUrl nepotřeba):
```ts
const req = (headers: Record<string,string>, bytes = new Uint8Array(8)) => ({
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  arrayBuffer: async () => bytes.buffer,
} as unknown as NextRequest);
```

**Verify**: `pnpm test -- drive-chunk` → všechny případy projdou.

## Test plan
- Nový `route.test.ts`: 403 (neuploader), 400 (SSRF), 413 (velké tělo),
  308 happy, 200 happy (vrací id). Vzor = `thumb/[token]/route.test.ts`.
- Verifikace: `pnpm test` → vše zelené vč. nových.

## Done criteria
- [ ] `route.ts` má strop `MAX_CHUNK_BYTES` (header i skutečná délka → 413)
- [ ] `route.test.ts` existuje a pokrývá 403/400/413/308/200
- [ ] `pnpm exec tsc --noEmit` 0, `pnpm test` 0, `pnpm run build` 0, `pnpm run lint` 0
- [ ] žádný soubor mimo In-scope změněn
- [ ] `advisor-plans/README.md` řádek 013 aktualizován

## STOP conditions
- `route.ts` nevypadá jako „Current state" (drift) → STOP.
- Mock `fetch` v testu by zasahoval reálnou síť → STOP (musí být plně mockováno).
- Verifikace selže dvakrát po rozumné opravě → STOP.

## Maintenance notes
- Pokud se chunk v `resumable-upload.ts` zvětší nad 16 MB, zvedni i strop.
- Reviewer ať ověří pořadí kontrol (auth → SSRF → velikost) a že 413 nastane
  před `fetch` na Google.
