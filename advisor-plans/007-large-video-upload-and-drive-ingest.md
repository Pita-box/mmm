# Plan 007 (DIRECTION): velká videa (až 10 GB) — ingest z Drive složky (primární) + client-direct resumable web upload (doplněk)

> **Executor instructions**: This is a direction + implementation plan. Build
> Approach A first (it unblocks 10 GB uploads with the least code and zero server
> upload load). Approach B is an optional later enhancement — do NOT build it in
> the same slice unless A is done and the owner asks. Verify each gate; obey STOP
> conditions; update the status row in `advisor-plans/README.md` when done.
>
> **Drift check (no VCS)**: open `app/src/app/(app)/admin/admin-actions.ts`
> (`uploadMediaAction`), `app/src/services/media-service.ts`
> (`MAX_UPLOAD_BYTES`, `createMediaItem`, `CreateMediaInput`),
> `app/src/lib/google-drive-storage.ts`, and `app/prisma/schema.prisma`
> (`MediaItem`). On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1 (uploads are currently broken for files > 1 MB)
- **Effort**: A = M, B = L
- **Risk**: MED (live Drive I/O; data model dedup)
- **Depends on**: 006 (real Drive storage) — DONE
- **Category**: direction
- **Planned at**: no VCS; baseline = 2026-06-24 build session

## Problém (proč to řešíme)

