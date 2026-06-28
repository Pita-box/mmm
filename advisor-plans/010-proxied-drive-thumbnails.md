# Plan 010: Náhledy přes proxy (thumbnaily místo plného streamu na kartách)

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření a potvrď očekávaný výsledek. Při jakékoli STOP podmínce zastav a
> nahlas — neimprovizuj. `driveFileId` ani googleusercontent/Drive domény se
> NIKDY nesmí dostat ke klientovi (R6.4). Po dokončení aktualizuj řádek 010
> v `advisor-plans/README.md`.
>
> **Drift check (no VCS)**: otevři `app/src/lib/media-presentation.ts`
> (`toCardItem`, `streamingUrlFor`), `app/src/components/MediaCard.tsx`
> (`MediaCardItem`, `<img src={item.thumbnailUrl}>`),
> `app/src/lib/google-drive-storage.ts` (`listFiles`, `streamFile` jako vzor),
> `app/src/app/api/stream/[token]/route.ts` (vzor route + token).
> Pokud se živý kód liší od výňatků níže, ber to jako STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED (živé Drive I/O; pozor na únik domén/fileId klientovi)
- **Depends on**: 009 (read-only session varianta — thumb route ji musí použít, jinak znovu write-amplifikace)
- **Category**: bug + perf
- **Planned at**: no VCS; baseline = 2026-06-28 build session

## Why this matters
`toCardItem` dnes nastavuje `thumbnailUrl` na **plnou** stream proxy
(`/api/stream/<token>` = celý soubor). `MediaCard`/`Hero` renderují
`<img src={thumbnailUrl}>`, takže:
- **Video karty jsou prázdné** — prohlížeč neumí dekódovat video stream jako
  `<img>` (symptom hlášený uživatelem: na kartách videa nic není).
- **Fotky stáhnou plné rozlišení** jako náhled — zbytečný přenos (mřížka 24
  karet = 24× plný soubor), pomalé, drahé.

Google Drive umí levný `thumbnailLink` (malý JPEG/PNG náhled i pro videa).
Cíl: zavést **proxy náhledovou route**, která načte Drive thumbnail
server-side (s Bearer tokenem) a streamuje klientovi jen malý obrázek — bez
úniku `driveFileId` i bez úniku googleusercontent domény (R6.4). Karty pak
ukážou skutečný náhled (i u videí) a přestanou tahat plné soubory.

## Current state
- `app/src/lib/media-presentation.ts`:
  ```ts
  export function toCardItem(item, userId, presentation = {}, now = new Date()): MediaCardItem {
    return {
      ...toPublicMedia(item),
      title: presentation.title,
      tags: presentation.tags,
      thumbnailUrl: streamingUrlFor(item.id, userId, now), // ← PLNÝ stream
    };
  }
  ```
  `streamingUrlFor` vydá `/api/stream/<token>` přes
  `getDriveConnector().issueStreamingToken({ mediaId, userId, now })`.
- `app/src/components/MediaCard.tsx`: `MediaCardItem` má `thumbnailUrl?: string`;
  vizuál renderuje `<img src={item.thumbnailUrl} … className="object-cover">`.
  (`Hero.tsx` čte tutéž položku — ověř, jak konzumuje náhled.)
- `app/src/lib/google-drive-storage.ts`: `DriveStorage` má `streamFile`,
  `listFiles`, `upload`, `deleteFile`, `createResumableSession`. Klient se
  vytváří `driveClient()` (OAuth refresh token); `auth.getAccessToken()` umí
  vrátit Bearer token (viz `createResumableSession`).
- `app/src/app/api/stream/[token]/route.ts`: vzor route — `runtime="nodejs"`,
  ověří token `verifyStreamingToken`, sváže s `principal.userId`, ověří
  `isApproved`, streamuje. **Náhledová route to zkopíruje** (token, vlastník,
  approved), jen místo plného souboru vrátí thumbnail.
- `DriveStorage` interface + stub žijí v `app/src/services/drive-connector.ts`
  (sem se přidá nová metoda + stub návrat `auth_failed`/prázdno).

Convention: služby vrací `Result<T, DriveError>`, nikdy nevyhazují přes hranici;
proxy nesmí prozradit Drive identifikátory ani domény; testy hermetické (stub);
`// eslint-disable-next-line @next/next/no-img-element` je u proxy náhledů OK.