Upload média běží jako **Server Action** (`uploadMediaAction`), která načte celý
soubor do paměti (`Buffer.from(await input.file.arrayBuffer())`) a teprve pak ho
pošle na Drive. Server Actions mají default limit těla **1 MB**
(„Body exceeded 1 MB limit"). Videa mohou mít **až 10 GB**, takže:

- zvyšovat `serverActions.bodySizeLimit` je špatně — server by bufferoval 10 GB
  v RAM + timeouty,
- protlačovat 10 GB přes Next server (i streamovaně) zbytečně vytěžuje server
  (bandwidth, dlouho držené spojení).

Cíl: nahrávat velká videa tak, aby **bajty nešly přes náš server**.

## Current state

- `app/src/app/(app)/admin/admin-actions.ts` — `uploadMediaAction(input)` čte
  `input.file.arrayBuffer()` → `driveStorage.upload(bytes, …)` → v `$transaction`
  vytvoří `MediaItem` + tagy, s kompenzačním `deleteFile` při selhání (plán 004).
- `app/src/services/media-service.ts` — `MAX_UPLOAD_BYTES = 500 * 1024 * 1024`
  (500 MB), `validateUpload` ho vynucuje; `createMediaItem(input)` zapisuje
  `MediaItem` (`width/height` se hardcodují na 0,0); `CreateMediaInput.modelId`
  je `string | null` (model je nepovinný).
- `app/src/lib/google-drive-storage.ts` — reálné Drive úložiště (OAuth refresh
  token); `upload` cílí do `GDRIVE_ROOT_FOLDER_ID`, `streamFile` umí Range (206).
- `app/prisma/schema.prisma` — `MediaItem.driveFileId String` **není `@unique`**
  (důležité pro dedup při importu — viz Step A2).
- `.env` má `GDRIVE_ROOT_FOLDER_ID` (cílová složka na Drive).

Convention: služby vrací `Result<T, E>`, nikdy nevyhazují přes hranici; pnpm only;
testy zůstávají hermetické (Drive stub v testech).

---

## Approach A — Ingest z Drive složky (PRIMÁRNÍ, doporučeno)

**Myšlenka:** Admin nahraje video do určené Drive složky **mimo web** (Google
Drive web / desktop klient / `rclone` — robustní resumable upload pro 10 GB).
Appka má admin akci **„Importovat z Drive"**, která vylistuje složku přes
`drive.files.list`, najde soubory, které ještě nejsou v DB (podle `driveFileId`),
a založí pro ně `MediaItem`. Metadata (model, tagy, `publishAt`) se doplní v
adminu per položka. **Server nepřenáší upload bajty.**

### Pros / Cons

- ➕ Nejmenší kód, žádný resumable na webu; 10 GB řeší Google nástroje (robustní).
- ➕ Nulová zátěž serveru při uploadu.
- ➖ Manuální krok (nahrát na Drive) + klik „Importovat"; pro cizí distributory
  méně pohodlné (potřebovali by přístup ke složce) — pro vlastníka ideální.
- ➖ Metadata (model/tagy/publish) se nastavují až po importu.

### Scope (A)

**In scope:**
- `app/src/lib/google-drive-storage.ts` — přidat `listFiles(folderId)` →
  `Result<DriveFileMeta[], DriveError>` kde `DriveFileMeta = { driveFileId, name,
  mimeType, sizeBytes }` (přes `drive.files.list`, `q="'<folder>' in parents and
  trashed=false"`, `fields="files(id,name,mimeType,size)"`, stránkování přes
  `pageToken`). Rozšířit `DriveStorage` interface + stub (stub vrací `auth_failed`).
- `app/src/services/media-service.ts` — nová `importFromDrive(files, now?)`:
  pro každý soubor, který (a) je podporovaný typ (`classifyType !== null`) a
  (b) ještě není v DB (dle `driveFileId`), založí `MediaItem` (status default
  `published` ihned, nebo `scheduled` bez publishAt? → založit jako **hidden**,
  ať se neobjeví dřív, než admin doplní metadata — viz Open question 1).
  Vrátí souhrn `{ imported, skipped }`.
- `app/prisma/schema.prisma` — přidat `@unique` na `MediaItem.driveFileId`
  (zamezí duplicitám při opakovaném importu; migrace přes `prisma db execute`).
- Admin akce `importFromDriveAction()` (`admin-actions.ts`) — `requireUploader`,
  zavolá list + import, `revalidatePath`. UI tlačítko „Importovat z Drive" na
  `/admin/media`.
- Zvednout/zrušit `MAX_UPLOAD_BYTES` pro tuto cestu (import velikost neřeší;
  limit nech jen pro případný web upload).

**Out of scope (A):** transcoding/HLS, width/height extrakce (follow-up),
automatické mazání MediaItem když soubor zmizí z Drive (follow-up).

### Steps (A)

1. **A1 — `listFiles` v Drive storage** (+ interface + stub). Verify: `tsc` 0,
   testy hermetické (stub).
2. **A2 — `driveFileId @unique` + migrace** (`prisma db execute`), `prisma
   generate`. Verify: `prisma validate` OK; existující data bez duplicit
   `driveFileId` (zkontroluj dotazem před migrací — pokud duplicity, STOP).
3. **A3 — `importFromDrive` v media-service** + unit/PBT test (dedup dle
   driveFileId, přeskočení nepodporovaných typů). Verify: `pnpm test` zelené.
4. **A4 — `importFromDriveAction` + UI tlačítko** na `/admin/media`; po importu
   se položky objeví v seznamu (jako `hidden`/k doplnění). Verify: `tsc`/`build`.
5. **A5 — manuální smoke**: nahraj malé video do `GDRIVE_ROOT_FOLDER_ID` přes
   Drive web → klikni „Importovat" → vznikne `MediaItem` → doplň tagy/model →
   publikuj → přehraje se přes proxy. Dokumentuj (neautomatizuj proti live Drive).

### Open questions (A)

1. **Výchozí stav importovaného média** — `hidden` (admin musí explicitně
   publikovat po doplnění metadat) vs `published` ihned. Doporučení: **hidden**,
   ať se neobjeví bez tagů/modelu.
2. **Width/height** — zatím 0,0 (jako dnes). Extrakce rozměrů/délky z videa je
   follow-up (ffprobe na serveru by ale opět tahal soubor — spíš odložit nebo
   číst přes Drive metadata, pokud je má).

---

## Approach B — Client-direct resumable web upload (DOPLNĚK, později)

Pro upload **z webu** bez přístupu ke Drive složce (např. distributoři):

1. Server action/route `createDriveUploadSession(meta)` → přes OAuth udělá
   **resumable init** (`POST …/upload/drive/v3/files?uploadType=resumable`) →
   vrátí klientovi `sessionUri` (vázané na konkrétní upload; refresh/access token
   zůstává na serveru).
2. Klient nahrává soubor **po částech přímo do Googlu** — `PUT sessionUri` s
   `Content-Range: bytes start-end/total` (chunk 64–256 MB), s progress + retry
   (308 = continue, 200/201 = hotovo, vrací file id).
3. Klient zavolá `finalizeUpload({ driveFileId, modelId, tags, publishAt })` →
   založí `MediaItem` (+ tagy) atomicky (stejná logika jako dnešní upload, jen
   bez bajtů).

**Pozn.:** B znovupoužije `importFromDrive`/`createMediaItem` zápisovou část.
Stavět až po A a jen pokud je potřeba in-web upload. Effort L (chunking, progress,
retry, abort/resume).

---

## Commands

| Purpose   | Command (from `app/`)                  | Expected |
|-----------|----------------------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`               | exit 0   |
| Tests     | `pnpm test`                            | all pass (hermetic, stub) |
| Build     | `pnpm run build`                       | exit 0   |
| Migrace   | `pnpm exec prisma db execute --file … --schema prisma/schema.prisma` | OK |

## Done criteria (A)

- [ ] `listFiles` v `DriveStorage` (+ stub) — `tsc` 0
- [ ] `MediaItem.driveFileId @unique` + migrace aplikovaná; `prisma validate` OK
- [ ] `importFromDrive` dedupuje dle `driveFileId`, přeskakuje nepodporované typy; test zelený
- [ ] `importFromDriveAction` + UI „Importovat z Drive" na `/admin/media`
- [ ] `pnpm test` zelené (hermetické), `pnpm run build` exit 0
- [ ] manuální smoke zdokumentován
- [ ] `advisor-plans/README.md` status řádek 007 aktualizován

## STOP conditions

- Existující `MediaItem` mají duplicitní `driveFileId` → STOP před přidáním
  `@unique` (nejdřív vyřeš data).
- `drive.files.list` vrací i soubory mimo cílovou složku (špatný `q`) → STOP,
  oprav dotaz (import nesmí zatáhnout cizí soubory).
- Import by zakládal média rovnou jako `published` bez metadat → STOP, použij
  `hidden` (Open question 1).

## Maintenance notes

- Follow-ups: width/height/délka extrakce, smazání `MediaItem` při zmizení
  souboru z Drive (sync v obou směrech), HLS transcoding (samostatný plán),
  Approach B (web resumable upload).
- `serverActions.bodySizeLimit` v `next.config.ts` NEZVYŠOVAT kvůli velkým
  videím — A je obchází úplně.