## Commands you will need
| Purpose   | Command (z `app/`)            | Expected |
|-----------|-------------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`      | exit 0   |
| Tests     | `pnpm test`                   | all pass |
| Build     | `pnpm run build`              | exit 0   |
| Lint      | `pnpm run lint`               | exit 0   |

## Scope
**In scope:**
- `app/src/services/drive-connector.ts` — přidat do `DriveStorage` metodu
  `getThumbnail(driveFileId): Promise<Result<{ body: ReadableStream<Uint8Array>; contentType: string }, DriveError>>` + doplnit stub.
- `app/src/lib/google-drive-storage.ts` — implementovat `getThumbnail`:
  `drive.files.get({ fileId, fields: "thumbnailLink" })`, pak `fetch`
  `thumbnailLink` s `Authorization: Bearer <accessToken>` a streamovat výsledek.
- `app/src/app/api/thumb/[token]/route.ts` — **nová** route (`runtime="nodejs"`),
  vzor = stream route: read-only session (z plánu 009), ověř token + vlastníka
  + `isApproved`, vrať obrázek z `getThumbnail`. Žádné Drive domény v odpovědi.
- `app/src/lib/media-presentation.ts` — přidat `posterUrl` (proxy thumbnail) do
  `MediaCardItem` výstupu; `thumbnailUrl` (plný stream) ponechat pro přehrávač.
- `app/src/components/MediaCard.tsx` — `MediaCardItem` doplnit `posterUrl?`;
  `<img>` použít `posterUrl` (fallback na nic, ne na plný stream).
- `app/src/components/Hero.tsx` — `<img>` použít `posterUrl`.
- testy: handler test nové thumb route (modeluj podle
  `app/src/app/api/stream/[token]/route.test.ts`).

**Out of scope (NEMĚNIT):**
- `MediaPlayer.tsx` — přehrávač dál používá plný `thumbnailUrl`/stream.
- Tokenovací schéma (`issueStreamingToken`/`verifyStreamingToken`) — znovupoužij
  beze změny (stejný token slouží i pro thumbnail).
- `streamFile` a stream route logika přehrávání.

## Steps

### Step 1: `getThumbnail` v DriveStorage interface + stub
V `drive-connector.ts` přidej metodu do `DriveStorage` a do stub
implementace (stub vrátí `err({ code: "auth_failed", … })`, ať testy zůstanou
hermetické a nebudou volat živé Drive).

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → stub testy zelené.

### Step 2: Reálná implementace `getThumbnail`
V `google-drive-storage.ts`:
```ts
async getThumbnail(driveFileId) {
  try {
    const { auth, drive } = driveClient();
    const meta = await drive.files.get({ fileId: driveFileId, fields: "thumbnailLink" });
    const link = meta.data.thumbnailLink;
    if (!link) return err({ code: "not_found", message: "Drive nevrátil náhled." });
    const at = await auth.getAccessToken();
    const accessToken = typeof at === "string" ? at : at?.token;
    if (!accessToken) return err({ code: "auth_failed", message: "Chybí access token." });
    const res = await fetch(link, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok || !res.body) {
      return err({ code: "upload_failed", message: `Náhled selhal (HTTP ${res.status}).` });
    }
    return ok({
      body: res.body as ReadableStream<Uint8Array>,
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    });
  } catch (e) {
    return err({ code: "upload_failed", message: `Načtení náhledu selhalo: ${(e as Error).message}` });
  }
}
```
(Pokud `DriveError` nemá kód `not_found`, použij existující nejbližší kód —
ověř v `app/src/lib/errors.ts` a v případě potřeby tam kód doplň; to je
povolené v rámci tohoto scope.)

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Nová route `/api/thumb/[token]/route.ts`
Zkopíruj strukturu stream route, ale:
- použij `getSessionPrincipalReadOnly()` (plán 009) — náhledy jsou hot path,
  NESMÍ posouvat `lastActivityAt`,
- ověř token (`verifyStreamingToken`), `verified.value.userId === principal.userId`,
  dohledej médium, `isApproved`,
- místo `streamFile` zavolej `driveStorage.getThumbnail(media.driveFileId)`,
- hlavičky: `Content-Type` z výsledku, `Cache-Control: private, max-age=3600`
  (náhledy se nemění; krátká privátní cache sníží zátěž — viz Open question),
  **žádný** Drive/googleusercontent odkaz v těle ani hlavičkách.

**Verify**: `pnpm test -- thumb` → nový handler test projde (401 bez session,
403 cizí uživatel, 404 neschválené, 200 + image/* u happy path se stubem).

### Step 4: `posterUrl` v prezentaci + komponentách
- `media-presentation.ts`: přidej `thumbUrlFor(mediaId, userId, now)` →
  `/api/thumb/<token>` (stejný token jako stream) a v `toCardItem` nastav
  `posterUrl: thumbUrlFor(...)`. `thumbnailUrl` (plný stream) ponech kvůli
  přehrávači.
- `MediaCard.tsx`: do `MediaCardItem` přidej `posterUrl?: string`; v `<img>`
  použij `item.posterUrl` (když chybí, vykresli gradient placeholder jako dnes).
- `Hero.tsx`: `<img>` přepni na `posterUrl`.

**Verify**: `pnpm exec tsc --noEmit` → 0; `pnpm test` → vše zelené.

### Step 5: Sestavení + lint + manuální smoke
**Verify**: `pnpm run build` exit 0; `pnpm run lint` exit 0. Manuální smoke
(zdokumentuj, neautomatizuj proti živému Drive): otevři Preview přihlášený →
video karty mají náhled, fotky tahají malý thumbnail (Network panel: velikost
náhledu ≪ plný soubor), v odpovědích `/api/thumb/...` není žádná
googleusercontent ani drive.google doména.

## Test plan
- Nový soubor: `app/src/app/api/thumb/[token]/route.test.ts`, vzor =
  `app/src/app/api/stream/[token]/route.test.ts`.
- Případy: bez session → 401; token jiného uživatele → 403; token OK ale
  médium neschválené/neexistuje → 404; happy path → 200 + `Content-Type`
  začínající `image/`; tělo neobsahuje `driveFileId` ani Drive domény.
- Verifikace: `pnpm test` → vše zelené vč. nových.

## Done criteria
- [ ] `DriveStorage.getThumbnail` existuje (interface + stub + reálná impl)
- [ ] `/api/thumb/[token]/route.ts` existuje, používá `getSessionPrincipalReadOnly`, ověřuje token+vlastníka+approved
- [ ] `MediaCardItem.posterUrl` zaveden; `MediaCard`/`Hero` `<img>` čte `posterUrl`, ne plný stream
- [ ] `grep -rn "thumbnailLink\|googleusercontent\|drive.google" app/src/components` → prázdné (klient nezná Drive domény)
- [ ] handler testy thumb route zelené; `pnpm test` exit 0
- [ ] `pnpm exec tsc --noEmit` 0, `pnpm run build` 0, `pnpm run lint` 0
- [ ] žádný soubor mimo In-scope změněn
- [ ] `advisor-plans/README.md` řádek 010 aktualizován (a pozn., že superseduje finding „náhled = plný stream")

## STOP conditions
- Živý `toCardItem`/`MediaCard`/`google-drive-storage` nevypadá jako výňatky
  výše (drift) → STOP.
- `getThumbnail` by musel poslat `thumbnailLink` klientovi, aby fungoval →
  STOP (to porušuje R6.4; náhled MUSÍ proxovat server).
- Verifikace selže dvakrát po rozumné opravě → STOP a nahlas.

## Open question (rozhodni a zaznamenej do plánu/README)
- **Cache náhledů.** `Cache-Control: private, max-age=3600` je levné a bezpečné
  (per-uživatel přes podepsaný token). Volitelně server-side cache do
  `/tmp`/paměti, ale to je další plán — teď stačí HTTP cache hlavička. Token má
  ≤300s platnost (R6.1), takže klientská cache stejně neobchází autorizaci.

## Maintenance notes
- Až přibude HLS/transcoding, poster z Drive thumbnail zůstane platný.
- Reviewer ať zkontroluje, že thumb route nikde nevrací `driveFileId`/Drive
  doménu a že používá read-only session (žádná write-amplifikace, plán 009).
- Pokud Drive nevrátí `thumbnailLink` (čerstvě nahraný soubor — generuje se
  asynchronně), karta spadne na placeholder; zvážit krátký retry až bude vadit.
