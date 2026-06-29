# Build journal — MMMRED

Záznamy chronologicky, nejnovější nahoře.

## 2026-06-28 — Plán 014: sjednocení štítkovacího vstupu (branch audit)

### Hotové tasky
- Plán 014 — ověřeno (tsc 0, 317 testů, build 0, lint čistý).

### Nové funkce / změny
- `components/admin/tag-value-input.tsx` (`TagValueInput`) — jediná sdílená komponenta štítkového vstupu: Enter/čárka při psaní (+ vložení řetězce), `<datalist>` našeptávač, chipy `--radius-sm`. `onAdd(values[])` (rozdělené), `onRemove(value)`; dedupe/ukládání řeší rodič.
- Nahrazeno na 3 místech: `media-edit-panel` (expanded — smazán interní `CategoryTagInput`), `upload-wizard` (smazán inline vstup + `drafts`/`addTag`), `media-upload-form` (smazán `TagCategoryInput`). `grep CategoryTagInput|TagCategoryInput` → 0.
- Vedlejší oprava: `media-upload-form` teď má **comma-on-type** (dřív jen Enter) — automaticky díky sdílené komponentě.
- `tag-value-input.test.tsx` — Enter přidá, čárka přidá hotovou část, ✕ odebere.

## 2026-06-28 — Plán 013: drive-chunk proxy — test + strop těla (branch audit)

### Hotové tasky
- Plán 013 — ověřeno (tsc 0, 313 testů, build 0, lint bez chyb).

### Nové funkce / změny
- `/api/drive-chunk` strop velikosti: `MAX_CHUNK_BYTES = 16 MB` — odmítne 413 dle `content-length` (před bufferováním) i dle skutečné délky těla. Pořadí kontrol: auth → SSRF guard → velikost → fetch.
- `app/src/app/api/drive-chunk/route.test.ts` — handler testy: 403 (ne-uploader/nepřihlášen), 400 (SSRF guard — cizí cíl), 413 (velké tělo), 308 → `{done:false}`, 200 → `{done:true,id}`; `fetch` na Google mockován.

### Bug & fix (provozní, ne kód)
- **Symptom:** `pnpm run build` občas selhal `Cannot find module './651.js'` z `.next/server/webpack-runtime.js`.
- **Root cause:** zkorumpovaná/nekonzistentní `.next` cache (ne kód).
- **Fix:** `rm -rf .next` + rebuild → EXIT 0. (Když build hlásí MODULE_NOT_FOUND z `.next`, smaž cache.)

## 2026-06-28 — Fix ostrých rohů (chybějící radius token) + batch „Uložit" + velký edit dialog

### Bug & fix
- **Symptom:** notice toast (copy link), chipy a FAB měly ostré rohy.
- **Root cause:** `globals.css` `@theme` nedefinoval `--radius-pills`/`--radius-full` → `rounded-[var(--radius-pills)]` spadlo na `0`.
- **Fix:** doplněny `--radius-pills: 9999px` a `--radius-full: 9999px` do `@theme`; pravidlo zapsáno do skillu `design-system-netflix` (Border Radius). Chipy = `--radius-sm` (jemně zaoblené).

### Nové funkce / změny
- `MediaEditPanel` `expanded` (lightbox edit dialog): větší responzivní okno (`h-[80svh]`, šířka 92vw→420px→30svw, scroll-y), všech 6 kategorií najednou. Edituje se **lokálně** a uloží se vše najednou tlačítkem **Uložit** (`onSaved` → toast „Uloženo."). Štítek se přidá Enterem/čárkou okamžitě (lokální chip); temp id → reálné `tagValueId` po uložení. Žádný `router.refresh` (dřív ~5 s/štítek).
- `addMediaTagAction` vrací `tagValueId`. Kompaktní režim (admin list) má okamžité optimistické ukládání.

## 2026-06-28 — Editace/sdílení/mazání média v lightboxu + system toast

### Nové funkce
- `MediaLightbox` — pro uploadery edit/delete; navíc sdílení pro všechny role. Toolbar vpravo nahoře: **tužka** (edit — odkryje panel kategorie/štítky + Skrýt, jen uploader), **sdílet** (všechny role, copy URL do schránky), **koš** (delete, jen uploader). Edit rozhraní až po kliknutí na tužku. Edit/štítky přes `MediaEditPanel` (model + štítky, čárka + našeptávač).
- Mazání kompletní: `deleteMediaAction` maže **nejdřív z Drive, pak z DB** (aby sync nemohl re-import); `driveStorage.deleteFile` idempotentní (404 = ok).
- Sdílený odkaz `/?m=<id>`: lightbox drží URL přes `history.replaceState` (bez navigace); načtení s `?m=<id>` otevře médium (`PreviewFeed`); nepřihlášený → middleware redirect na `/signin` s `callbackUrl` vč. query (`access-response.ts`: `cb + nextUrl.search`) → po loginu zpět na lightbox.
- `SystemToast` (`components/SystemToast.tsx`) — centrovaný dole, glassmorphism, auto-dismiss. Po kopii odkazu: „Link is copied! Ready to share.".
- `MediaCardItem.editTags` (id+kategorie+hodnota) plněné pro uploadery v `(app)/page.tsx`; `DriveError` deleteFile 404→ok.

### Pozn.
- „Slug" = id média (média nemají titulek); sdílí se jen publikovaná média (preview pool).
- Share ikona ve všech lightboxech; edit/delete jen na Preview (uploader, kde jsou data).

## 2026-06-28 — Plán 012 doladění: popup, global drop, proxy chunků, fix duplikace

### Nové funkce
- `UploadModal` (`components/admin/upload-modal.tsx`) — popup obal nad `UploadWizard` (1:1 se stránkou `/upload`). FAB na `/preview` ho otevírá; Esc / klik na pozadí zavře; scroll celého overlaye (`min-h-full items-center`) → vycentrovaný když se vejde, jinak scrolluje s paddingem (zaoblené rohy vždy vidět).
- Global drag&drop na `/preview` — drop kamkoliv otevře popup s těmi soubory; během tažení overlay (low opacity, rámeček ve velikosti popupu). Window listenery jen pro uploadery, počítadlo dragenter/leave.
- `UploadDropzone`/`UploadWizard` přijímají `initialFiles` (externě dropnuté soubory).
- FAB: kruhové „+", glassmorphism + hover, `z-[60]` (nad toastem). Nav „Nahrát" (uploader-only) jako vždy-viditelná pojistka.
- Proxy route `api/drive-chunk/route.ts` — přepošle resumable chunk na Google (browser nesmí PUT přímo → CORS). SSRF guard (jen `googleapis.com/upload/`), jen Admin/Distributor, po 8 MB chuncích.

### Bug & fix
- **Symptom:** „Failed to fetch" při web uploadu.
- **Root cause:** browser→`googleapis.com/upload` přímý chunk PUT blokován CORS.
- **Fix:** chunky přes vlastní proxy `/api/drive-chunk` (`uploadResumable` mluví s proxy, `{done,id}`).
- **Symptom:** „Hotovo: vytvořeno 2" z jednoho souboru (duplikace).
- **Root cause:** dev StrictMode spustil `initialFiles` efekt 2× (guard `busy` async, nechytil); navíc drop na otevřený dropzone bublal na window (globální handler) → druhý upload.
- **Fix:** ref guard v `UploadDropzone` (dávka jen jednou) + `stopPropagation` na drop/dragover dropzone.

### Pozn.
- Web upload teď propouští bajty serverem po chuncích (proxy). Pro mnohaGB videa je úspornější „Synchronizovat z Drive".

## 2026-06-28 — Plán 012: přívětivý upload (bulk + drag&drop + wizard + našeptávač)

### Hotové tasky
- Plán 012 slice 1–4 — ověřeno (tsc 0, 305 testů zelených, build 0, lint 0). Route `/upload` přibyla.

### Nové funkce
- `splitTagInput(raw)` (`services/tag-service.ts`) — čárka jako oddělovač víc štítků (`"daddy, bear"` → 2), trim, case-insensitive dedup, ořez délky. +3 testy.
- `TagService.listValues` + singleton `tagService` + akce `listTagValuesAction` — zdroj pro našeptávač.
- Našeptávač (`<datalist>`) + čárka-split zapojené do `MediaUploadForm`, `MediaEditPanel` a wizardu; `tagSuggestions` prowiruje `media/page.tsx`.
- `lib/resumable-upload.ts` — `uploadResumable` vytaženo z `MediaUploadForm` (sdílí dropzone i form).
- `UploadDropzone` (`components/admin/upload-dropzone.tsx`) — bulk + drag&drop, validace per soubor, sekvenční resumable upload přímo na Drive, per-soubor progress, vrací `UploadedItem[]` (vč. lokálního `objectURL` náhledu).
- `UploadWizard` (`components/admin/upload-wizard.tsx`) — dvousloupcový (vlevo náhled + Prev/Next + fronta, vpravo model + 6 kategorií se štítky), „použít na všechna", „Publikovat vše" / „Uložit skryté".
- `finalizeUploadsAction(items, publish)` (`admin-actions.ts`) — bulk finalize přes sdílenou `persistMediaWithTags` (rozšířenou o `publish` flag: false → médium se po vytvoření skryje). `requireUploader`.
- Route `(app)/upload/page.tsx` — uploader-only (`requireUploader`).
- `PreviewFeed` plovoucí „+ Nahrát" FAB (`canUpload`), viditelný jen pro Admin/Distributor → `/upload`.

### Pozn.
- Bajty uploadu jdou přímo na Drive (žádné zvednutí `bodySizeLimit`). Browser→Drive chunk PUT závisí na CORS (pozn. plán 007 B) — ověřit live; fallback je „Synchronizovat z Drive".
- Bulk upload sekvenční (1 soubor po druhém) — paralelní s limitem souběhu je follow-up.

## 2026-06-28 — Plány 009/010/011 (improve execute)

### Hotové tasky
- Plán 009 — write-amplifikace relace — ověřeno (tsc/test/build/lint)
- Plán 010 — náhledy přes proxy — ověřeno (tsc/test/build/lint)
- Plán 011 — UI úpravy média (model + štítky) — ověřeno (tsc/test/build/lint)
- Sada: 302 testů zelených (75 souborů), build OK, route `/api/thumb/[token]` přibyla.

### Nové funkce
- `validateSession(principal, {touch})` + `getSessionPrincipalReadOnly()` (`src/lib/session.ts`) — read-only ověření relace bez posunu `lastActivityAt`; `validateAndTouchSession` ponechán jako zpětně kompatibilní wrapper. Stream proxy (`api/stream/[token]/route.ts`) teď používá read-only variantu.
- `DriveStorage.getThumbnail(driveFileId)` (`services/drive-connector.ts` interface+stub, `lib/google-drive-storage.ts` impl) — načte Drive `thumbnailLink` server-side a streamuje malý obrázek.
- Route `src/app/api/thumb/[token]/route.ts` — náhledová proxy se stejnou obranou jako stream (read-only session, token vázaný na uživatele, jen Approved_Media); `Cache-Control: private, max-age=3600`; neúnik `driveFileId`/Drive domén (R6.4).
- `MediaCardItem.posterUrl` + `thumbUrlFor` (`lib/media-presentation.ts`); `MediaCard`/`Hero` renderují `<img>` z `posterUrl` (oprava prázdných video karet), plný `thumbnailUrl` zůstává pro přehrávač.
- `tagService.removeValueFromMedia` (idempotentní) + akce `assignMediaModelAction`/`addMediaTagAction`/`removeMediaTagAction` (`admin-actions.ts`) + komponenta `MediaEditPanel` zapojená v `AdminMediaList` na `/admin/media` (přiřazení modelu, přidání/odebrání štítků).
- `DriveError` rozšířen o kód `not_found` (`lib/errors.ts`) pro chybějící náhled.

### Bug & fix
- **Symptom:** video karty na Preview byly prázdné; fotky tahaly plné rozlišení jako náhled.
- **Root cause:** `toCardItem` nastavoval `thumbnailUrl` na plný stream (`/api/stream/<token>`); `<img src>` neumí dekódovat video stream a u fotek stahoval celý soubor.
- **Fix:** zavedena samostatná proxy náhledů `/api/thumb/[token]` + `posterUrl`; karty/Hero používají poster, přehrávač dál plný stream.
- **Symptom (perf):** desítky–stovky zápisů do jednoho session řádku při procházení mřížky a přehrávání (Range).
- **Root cause:** `getSessionPrincipal` posouval `lastActivityAt` na každý request, i ve stream proxy.
- **Fix:** read-only varianta (`touch=false`) použitá v hot-path proxy; navigace stránek dál touchuje.

## 2026-06-24 — Diagnóza: sync nevidí ručně nahrané soubory (OAuth scope drive.file)

### Zjištění (root cause)
- Uživatel: 13 souborů na Drive (5 nahraných ručně přes Drive web), ale appka vidí jen 8. Ověřeno `auth.getTokenInfo`: token má scope **`https://www.googleapis.com/auth/drive.file`**, který dává přístup JEN k souborům vytvořeným samotnou appkou. Ručně nahrané soubory jsou pro `files.list`/`files.get` neviditelné → sync je nemůže naimportovat. Není to bug v kódu — limit OAuth scope.

### Akce vlastníka (ne kód)
- Vygenerovat refresh token se scope `https://www.googleapis.com/auth/drive` (plný; list/read/upload/delete) a vložit do `.env` `GOOGLE_REFRESH_TOKEN`. `drive.readonly` stačí jen na čtení (ne mazání/upload).
- Dokumentováno v `google-drive-storage.ts` (design note).

## 2026-06-24 — Import publikuje rovnou + publish/hide UI (diagnostika „nic se nepřidalo")

### Hotové
- Ověřeno: tsc 0, lint čistý, 292/292 testů, `pnpm run build` čistý. Autentizovaný smoke: Preview i Search zobrazují všech 8 médií; `/admin/media` 200 s tlačítky Skrýt/Publikovat.

### Diagnostika (uživatel: „synchronizace přeskočila vše, nic nového na webu")
- Drive složka má 8 souborů, **všechny už v DB** → sync správně `imported 0, skipped 8`. DB: 8× `published`, všechna **visible=true** (`publishAt` ≤ now). Tj. obsah JE na webu (ověřeno 8 karet na Preview/Search). Nejnovější přírůstky jsou fotky (web upload); nové **video v `GDRIVE_ROOT_FOLDER_ID` není** → uživatelská videa se nedostala do správné složky / web upload (CORS) je nedonesl.

### Změna (oprava workflow)
- **Import nyní publikuje rovnou** (`importFromDrive` → `status: published`, `publishAt: now`) místo `hidden`. Dřív se naimportované soubory nikde nezobrazily a nešly publikovat → teď se po synchronizaci hned objeví na webu (odpovídá očekávání uživatele). Aktualizován test.
- **Publish/Hide UI** v `AdminMediaList`: u každého média tlačítko „Publikovat" (skryté → viditelné) / „Skrýt" (viditelné → skryté), napojené na novou `setMediaPublishedAction` (wrapuje `Media_Service.publishNow`/`hide`, `requireUploader`). Tím lze řídit viditelnost importovaných i nahraných médií (řeší dlouhodobou GAP — chyběla edit/publish akce v UI).

## 2026-06-24 — Plán 007 follow-upy: extrakce metadat, sync mazání, resumable web upload (B)

### Hotové
- Ověřeno: tsc 0, lint čistý, 292/292 testů (74 souborů; +`media-service.import.test` removeMissing), `pnpm run build` čistý. Migrace `durationMs` na živé Supabase. Live smoke: Drive `files.list` vrací media metadata; resumable protokol (init→chunk PUT→id→delete) z Node OK.

### #1 — Extrakce rozměrů/délky z Drive metadat (bez stahování)
- `MediaItem.durationMs Int?` (migrace `20260624180000_media_duration`).
- `DriveFileMeta` rozšířen o `width/height/durationMs`; `listFiles` čte `imageMediaMetadata`/`videoMediaMetadata(durationMillis)` z Drive — žádné stažení souboru.
- `importFromDrive` plní width/height/durationMs z metadat (default 0/null).
- `MediaItemRecord`/`PublicMediaItem` mají volitelné `durationMs`; `MediaCard` ukazuje badge délky („m:ss") u videí.
- Pozn.: existující média (width 0) se backfillem neaktualizují (skipDuplicates) — follow-up.

### #2 — Sync mazání (soubor zmizel z Drive)
- `Media_Service.removeMissing(driveFileIds)` — smaže `MediaItem`y mimo Drive množinu; **pojistka: prázdná množina = no-op** (nemaže hromadně při chybě/špatné složce). Tagy/kolekce uklidí FK cascade. `importFromDriveAction` teď dělá import + removeMissing; tlačítko/karta přejmenovány na „Synchronizovat z Drive".

### #3 — Approach B: resumable web upload (přímo do Drive)
- `DriveStorage.createResumableSession(meta)` (+ stub) — server vydá `uploadUrl` (refresh/access token zůstává na serveru).
- `admin-actions`: `createUploadSessionAction`, `finalizeDriveUploadAction`; perzistence média+štítků vytažena do sdílené `persistMediaWithTags` (sdílí ji i `uploadMediaAction`).
- `MediaUploadForm` přepsán: file → `createSession` → **chunked `PUT` (8 MB) přímo na Drive** s progress barem → `finalize` (vytvoří Media_Item + tagy). Tím obejít 1 MB limit Server Actions i zátěž serveru. `MAX_UPLOAD_BYTES` zvednut na **10 GB**.
- **Caveat:** browser→Google chunk PUT závisí na CORS — ověřit live v prohlížeči. Když by CORS blokoval, fallback je Approach A (import z Drive složky, funguje) nebo proxovat chunky přes Route Handler.

## 2026-06-24 — Plán 007 Approach A: ingest videí z Drive složky (bez zátěže serveru)

### Hotové
- Ověřeno: tsc 0, lint čistý, 290/290 testů (74 souborů), `pnpm run build` čistý. **Živý smoke**: `listFiles` vylistoval 5 souborů v `GDRIVE_ROOT_FOLDER_ID`, všechny už v DB → import by je dedupoval (0 nových). Migrace `driveFileId @unique` aplikována na živou Supabase.

### Rozhodnutí (směr)
- Velká videa (≤10 GB) se nahrávají **přímo na Drive mimo web** (Drive web/desktop/rclone) a appka je jen **naimportuje** — bajty nejdou přes server (řeší problém „Body exceeded 1 MB limit" u Server Actions a nezatěžuje server uploadem). Web resumable upload (Approach B) zůstává jako budoucí doplněk.

### Migrace (živá Supabase, přes `prisma db execute`)
- `MediaItem.driveFileId` → `@unique` (`MediaItem_driveFileId_key`). Před migrací ověřeno 0 duplicit. Zaznamenáno v `prisma/migrations/20260624170000_media_drivefileid_unique/`.

### Nové funkce
- `DriveStorage.listFiles(folderId)` + reálná impl (`google-drive-storage.ts`) — `drive.files.list` se stránkováním (`q='<folder>' in parents and trashed=false`, `supportsAllDrives`), vrací `DriveFileMeta[]` (`driveFileId/name/mimeType/sizeBytes`). Stub vrací `auth_failed`. Nový `DriveError` kód `list_failed`.
- `Media_Service.importFromDrive(files, uploaderId?)` — vezme jen podporované typy (`classifyType`), založí `MediaItem` jako **hidden** (bez modelu, width/height 0) přes `createMany({ skipDuplicates: true })` (dedup dle `driveFileId @unique`). Vrací `{ imported, skipped }`. Test `media-service.import.test.ts` (3 případy).
- `importFromDriveAction` (`admin-actions.ts`) — `requireUploader`, vylistuje `GDRIVE_ROOT_FOLDER_ID`, importuje, revaliduje. Hláška „Naimportováno X, přeskočeno Y".
- `DriveImportButton` (`components/admin/drive-import-button.tsx`) — admin tlačítko „Importovat z Drive" na `/admin/media` (useTransition + router.refresh + hláška).

### Pozn. / follow-ups
- Importovaná média jsou `hidden` → admin doplní model/tagy a publikuje.
- Neděláno (follow-up): width/height/délka extrakce, sync mazání (MediaItem když soubor zmizí z Drive), Approach B (web resumable upload).
- `serverActions.bodySizeLimit` ZÁMĚRNĚ nezvyšováno — import to obchází.

## 2026-06-24 — Fix: video „no supported sources" (206 bez Content-Range)

### Hotové
- Ověřeno: tsc 0, lint čistý, 287/287 testů, build čistý. **Živý smoke** (dev + reálná session + reálné tokeny): video tokeny vrací `206 / content-type: video/webm` s `Content-Range` + `Accept-Ranges`; foto `206 / image/jpeg`.

### Bug & fix
- **Symptom:** `NotSupportedError: The element has no supported sources` — video nešlo přehrát (po zavedení Range podpory).
- **Root cause:** gaxios vrací `res.headers` jako **Headers objekt** (nutno `.get()`), ne plain objekt. Můj `headers["content-range"]` vracel `undefined`, takže proxy posílala **`206` bez `Content-Range`** → neplatná HTTP odpověď → prohlížeč zdroj odmítl.
- **Fix:** `google-drive-storage.streamFile` čte hlavičky robustně (`.get()` s fallbackem na bracket) a vrací `status: 206` **jen když je `Content-Range` k dispozici**, jinak `200`. Tím proxy posílá vždy validní odpověď.

## 2026-06-24 — Fix: seek (±5 s) ve videu — HTTP Range + clamp

### Hotové
- Ověřeno: tsc 0, 287/287 testů (route test mock aktualizován), `pnpm run build` čistý.

### Bug & fix
- **Symptom:** Skok ±5 s (tlačítka i ←/→) nefungoval.
- **Root cause (2 vrstvy):**
  1. **Clamp bug** v `MediaPlayer`: `max = duration || v.duration || 0` — když délka neznámá (NaN/0), `max=0` → `currentTime` se přepsal na 0 (skok vždy na začátek).
  2. **Proxy bez HTTP Range**: `/api/stream/<token>` vracela celý soubor s `200` bez `Accept-Ranges`, takže prohlížeč neuměl seekovat dál než nabufferováno.
- **Fix:**
  1. `MediaPlayer` — `skip` přepsán na stabilní `seekBy` (useCallback) s ořezem jen při známé délce (jinak `Infinity` → bez horního ořezu); klávesy ←/→ volají `seekBy`.
  2. **Range end-to-end**: `DriveStorage.streamFile(driveFileId, range?)` vrací nově `DriveStreamResult { body, status (200/206), contentLength?, contentRange? }`. Reálné úložiště propíše `Range` do Drive (`files.get` → 206 + Content-Range). Proxy čte `Range` hlavičku, vrací `Accept-Ranges: bytes`, případně `206` + `Content-Range`/`Content-Length`. Tím je video seekovatelné.
- **Pozn.:** Živý seek proti Drive ověř manuálně s reálným videem (testy mockují storage).

## 2026-06-24 — MediaPlayer: YouTube-style spodní lišta (přes video, transparentní)

### Hotové
- Ověřeno: tsc 0, lint čistý, 287/287 testů, `pnpm run build` čistý.

### Změna
- Zrušen středový cluster; veškeré ovládání sloučeno do jedné **spodní lišty přes video** ve stylu inspirace: posuv (červený) + čas vpravo nahoře v liště, pod ním řada `play/pause · −5 · +5 · hlasitost` vlevo a `fullscreen` vpravo.
- Lišta je **transparentní — bez pozadí i borderu** (žádná glass karta), full-width přes video. Čitelnost přes světlé video řeší `drop-shadow` na ikonách/textu (ne pozadí). Auto-hide zachován; klik na video + klávesové zkratky (mezerník, ←/→ ±5 s) beze změny.

## 2026-06-24 — Fix: spacing tokeny v @theme přepisovaly Tailwind scale (h-16=16px)

### Hotové
- Ověřeno: 287/287 testů, `pnpm run build` čistý.

### Bug & fix
- **Symptom:** Středové play/pause tlačítko `h-16 w-16` se renderovalo jako **16×16 px** místo 64×64. Obecně byly „čtyřkové" utility špatně (`px-4`=4px místo 16px, `gap-8`=8px místo 32px, …).
- **Root cause:** V `globals.css` byly v `@theme` definované `--spacing-4 … --spacing-148` (px). Tailwind v4 čte `--spacing-*` jako **spacing scale namespace**, takže přepsaly výchozí dynamický scale — `h-16` = `--spacing-16` = 16px (místo `calc(0.25rem*16)`=64px). Postihlo to každou utilitu s číslem z té sady {4,8,12,16,24,32,36,64,100,128,148}.
- **Fix:** Spacing škála přesunuta z `@theme` do `:root`. Arbitrary hodnoty `[var(--spacing-N)]` (Search/FilterBar/MasonryGrid…) fungují dál (proměnné v `:root`), ale Tailwind numeric utility se vrátily k výchozím (správným) hodnotám. Barvy/typografie/radius zůstávají v `@theme`.
- **Dopad:** Spacing se app-wide vrátil k zamýšleným Tailwind hodnotám (mnoho míst dostalo víc prostoru — header, mezery, tlačítka). Vizuální kontrakt tříd (snapshoty) beze změny.

## 2026-06-24 — MediaPlayer: fix kruhu, klávesové zkratky, plovoucí spodní lišta

### Hotové
- Ověřeno: tsc 0, lint čistý, 287/287 testů, `pnpm run build` čistý.

### Bug & fix
- **Symptom:** Středové play/pause tlačítko mělo „hranatý" roh i přes `rounded-full`.
- **Root cause:** Známý bug `backdrop-filter` + `border-radius` — rozmazané pozadí se ořízne na obdélník, ne na kruh.
- **Fix:** `overflow-hidden` na tlačítku → backdrop blur respektuje kruh.

### Nové funkce
- **Klávesové zkratky** v `MediaPlayer`: mezerník = play/pause, ←/→ = ±5 s. Ignoruje události z `INPUT`/`BUTTON`/contenteditable (nekoliduje s posuvníky/tlačítky), `preventDefault` proti scrollu.
- **Plovoucí spodní lišta**: místo full-width gradientu je teď odsazená od okrajů (`inset-x-4 bottom-4`), low-opacity glass (`bg-deep-space/30` + `backdrop-blur-md`), zaoblená, s jemným `color-mix(oklab, chalk-white 15%)` okrajem.

## 2026-06-24 — MediaPlayer UI dle inspirace (skip ±15, časy na okrajích)

### Hotové
- Ověřeno: tsc 0, lint čistý, 287/287 testů, `pnpm run build` čistý.

### Změna
- `MediaPlayer` ovládání předěláno dle inspirace (Daily UI #057), **bez titulku/podtitulku** (média titulky nemají):
  - **Středový cluster** `−15 / play-pause / +15` (`RotateCcw`/`RotateCw` s „15", velké play/pause v kruhu); viditelný v pauze i při aktivitě.
  - **Spodní lišta**: posuv přes celou šířku, pod ním **uplynulý čas vlevo** a **celkový čas vpravo**, vpravo ovládání (hlasitost, fullscreen).
  - Přidán `skip(±15s)` s ořezem na rozsah.
- Anti-download + bezpečnost (proxy-only, drive guard) beze změny.

## 2026-06-24 — Dedikovaný MediaPlayer (vlastní ovládání + anti-download)

### Hotové
- Ověřeno: tsc 0, 287/287 testů, lint čistý, `pnpm run build` čistý.

### Rozhodnutí (směr)
- Bez DRM, bez HLS zatím. Zůstává **MP4 přes proxy** (`/api/stream/<token>`) + friction proti stažení. HLS (segmentace) je budoucí upgrade — `MediaPlayer` je na něj připravený (přepnout zdroj na `.m3u8` + hls.js).

### Nové funkce
- **`MediaPlayer`** (`src/components/MediaPlayer.tsx`) — dedikovaný přehrávač videa s vlastním Netflix-style ovládáním (play/pause, posuv s červeným progressem, čas, hlasitost/mute, fullscreen, auto-hide lišty). Anti-download friction: `controls={false}` + vlastní UI (žádné nativní „Stáhnout"), `controlsList="nodownload noremoteplayback"`, `disablePictureInPicture`, vypnuté kontextové menu (pravý klik). Drží invariant R6.3/R6.4 — odmítne trvalý odkaz na Drive (`isDriveLink`), přehrává jen proxy URL.
- `MediaLightbox` používá `MediaPlayer` pro video; foto má `draggable={false}` + vypnuté kontextové menu.
- `MediaPlayer.test.tsx` — 4 testy (video se src na proxy; žádný nativní `controls` + `nodownload`; src bez Drive domény; Drive odkaz odmítnut).

### Odstraněno
- `Html5Player` + jeho test nahrazeny `MediaPlayer`em (Html5Player byl po přepisu lightboxu nepoužívaný; invariant R6.3/R6.6 přešel do `MediaPlayer.test`).

## 2026-06-24 — Lightbox: fit-to-viewport + rozmazané ambient pozadí (Pinterest styl)

### Hotové
- Ověřeno: tsc 0, 287/287 testů, `pnpm run build` čistý.

### Změna
- `MediaLightbox` přepsán dle inspirace: médium vycentrované v **přirozeném poměru** (`object-contain`, `max-h-[88vh] max-w-[92vw]`), za ním **rozmazaná zvětšená kopie** téhož obrázku jako ambient pozadí (`blur-2xl scale-110 opacity-30`, jen foto) + ztmavení pro kontrast. Zavírací **X vlevo nahoře** jako kulaté glass tlačítko (border `color-mix(oklab, chalk-white 15%)`). Měkký drop-shadow na médiu. Esc / klik na pozadí / tlačítko zavře, scroll lock zachován.
- Lightbox teď renderuje médium přímo (`<img>`/`<video>`) z proxy `thumbnailUrl` (URL je k dispozici hned), s defenzivní kontrolou `isDriveLink` (R6.4). Titulek/tagy v prohlížeči odebrány (čistě vizuální).

### Pozn.
- `Html5Player` tím přestal být v appce používán (zůstává jako otestovaná komponenta — drží invariant R6.3/R6.4; kandidát na úklid/reuse při příštím auditu).

## 2026-06-24 — Notice Toast: border color-mix(oklab) + drop-shadow

### Hotové
- Ověřeno: 287/287 testů (snapshot NotificationBanner aktualizován), `pnpm run build` čistý.

### Změna
- `NotificationBanner` toast: border-color přes inline style `color-mix(in oklab, var(--color-chalk-white) 15%, transparent)` (místo `chalk-white/10`), přidán měkký drop-shadow `0 8px 30px rgba(0,0,0,0.5)`. Glass pozadí + blur beze změny.
- **Skill `design-system-netflix`** — spec Notice Toast aktualizován: border = `color-mix(in oklab, chalk-white 15%, transparent)`, soft drop shadow `0 8px 30px rgba(0,0,0,0.5)`.

## 2026-06-24 — Notice Toast: glassmorphism (černé sklo místo červené)

### Hotové
- Ověřeno: 287/287 testů (snapshot NotificationBanner aktualizován), `pnpm run build` čistý.

### Změna
- `NotificationBanner` toast: pozadí z netflix-red → **glassmorphism** — poloprůhledná `deep-space/60` + `backdrop-blur-md` + jemný okraj `chalk-white/10` (bez stínu). Megaphone ikona dostala netflix-red akcent, X v silver→white. Padding sjednocen na `px-4 py-3` (12px 16px), odsazení `bottom-6 right-6` (24px) beze změny.
- **Skill `design-system-netflix`** — spec Notice Toast přepsán: pozadí = glassmorphism (translucent Deep Space ~60% + backdrop blur + 1px chalk-white border ~10%, bez stínu), text chalk-white, akcent Megaphone netflix-red.

## 2026-06-24 — Notice Toast: spec do design systému + červené pozadí

### Hotové
- Ověřeno: 287/287 testů (snapshot NotificationBanner aktualizován), `pnpm run build` čistý.

### Změna
- **Skill `design-system-netflix`** — přidána komponenta **Notice Toast**: pozice fixed v pravém dolním rohu s 24px odsazením od spodního/pravého okraje, pozadí **Netflix Red (#e50914)**, text/ikony Chalk White, padding 12px 16px, radius 16px, max šířka 384px, obsah Megaphone + zpráva + zavírací X, vstupní fade+slide.
- **`NotificationBanner`** sladěn se spec: pozadí `netflix-red` (dřív graphite), Megaphone a X v chalk-white, odsazení `bottom-6 right-6` (24px), padding `px-4 py-3`.

## 2026-06-24 — Admin oznámení jako toast (pravý dolní roh)

### Hotové
- Ověřeno: 287/287 testů (snapshot NotificationBanner aktualizován), `pnpm run build` čistý.

### Změna
- `NotificationBanner` (admin notice, R17) předělán z horního full-width banneru na **plovoucí toast v pravém dolním rohu**: `fixed bottom-4 right-4 z-50`, `max-w-sm`, zaoblená karta (`rounded-2xl`, `bg-graphite` + border `charcoal`), akcentní `Megaphone` v netflix-red, text, zavírací `X`. `role=status`/`aria-live=polite` zachováno, dismiss + reset při změně textu beze změny chování.
- Přidána vstupní animace `@keyframes toast-in` (fade + posun zdola) do `globals.css`.
- Render zůstává v `(app)/layout.tsx` (fixed pozice → nezávislé na umístění v DOM). Akcent ponechán jako `text-[color:var(--color-netflix-red)]`, aby prošel token test.

## 2026-06-24 — Zaoblený design systém (žádné hranaté rohy)

### Hotové
- Ověřeno: 287/287 testů, `pnpm run build` čistý. Snapshot MediaCard beze změny (test drží názvy tříd `rounded-2xl`, ne px hodnoty).

### Změna
- **Skill `design-system-netflix`** sladěn na zaoblený systém: prozaické specifikace komponent (Hero CTA / Sign-In / Translucent / Email input → `Radius: 16px`, Promotional Banner → 16px), Do/Don't pravidla přepsána („používej konzistentní zaoblení 16px tlačítka/inputy, 20px+ karty; nikdy ostré/hranaté rohy"), opraveny i 4px zmínky v Example Prompts. (Tabulka Border Radius už rounded hodnoty měla — nesoulad byl v textu a v implementaci.)
- **Implementace tokenů** (`app/src/app/globals.css` `@theme`) zvětšena z hranatých na zaoblené:
  - `--radius-sm`: 2px → **12px** (chips, badges, nav položky, malé controly)
  - `--radius-lg`: 8px → **16px** (tlačítka, inputy, fieldset)
  - `--radius-2xl`: 16px → **20px** (karty, média, přehrávač)
- **Komponenty** se zaoblily automaticky — všechny používají token-driven třídy (`rounded-sm` / `rounded-[var(--radius-lg)]` / `rounded-2xl` / `rounded-[var(--radius-2xl)]`), `rounded-full` zůstává (avatary, play overlay). Žádná komponenta neměla off-token nebo px-hardcoded radius.

## 2026-06-24 — Fix: duplicitní React klíče v MasonryGrid

### Hotové
- Ověřeno: tsc 0, 287/287 testů, `pnpm run build` čistý.

### Bug & fix
- **Symptom:** Console warning „Encountered two children with the same key, `<uuid>`" v `MasonryGrid` (Preview).
- **Root cause:** V dev StrictMode se efekty spouští dvakrát; reset efekt synchronně nuloží `loadingRef=false`, takže dvě souběžná `load()` čtou stejný `cursor` (0) a appendnou tutéž první dávku → stejné `item.id` dvakrát → duplicitní klíče.
- **Fix:** Append v `load()` dedupuje podle `id` (Set již zobrazených) — přidá jen nové položky. Defenzivní i vůči případným duplicitám ve zdroji dat. `cursorRef` se chová stejně (obě načtení nastaví stejný `nextCursor`).

## 2026-06-23 — Navigace: zrušen aside, full-width header (3 sloupce + eliptický gradient)

### Hotové
- Ověřeno: tsc 0, 287/287 testů, `pnpm run build` čistý. Autentizovaný smoke (dev + vykovaná session): `/`, `/search`, `/models`, `/collections` → 200, v HTML logo/„Odhlásit se"/`<header>`/radial-gradient, žádné chyby v logu.

### Změna (dle zadání)
- **Zrušen levý aside (`SideNav`)** — smazán `components/app-shell/side-nav.tsx` + jeho export z `index.ts`.
- **`TopNav` přepsán na full-width sticky header** se 3 sloupci (CSS grid `grid-cols-3`):
  - vlevo logo `MMMRED` (netflix-red),
  - uprostřed hlavní navigace (ikona + label, aktivní = bílá + červený spodní pruh),
  - vpravo profil (`CircleUserRound` + jméno) a tlačítko „Odhlásit se" (`LogOut`, `signOutAction`).
  - Odstraněna tlačítka zpět/vpřed (nahrazena profilem/odhlášením).
- **Eliptický gradient pozadí headeru** — `radial-gradient(ellipse 50% 100% at 50% 0%, …)` s 8 stopy a hladkým dojezdem „doztracena". Gradient je ve VLASTNÍ vrstvě (`HEADER_FADE_HEIGHT` = 240px), která přesahuje pod obsah headeru → dlouhý vertikální prostor na plynulý fade (jinak se „dusil" v nízkém boxu); `pointer-events-none`, takže neblokuje kliky. Vodorovně splývá k okrajům (velký fade po stranách), svisle dojede do nuly na spodní hraně vrstvy. Řídí `HEADER_GRADIENT` + `HEADER_FADE_HEIGHT` v `top-nav.tsx`.
- **Rohové blur + fade vrstvy** (`CORNER_FADE_LEFT/RIGHT`, `CORNER_FADE_HEIGHT` = 200px) — protože centrální gradient po stranách splývá, levý/pravý roh dostal vlastní jemný `backdrop-blur-[2px]` + tmavý radiální fade pro čitelnost loga (vlevo) a profilu/„Odhlásit se" (vpravo). `maskImage`/`WebkitMaskImage` nechá blur i tmu plynule zmizet do středu a dolů (žádný viditelný šev). `pointer-events-none`.
- **Settings odebrán z nav** (`NAV_ITEMS`) — profilová ikona `CircleUserRound` je teď `Link` na `/settings` s hover/focus efektem (silver → chalk-white). `/settings` stránka i Page_Visibility sekce zůstávají.
- **`AppShell`** přestavěn z `flex` (aside + obsah) na vertikální stack: header nahoře + `main` přes celou šířku (centrováno `max-w-[1280px]`). Navigaci si filtruje klientský `TopNav` z plain dat (`role`/`hiddenSections`), aby ikony nepřešly přes RSC hranici.

## 2026-06-23 — Média bez titulku/popisu (čistě vizuální prohlížení)

### Hotové
- Ověřeno: tsc 0, 287/287 testů (1 snapshot MediaCard aktualizován), `pnpm run build` čistý.

### Změna chování (dle upřesnění uživatele)
- Média nemají zobrazovaný titulek ani popis — jde čistě o prohlížení.
  - `Hero` — odstraněn velký `<h2>` titulek (zůstává malý typ Video/Foto, štítky a CTA „Watch").
  - `MediaLightbox` — odstraněn `<h2>` titulek; dialog má generický `aria-label="Přehrávač média"`, foto `alt=""` (dekorativní). Štítky zachovány.
  - `MediaCard` — `aria-label`/`alt` už není „Médium <id>", ale generické „Video"/„Fotografie" (přístupnost bez titulku).
- Model zůstává jen jako **interní seskupení do alb/karuselů** (`PreviewFeed.groupByModel`), ne jako titulek média. Pole `MediaCardItem.title` se nadále plní jménem modelu, ale slouží jen ke grupování, nikde se nezobrazuje jako titulek.

## 2026-06-23 — Model profil při nahrávání NEPOVINNÝ (médium bez modelu)

### Hotové
- Ověřeno: prisma generate OK, tsc 0, 287/287 testů, `pnpm run build` čistý. Migrace aplikována na živou Supabase.

### Změna chování (dle upřesnění uživatele)
- Přiřazení média k profilu modelu je **nepovinné**. Médium může existovat samostatně. Je-li model přiřazen, jeho stránka slouží jako jedno „album" (galerie). Na Preview se alba zobrazují jako karusely podle modelu; **média bez modelu netvoří karusel** (jsou jen v mřížce „Procházet vše").

### Migrace (živá Supabase, přes `prisma db execute`)
- `MediaItem.modelId` → `NULL` povoleno; FK `MediaItem_modelId_fkey` změněn z `ON DELETE CASCADE` na `ON DELETE SET NULL` (smazání modelu už nesmaže jeho média, jen je odpojí). Zaznamenáno v `prisma/migrations/20260623160000_optional_model/`.

### Dotčené soubory
- `prisma/schema.prisma` — `modelId String?`, `model ModelProfile?` + `onDelete: SetNull`.
- `services/drive-connector.ts` — `MediaItemRecord.modelId` a `PublicMediaItem.modelId` rozšířeny na `string | null`.
- `services/media-service.ts` — `CreateMediaInput.modelId: string | null`.
- `admin/admin-actions.ts` — `UploadMediaInput.modelId: string | null` (jen prochází do createMediaItem).
- `components/admin/media-upload-form.tsx` — select „Profil modelu (nepovinné)", default „— Bez modelu —", odstraněna povinná validace; prázdný výběr → `null`.
- `admin/media/page.tsx` — label média `m.model?.name ?? "Bez modelu"`.
- `(app)/page.tsx` + `(app)/search/page.tsx` — `title: row.model?.name` (model může být null).
- `components/PreviewFeed.tsx` — `groupByModel` přeskakuje média bez modelu (žádné album „Ostatní").

### Pozn.
- Médium bez modelu má v přehrávači/kartě fallback titulek „Médium <id>".
- `directUrl` do datasource stále nepřidáno (DEPS-02) — migrace nadále aplikujeme přes `prisma db execute`, ne `prisma migrate`.

## 2026-06-23 — Fix: 6 fatal errors po přihlášení (ikony přes RSC hranici)

### Hotové
- Ověřeno: tsc 0, 287/287 testů, `pnpm run build` čistý. Reprodukováno i opraveno přes dev server s vykovanou session (Admin) — `/`, `/search`, `/models`, `/collections`, `/settings`, `/admin`, `/paywall` všechny vrací 200 bez chyb (předtím `GET / 500`).

### Bug & fix (hlavní — 6 fatal errors)
- **Symptom:** Po přihlášení `GET / 500`; v server logu 6× `Error: Functions cannot be passed directly to Client Components … {$$typeof: …, render: function Clapperboard/Search/Users/Bookmark/Settings/Shield}`.
- **Root cause:** `AppShell` (Server Component) volal `buildNavItems()` a předával pole `NavItem` do klientského `SideNav`. Každá položka nese `icon` = Lucide **komponenta (funkce)** — funkce/komponenty nelze předat přes hranici Server→Client. Zavlečeno 1. vlnou ikon (přidání `NavItem.icon`); `build` to nechytil, protože chyba vzniká až při autentizovaném SSR renderu (statická analýza ji neodhalí).
- **Fix:** Filtraci navigace přesunuto do klientského `SideNav` — `AppShell` předává jen plain data (`role`, `hiddenSections`), `SideNav` si sám zavolá `buildNavItems` (ikony zůstanou celé na klientu). `SideNavProps` změněno z `items` na `role`+`hiddenSections`.

### Bug & fix (vedlejší — latentní, login distributora)
- **Symptom:** Distributor by se neudržel přihlášený (redirect na signin).
- **Root cause:** `isValidPrincipal` (`access-context.ts`) přijímal jen role `Admin|User` — role `Distributor` (přidaná později) způsobila zamítnutí podepsaného cookie → neautentizováno.
- **Fix:** Allowlist rozšířen o `Distributor`.

## 2026-06-23 — UI/UX: dokončení (collections přehrávač + ikony prázdných stavů)

### Hotové
- Ověřeno: tsc exit 0, 287/287 testů, `pnpm run build` čistý. Footer dle rozhodnutí uživatele nebude.

### Nové funkce
- **`CollectionGallery`** (`src/components/CollectionGallery.tsx`) — klient. Mřížka médií kolekce s napojeným `MediaLightbox` (výběr karty přehraje, R6.6) + formulář „Odebrat" napojený na server action předanou propem (`onRemove`). Detail kolekce (`collections/[id]/page.tsx`) ji používá místo statických nehratelných karet → kolekce jsou konzistentní se zbytkem appky.
- Ikony prázdných/CTA stavů (dokončení Lucide):
  - Collections list: `Library` (prázdný stav), `Plus` (Vytvořit), `Trash2` (Smazat).
  - Detail kolekce: `FolderX` (nedostupná), `FolderOpen` (prázdná), `X` (Odebrat).
  - Detail modelu: `UserX` (model nenalezen).
  - Paywall: `Lock` nad nadpisem.

### Pozn.
- Server action `removeMediaAction` se předává z server komponenty do klientského `CollectionGallery` jako prop (validní RSC pattern), takže odebrání funguje i jako přímý `form action`.

## 2026-06-23 — UI/UX: přehrávač (lightbox), karusely na Preview

### Hotové
- Ověřeno: tsc exit 0, 287/287 testů, `pnpm run build` čistý (warningy jen v test souborech).

### Nové funkce
- **`MediaLightbox`** (`src/components/MediaLightbox.tsx`) — celoobrazovkový přehrávač přes `Html5Player` (proxy Streaming_URL, R6.6). Esc / klik na pozadí / tlačítko zavře, zamyká scroll, `role=dialog`+`aria-modal`. Stav (které médium) drží rodič.
- **`Carousel`** (`src/components/Carousel.tsx`) — Netflix-style horizontální řada `MediaCard` s plynulým scrollem a šipkami (`ChevronLeft/Right`), skrytý scrollbar, snap. Výběr karty → `onSelect`.
- **`BrowsableGrid`** (`src/components/BrowsableGrid.tsx`) — sjednocuje `MasonryGrid` + `MediaLightbox` (výběr karty otevře přehrávač). Nahradil opakovaný `poolLoader`+`MasonryGrid` pattern v Search i detailu modelu.
- **`PreviewFeed`** (`src/components/PreviewFeed.tsx`) — kompletní Preview layout: `Hero` (featured) + karusely seskupené podle modelu (`groupByModel`, zachované pořadí fondu) + masonry „Procházet vše". Vše sdílí jeden lightbox; prázdný fond → prázdný stav.
- `Hero` rozšířen o `onWatch` callback → „Watch" otevře sdílený přehrávač (fallback: odkaz na proxy stream, když callback chybí).
- Drátování: `(app)/page.tsx` → `PreviewFeed`; `ModelDetail` a `SearchBrowser` → `BrowsableGrid`. Smazán nepoužívaný `PreviewBoard.tsx`.

### Bug & fix
- **Symptom:** `pnpm run build` selhal — `UnhandledSchemeError: Reading from "node:crypto"` s import trace `drive-connector.ts → Html5Player → MediaLightbox → PreviewFeed`.
- **Root cause:** `Html5Player` (klient) importoval runtime konstantu `DRIVE_DOMAINS` z `@/services/drive-connector`, který používá `node:crypto`. Dokud byl `Html5Player` jen v testech, do klient bundlu se nedostal; napojením do `MediaLightbox`/`PreviewFeed` se serverový modul zatáhl do prohlížeče.
- **Fix:** `DRIVE_DOMAINS` vyčleněn do klient-safe `src/lib/drive-domains.ts`; `drive-connector` ho re-exportuje (zpětná kompatibilita testů), `Html5Player` importuje z nového modulu. `PublicMediaItem` zůstává type-only import (mazán při kompilaci).

## 2026-06-23 — UI/UX: Lucide ikony (zbytek) + Hero na Preview

### Hotové
- Ověřeno: tsc exit 0, 287/287 testů, `pnpm run build` čistý (jen pre-existing warningy v test souborech).

### Nové funkce
- **Lucide 3. vlna (drobné prázdné stavy):**
  - `models/page.tsx` prázdný stav → ikona `Users` (slate).
  - `ModelDetail.tsx` prázdná galerie → ikona `ImageOff` (slate).
  - `page-visibility-toggles.tsx` → `Eye` (viditelná, netflix-red) / `EyeOff` (skrytá, ash) u stavu sekce.
- **Hero banner** (`src/components/Hero.tsx`) — kinematický full-bleed banner na Preview: ztlumený backdrop přes proxy `Streaming_URL` (`item.thumbnailUrl`), velký titulek (`--text-heading` 56px), typ + štítky, červené CTA „Watch" (lucide `Play`). Prezentační/server-safe, žádný stav.
- `(app)/page.tsx` — nejnovější Approved_Media = featured hero, zbytek → `PreviewBoard`. Prázdný fond → původní hlavička + prázdný stav PreviewBoardu (bez hera).

## 2026-06-23 — UI/UX: Lucide ikony (1. vlna) + backlog

### Hotové
- Přidán `lucide-react@1.21`. Ikony nasazeny do hlavního chrome (ověřeno: tsc/build/lint, 287/287, 2 snapshoty aktualizovány).

### Nové funkce
- SideNav: ikona u každé položky (`Clapperboard/Search/Users/Bookmark/Settings/Shield`); `NavItem.icon` přidán do `nav-items.ts`.
- TopNav: `ChevronLeft/ChevronRight` (nahradily ruční SVG) + `LogOut` u odhlášení.
- `NotificationBanner`: `Megaphone` + `X` (zavřít) místo ručního SVG.
- `MediaCard`: play overlay přes lucide `Play` místo ručního trojúhelníku.
- `AdminMediaList`: `Trash2` u tlačítka Smazat.
- Admin rozcestník: ikona u každé sekce (`Film/Users/UserCog/EyeOff/Megaphone`, červený akcent).
- Ikony dědí barvu přes `currentColor` → respektují Netflix tokeny.

### Backlog / rozhodnuto, neimplementováno
- **GAP-1 (edit média):** potvrzeno, že **Distributor edituje vše** (tagy/plán/skrytí/publikace), maže jen vlastní. Akce `schedulePublish/publishNow/hide` v Media_Service existují, ale nejsou napojené do UI/akcí — čeká na slice „edit média".
- **Lucide 2. vlna — HOTOVO 2026-06-23:** auth (`LogIn/UserPlus`), Settings (`Save/KeyRound/Send`), upload (`Upload/Plus`, chip remove `X`), model form (`UserPlus/Save`), oznámení (`Megaphone/BellOff`), FilterBar clear (`X`), prázdný Search (`SearchX`). `Button` dostal `gap-2` (ikona+text). Ověřeno (tsc/build/lint, 287/287).
- **Lucide zbytek (drobné, TODO):** prázdné stavy Models/ModelDetail, page-visibility toggles.

## 2026-06-23 — improve branch audit (feature distributor) + SEC-1 fix

### Audit
- Read-only audit změn feature „distributor" (bez gitu). Autorizace solidní (server re-check v `deleteMediaAction`, `requireUploader`, anti-lockout u rolí, FK SET NULL).

### Bug & fix
- **SEC-1 (introduced):** `setUserRoleAction` důvěřoval `role` z klienta (jen Prisma enum jako pojistka).
- **Fix:** explicitní allowlist `User|Distributor|Admin` na hranici důvěry před zápisem. Ověřeno (tsc, 287/287).

### Otevřené nálezy
- **GAP-1 (pre-existing, Med):** chybí akce pro edit/plánování/skrytí média (`schedulePublish`/`publishNow`/`hide` v Media_Service existují, ale nic je nevolá) → „distributor může editovat" je zatím nominální pro všechny role. Kandidát na další slice.
- **OBS-1 (Low):** `/admin/media` bez stránkování (`take:50`).

## 2026-06-23 — Feature: role „distributor" + správa rolí v dashboardu

### Hotové
- Ověřeno: prisma validate/generate OK, tsc/build čisté, lint bez nových chyb, 287/287 testů.

### Migrace (živá Supabase, přes `prisma db execute`)
- `Role` enum rozšířen o `Distributor` (`ALTER TYPE ... ADD VALUE`).
- `MediaItem.uploaderId TEXT NULL` + FK na `User(id)` `ON DELETE SET NULL` + index. Legacy média mají `uploaderId=null` → smí je mazat jen Admin.
- Migrace zaznamenána v `app/prisma/migrations/20260623120000_distributor_role_and_uploader/`. Schema + Prisma client zregenerovány.

### Nové funkce
- `app/src/lib/permissions.ts` — čisté `canUpload` (Admin/Distributor), `canManageAdmin` (jen Admin), `canDeleteMedia` (Admin vše; Distributor jen vlastní `uploaderId`; User nic).
- `decideAccess` (`access.ts`) — Distributor smí `/admin`, `/admin/media`, `/admin/models` (+/api); Admin-only zůstává users/pages/notifications.
- `requireUploader()` (`session.ts`) — guard Admin|Distributor pro media/models stránky a akce.
- `media-service.createMediaItem` přijímá `uploaderId`; `uploadMediaAction` ho plní z přihlášeného principála (`requireUploader`).
- Admin akce: `setUserRoleAction` (jen Admin, nelze měnit vlastní roli — anti-lockout), `deleteMediaAction` (ownership check přes `canDeleteMedia`). `createModelProfileAction` nově i pro Distributora.
- UI: `UsersOverview` má `<select>` role (User/Distributor/Admin), vlastní řádek je disabled; Admin rozcestník filtruje sekce dle role; SideNav ukazuje Admin i Distributorovi (User ne).
- Testy: `permissions.test.ts`, `access.distributor.test.ts` + doplněn `uploaderId` do fake fixtures.

### Follow-up (NEděláno)
- ~~Chybí UI seznam médií s tlačítkem smazat~~ → **DODĚLÁNO 2026-06-23**: `app/src/components/admin/media-list.tsx` (`AdminMediaList`) + napojení na `/admin/media`. Seznam posledních 50 médií; tlačítko Smazat aktivní jen když `canDelete` (server přes `canDeleteMedia`), akce `deleteMediaAction` autorizuje znovu. Ověřeno (tsc/build, 287/287).
- Spec dokumenty (requirements/design) zatím neaktualizovány o tuto roli — feature vznikla po dokončení specu.

## 2026-06-23 — advisor-plans/006 Reálné Google Drive úložiště (spike)

### Hotové tasky
- advisor-plans/006 — ověřeno (prisma validate OK, tsc/build čisté, 279/279 hermetických testů)

### Rozhodnutí spike
- **OAuth refresh token** (ne Service Account) — `.env` už má `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` (scope `drive.file`); design.md zmiňoval Service Account, ale realita prostředí je OAuth. Přepnutí = jen jiné sestavení `auth` klienta.

### Nové funkce
- `app/src/lib/google-drive-storage.ts` (`createGoogleDriveStorage`) — reálná `DriveStorage` přes `googleapis`: `authenticate` (getAccessToken), `upload` (files.create do `GDRIVE_ROOT_FOLDER_ID`, timeout 120 s → `timeout`), `streamFile` (files.get alt=media → `Readable.toWeb`), `deleteFile`. Nikdy nevyhazuje — mapuje na `DriveError` (auth_failed/upload_failed/timeout).
- `app/src/lib/drive.ts` — výběr reálné vs stub přes `DRIVE_STORAGE=real` a `NODE_ENV !== "test"`; default stub → testy zůstávají hermetické.
- Závislost `googleapis@173`.

### Pozn. / odchylky
- `directUrl` do Prisma datasource **nepřidáno** — `env("DIRECT_URL")` bez nastavené hodnoty rozbije `prisma validate`/`generate`. Ponecháno jako komentář ve schématu + klíč v `.env.example`; doplní se s první migrací (DEPS-02).
- Follow-ups (NEděláno): HTTP Range pro přetáčení videa, resumable upload, extrakce width/height.
- **Manuální smoke** (až bude `DRIVE_STORAGE=real` + creds): upload malého souboru přes admin → vznikne `MediaItem` + soubor na Drive → `GET /api/stream/<token>` vrátí bajty. Do suity se živý síťový test nepřidává.

## 2026-06-23 — advisor-plans/005 Rychlá test suite

### Hotové tasky
- advisor-plans/005 — ověřeno (default `pnpm test` ~45s→~15,6s, 279/279)

### Nové funkce
- `password.property-10.test.ts` — počet iterací řízen `PBT_FULL`: default 15 (rychlý loop ~6 s místo ~42 s), `PBT_FULL=1` → 100 (plný proof). Assertions beze změny.
- `package.json` skript `test:ci` = `PBT_FULL=1 vitest --run` (CI spustí plný proof; default loop zůstává rychlý).

## 2026-06-23 — advisor-plans/004 Atomický upload média

### Hotové tasky
- advisor-plans/004 — ověřeno (tsc/lint/build čisté, 279/279 testů)

### Oprava (bug & fix)
- **Symptom:** `uploadMediaAction` při výjimce ve štítkovací smyčce smazal soubor z Drive, ale NE už vytvořený `MediaItem` → osiřelý záznam ukazující na smazaný soubor; chyby `upsertValue`/`assignValueToMedia` se navíc tiše polykaly (`if (isOk) …` bez else).
- **Root cause:** media-create + tagging běžely mimo transakci; tag větev bez ošetření chyb.
- **Fix:** vytvoření média i štítkování obaleno do jedné `prisma.$transaction(async tx => …)`; chyba štítku vyhodí `UploadAbort` → rollback (žádný osiřelý `MediaItem`) + kompenzační `deleteFile` na Drive + vrácení hlášky. `app/tests/upload.integration.test.ts` rozšířen na tx-aware fake Prisma a případ chyby štítku.
- **ponytail:** `tx` přetypován na `PrismaClient` (factory volají jen model delegáty) — širší typování by si vyžádalo změnu signatur všech služeb.

## 2026-06-23 — advisor-plans/003 Streaming proxy session binding

### Hotové tasky
- advisor-plans/003 — ověřeno (tsc čistý, build OK, 278/278 testů)

### Nové funkce / oprava
- `app/src/app/api/stream/[token]/route.ts` — route si nově vynucuje vlastní obranu (middleware ji nehlídá, protože token obsahuje tečku a matcher dotted-paths vylučuje): (1) vyžaduje přihlášenou relaci (jinak 401), (2) ověří `token.userId === principal.userId` (jinak 403 — token není přenosný, R6.2), (3) streamuje jen `isApproved` médium (skryté/naplánované → 404, R6.4). Opraven zavádějící doc-komentář „auth zajišťuje middleware".
- `app/src/app/api/stream/[token]/route.test.ts` — 6 handler testů (401/403/410/401/404/200 + ověření, že se nikdy neodhalí `driveFileId`).

## 2026-06-23 — advisor-plans/002 DB-backed sessions + revokace

### Hotové tasky
- advisor-plans/002 — ověřeno (tsc čistý, build OK middleware 35.6 kB bez Prisma, 272/272 testů)

### Nové funkce
- `SessionPrincipal.sessionId` (`app/src/lib/access-context.ts`) — ID DB session záznamu nesené v podepsaném cookie + kontrola v `isValidPrincipal`.
- `validateAndTouchSession()` (`app/src/lib/session.ts`) — DB-backed ověření: re-čte session + živý stav účtu; `null` při chybějící session (revokace/odhlášení), zablokovaném účtu (R15.3/15.4) nebo vypršelé 30min inaktivitě (záznam smaže); jinak posune `lastActivityAt` (rolling inaktivita, R1.6/R2.3) a vrátí živé role/předplatné. `getSessionPrincipal()` ji volá → automaticky chrání všechny `requireSession`/`requireAdmin` Server Components i stream route.
- `signOutAction` nově maže i DB session záznam (`app/src/app/auth-actions.ts`), login do principála vkládá `sessionId`.
- `app/src/lib/session.test.ts` — 4 testy (revokace / blokace / expirace+smazání / refresh + oprava staleness).

### Pozn. (vědomá odchylka od plánu)
- Plán navrhoval DB validaci v `access-guard.ts`. Umístěna místo toho do `session.ts:getSessionPrincipal`, protože to je skutečná hot path chráněných stránek (Server Components volají `requireSession`/`requireAdmin`, ne `enforceAccess`). Stejný efekt, méně kódu, pokrývá i stream route (plán 003).
- Edge middleware zůstává cookie-only (Prisma se nesmí do Edge bundle); revokace se projeví na dalším Node požadavku (render stránky / API) — splňuje „do 5 s / další požadavek".
- Vedlejší přínos: oprava staleness role/předplatného (audit SEC-03) — čtou se živě z DB.

## 2026-06-23 — advisor-plans/001 Secret hygiene

### Hotové tasky
- advisor-plans/001 Secret hygiene — ověřeno (tsc čistý, 268/268 testů, lint 0 errors)

### Nové funkce
- `app/.env.example` — onboarding/bezpečnostní referenční soubor (jen názvy klíčů, žádné hodnoty); přidány `DIRECT_URL` a `DRIVE_STORAGE` pro plán 006.
- `app/src/lib/env.ts` (`assertProductionSecrets`) — startovní pojistka: v produkci selže fail-fast při chybějícím/slabém (<32 zn.)/placeholder podpisovém klíči; v dev/test no-op.
- `app/src/instrumentation.ts` — Next startovní hook volá `assertProductionSecrets` (jinak by guard byl mrtvý kód).
- `app/src/lib/env.test.ts` — 3 unit testy guardu.

### Bug & fix
- **Symptom:** `app/.env` definoval `DATABASE_URL` dvakrát; první `DATABASE_URL="${SUPABASE_CONNECTION_STRING}"` (interpolace) nefunguje — dotenv neexpanduje `${...}` a heslo obsahuje neenkódované `?`/`%`, což rozbije Prisma parser.
- **Root cause:** Leftover interpolovaná verze nad správnou URL-enkódovanou; druhý (funkční) řádek ji jen někdy přebil.
- **Fix:** Odstraněn interpolovaný řádek + jeho komentář; ponechán URL-enkódovaný `DATABASE_URL` (`grep -c '^DATABASE_URL=' .env` → 1).

### Pozn.
- Audit-finding SEC-02 (placeholder HMAC secrets) byl **mylný** — `SESSION_COOKIE_SECRET`/`STREAMING_TOKEN_SECRET` už jsou silné náhodné base64 hodnoty; regenerace není nutná. Rotace reálných third-party tajemství (Supabase service-role, Google, Telegram) zůstává jako akce vlastníka.
- ponytail: vynechány per-call placeholder kontroly v access-context/drive-connector — pokrývá je jediná startovní pojistka.

## 2026-06-23 — mmmred-streaming-dashboard (Unit testy validačních jader)

### Hotové tasky
- 3.2 Napsat unit testy validačních jader — ověřeno (`pnpm test` 68 souborů / 265 testů green; `pnpm exec tsc --noEmit` exit 0)

### Nové funkce
- `app/src/lib/validation.test.ts` — fokusované unit testy hraničních délek pro čisté validátory v `app/src/lib/validation.ts`. Pokrývá přesné meze: e-mail 5/254 + formát `local@domain` (odmítnutí dvojitého @, chybějícího @, domény bez tečky, bílých znaků); heslo 8/128; jméno modelu 0/1/100/101; bio 0/1000/1001 (prázdné povoleno); text oznámení 0/1/500/501; název kolekce 1/100; pole profilu 1/255/256; `isValidUrl` (prázdné / platná https / holý řetězec bez schématu). Délky se odvozují z exportovaných `LENGTH_BOUNDS`. Pokrývá R2.7, R4.2, R4.3, R17.3, R18.2.

## 2026-06-23 — mmmred-streaming-dashboard (Integrační testy — mock Drive / Stripe)

### Hotové tasky
- 21.4 Napsat integrační testy (mock Google Drive / Stripe) — ověřeno (`pnpm test` 67 souborů / 234 testů green; `pnpm exec tsc --noEmit` exit 0)

### Nové funkce
- `tests/upload.integration.test.ts` — integrační testy server akce `uploadMediaAction` nad konfigurovatelným fake `DriveStorage` (`@/lib/drive`) a in-memory fake Prisma (`@/lib/prisma`); mockuje se i `requireAdmin` a `revalidatePath`. Scénáře: upload ÚSPĚCH → Media_Item s `driveFileId` (R5.1); selhání autentizace (`auth_failed`) → popisná chyba, žádný osiřelý záznam (R5.4/R5.6); timeout 120 s (`timeout`, simulován výsledkem fake) → popisná chyba, žádný osiřelý záznam (R5.4); rollback při selhané perzistenci → kompenzační `deleteFile` a žádný osiřelý záznam (R5.4).
- `tests/webhook.integration.test.ts` — integrační testy `Subscription_Service.processWebhook` nad in-memory fake Prisma a sdíleným HMAC tajemstvím (mock Stripe). Scénáře: správně podepsaný aktivační webhook → předplatné aktivní + audit accepted (R20.3); deaktivační webhook → neaktivní (R20.4); chybně podepsaný i nepodepsaný webhook → odmítnut, žádná změna stavu, audit `accepted=false` (R20.5).

## 2026-06-23 — mmmred-streaming-dashboard (Propojení — route handlery a server actions)

### Hotové tasky
- 21.2 Vytvořit route handlery a server actions pro služby — ověřeno (`pnpm exec tsc --noEmit` exit 0; `pnpm run build` exit 0, 17 stránek; `pnpm test` 65 souborů / 226 testů green)

### Nové funkce
- `src/lib/session.ts` (Node) — serverová relační vrstva nad podepsaným cookie: `getSessionPrincipal`, `requireSession(callbackUrl)`, `requireAdmin`, `establishSession` (vydá cookie po loginu, R2.5), `clearSession` (odhlášení). Doba života cookie 30 min (R2.3).
- `src/lib/drive.ts` (Node) — singletony `driveStorage` (stub) a líně inicializovaný `getDriveConnector()` (čte `STREAMING_TOKEN_SECRET`).
- `src/lib/media-presentation.ts` (Node) — `streamingUrlFor(mediaId, userId)` vydá proxy `/api/stream/<token>` (R6.1) a `toCardItem(...)` serializuje Media_Item do `MediaCardItem` bez `driveFileId` (R6.3/R6.4).
- Auth server actions `src/app/auth-actions.ts` — `signInAction` / `signUpAction` (po úspěchu vydá session cookie a redirect na `callbackUrl`, R2.5/R21.4), `signOutAction` (smaže cookie). Veřejné stránky `src/app/signin`, `src/app/signup`, `src/app/paywall` + klientský `AuthForm` (`useActionState`). Odhlášení napojeno v `TopNav`.
- Streamovací proxy `src/app/api/stream/[token]/route.ts` — ověří token (`verifyStreamingToken`), dohledá médium a streamuje bajty přes `DriveStorage.streamFile`; `driveFileId` nikdy neopustí server (R6.1/R6.4). Vypršelý token → 410, neplatný → 401, neznámé médium → 404.
- Admin server actions `src/app/(app)/admin/admin-actions.ts` — `createModelProfileAction` (R4.1), `uploadMediaAction` (Drive upload + perzistence + kompenzační rollback přes nový `DriveStorage.deleteFile`, R5.1/R5.4/R5.6) vč. štítkování (R7.2), `setUserStatusAction` (R15.1/R15.2 + revokace relací R15.4), `setVisibilityAction` (R16.1), `activate/deactivateNotificationAction` (R17.1/R17.2). Admin stránky napojeny přes inline server actions.
- Settings `src/app/(app)/settings/` — `saveProfileAction` (R18.1/R18.2), `changePasswordAction` (R18.3–R18.5), `telegramTargetAction` (R19.1/R19.3) + klientský `SettingsPanel`.
- Collections `src/app/(app)/collections/` — `create/delete/add/removeMediaAction` (vlastnictví vynuceno Collection_Service, R14.2–R14.5/R14.7/R14.8) + seznam a detail kolekce (owner-only, R14.5).
- Reálná data nahradila placeholdery na stránkách Preview, Models, Models/[id], Search a v `(app)/layout.tsx` (role/skryté sekce/jméno z relace + Page_Visibility + Notification). Smazán `src/lib/sample-content.ts`.
- `DriveStorage.deleteFile(driveFileId)` — přidána do rozhraní + stub (kompenzační rollback uploadu, R5.4).

### Bug & fix
- **Symptom:** Riziko type-error / runtime chyby při předávání admin akcí (vracejí `ActionResult`) do klientských formulářů typovaných `(...) => void | Promise<void>`; inline closury nelze posílat ze Server do Client komponent.
- **Root cause:** Server→Client lze předat jen označené server actions, ne libovolnou closuru; návratový typ `Promise<ActionResult>` není přiřaditelný do `void | Promise<void>`.
- **Fix:** V každé admin/settings/collections stránce definované inline `"use server"` akce vracející `Promise<void>`, které obalují akce z `admin-actions.ts`; tím je typ kompatibilní s prop callbacky a zároveň jde o validní server actions.

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware — middleware + serverová helper vrstva)

### Hotové tasky
- 21.1 Vytvořit `middleware.ts` a serverovou helper vrstvu — ověřeno (`pnpm exec tsc --noEmit` exit 0; `pnpm run build` exit 0, bez edge-runtime warningu, middleware bundle 35.1 kB)

### Nové funkce
- Edge middleware `src/middleware.ts` — napojuje čistou autoritu `decideAccess` na příchozí `NextRequest`: ověří podepsané session cookie, sestaví `RequestContext`, vyhodnotí a mapuje na `NextResponse` (stránky → redirecty, API → 401/403/404). `matcher` vylučuje `_next/static`, `_next/image`, `favicon.ico` a soubory s příponou; API cesty zahrnuty (R1.1, R1.2, R1.4, R1.5, R3.3, R21.4, R21.5).
- `src/lib/access-context.ts` (Edge-safe) — sdílená vrstva nad `decideAccess`: `getAccessConfig()` čte `PAYMENTS_ENABLED` (default false, R21.3), `isApiPath`, `buildRequestContext`, `evaluateAccess`, a podepsané session cookie přes Web Crypto HMAC-SHA256 (`resolveSessionPrincipal` / `signSessionCookie`, cookie `mmm_session`, secret `SESSION_COOKIE_SECRET`). Výchozí stav „uzavřený": chybějící/neověřitelné cookie ⇒ neautentizováno. TODO(21.2): DB-backed session (vydání cookie, revokace, lastActivityAt z DB).
- `src/lib/access-response.ts` (Edge-safe) — `accessDecisionToResponse(decision, request)` překládá `AccessDecision` na `NextResponse` (allow→next, redirectSignIn s `callbackUrl`, redirectPaywall, 401/403/404; API dostává JSON).
- `src/lib/access-guard.ts` (Node-only) — `enforceAccess(request)` a `evaluateAccessWithVisibility(...)` pro route handlery / server actions; doplňuje rozhodnutí o mapu viditelnosti sekcí z DB (`pageVisibilityService.getHiddenSections`, R16.3 → 404). Záměrně mimo import-graf middlewaru, aby Prisma nešla do Edge bundle.
- `.env` — přidány `PAYMENTS_ENABLED=false` a dev `SESSION_COOKIE_SECRET`.

### Bug & fix
- **Symptom:** `pnpm run build` varoval „A Node.js API is used (setImmediate) … not supported in the Edge Runtime" s import trace `access-context.ts → page-visibility-service → @prisma/client`; middleware bundle nabobtnal na 88.7 kB.
- **Root cause:** Node-only čtení viditelnosti sekcí (Prisma) bylo v modulu `access-context.ts`, který importuje Edge middleware — i dynamický `import()` zůstal v trace Edge bundlu.
- **Fix:** Node-only část (`evaluateAccessWithVisibility`, `enforceAccess`, čtení `pageVisibilityService`) přesunuta do samostatného `src/lib/access-guard.ts`, který middleware neimportuje. Po refactoru warning zmizel a middleware bundle klesl na 35.1 kB.
- **Nefungovalo:** Ponechat Node-only kód v `access-context.ts` jen za dynamickým `import()` — bundler ho stejně započítal do Edge trace.

## 2026-06-23 — mmmred-streaming-dashboard (Komponentní testy — UI)

### Hotové tasky
- 20.7 Napsat UI/komponentní testy — ověřeno (`pnpm test` 65 souborů / 226 testů green; `pnpm exec tsc --noEmit` exit 0)

### Nové funkce
- Komponentní testovací vrstva (jsdom) — přidány devDependencies `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `jsdom` (pnpm). Bez změny globálního prostředí vitestu (zůstává `node`); komponentní testy běží přes per-file direktivu `// @vitest-environment jsdom`, takže existující node-based testy fungují beze změny.
- `tests/dom-test-helpers.ts` — sdílený import pro komponentní testy: registruje jest-dom matchery, auto-`cleanup` po každém testu a polyfilluje chybějící prohlížečová API (`ResizeObserver`, `IntersectionObserver`, `matchMedia`). Záměrně NENÍ globální `setupFiles`, aby se RTL nenačítal v node prostředí.
- `src/components/FilterBar.test.tsx` (R11.8) — ověřuje vykreslení filtrovacích chips a **absenci fulltextu**: žádná role `textbox`/`searchbox`, žádný `input[type=text|search]`/`textarea` ve FilterBar i SearchBrowser (s výsledky i v prázdném stavu).
- `src/components/Html5Player.test.tsx` (R6.3, R6.6) — video → HTML5 `<video controls>` se `src` na proxy `/api/stream/…`, foto → `<img>`; `src` nikdy neobsahuje doménu Google Drive; trvalý odkaz na Drive je odmítnut (chybový stav, není v DOM).
- `src/components/design-tokens.test.tsx` — token/snapshot kontrola Netflix systému: MediaCard používá `rounded-2xl`, `--color-netflix-red`, `--color-deep-space`; NotificationBanner akcent `netflix-red`; 2 uložené snapshoty (MediaCard, NotificationBanner).

### Bug & fix
- **Symptom:** `@testing-library/react` nešel resolvnout (`Cannot find module '@testing-library/dom'`).
- **Root cause:** RTL 16 má `@testing-library/dom` jako peer dependency, kterou pnpm neinstaluje automaticky.
- **Fix:** `pnpm add -D @testing-library/dom`.

## 2026-06-23 — mmmred-streaming-dashboard (Route handlery — Cron Scheduler + Stripe webhook)

### Hotové tasky
- 21.3 Vytvořit cron endpoint pro Scheduler a webhook endpoint pro Stripe [POST-MVP] — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm run build` exit 0, oba route jako dynamické `ƒ`)

### Nové funkce
- Cron endpoint `GET|POST /api/cron/scheduler` (`app/src/app/api/cron/scheduler/route.ts`) — autorizace tajemstvím `CRON_SECRET` (hlavička `authorization: Bearer …` nebo `x-cron-secret`, porovnání v konstantním čase přes `timingSafeEqual`), poté volá `createScheduler(prisma).runScheduler(new Date())` a vrací `{ promoted }`. Bez `CRON_SECRET` → 503; neplatné tajemství → 401. Určeno ke spuštění cronem každou minutu (R8.2). `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Stripe webhook endpoint `POST /api/webhooks/stripe` (`app/src/app/api/webhooks/stripe/route.ts`) [POST-MVP] — čte **surové** tělo (`request.text()`) a hlavičku `stripe-signature`, volá `createSubscriptionService(prisma).processWebhook({payload, signature})`. Mapování: přijato → 200 `{received, applied, status}`, `webhook_unverified` → 400, `not_found` → 404 (R20.3/20.4/20.5). Žádná výjimka přes hranici (try/catch → 500). `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — Admin_Console)

### Hotové tasky
- 20.6 Implementovat administrátorská rozhraní (Admin_Console) — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm lint` exit 0, warningy jen v cizích test souborech)

### Nové funkce
- `admin-ui` (`app/src/components/admin/admin-ui.tsx`) — sdílené prezentační primitivy Netflix-style: `AdminCard`, `Field`, `TextInput`, `TextArea`, `Button` (primary/secondary/danger), `Badge`, `WiringNotice`. Bezstavové, sladěné s tokeny (`--color-deep-space`, akcent `--color-netflix-red`).
- `MediaUploadForm` (`app/src/components/admin/media-upload-form.tsx`) — client. Upload souboru s klientskou validací formátu/velikosti přes `validateUpload` (čisté jádro Media_Service, R5.1), výběr profilu modelu, štítkování přes 6 fixních kategorií (`FIXED_CATEGORIES`) s více chip-hodnotami na kategorii a case-insensitive deduplikací (R7.2), plánování `publishAt` (datetime-local; prázdné = ihned, R8.1). Vnořený `TagCategoryInput`.
- `ModelProfileForm` (`app/src/components/admin/model-profile-form.tsx`) — client. Vytvoření/editace profilu; validace jména 1–100 a bio 0–1000 přes `validateModelName`/`validateBio` se zvýrazněním pole (R4.1/4.2/4.3/4.5).
- `UsersOverview` (`app/src/components/admin/users-overview.tsx`) — client, prezentační. Seznam účtů s rolí a stavem (R15.5), akce zablokovat/odblokovat (R15.1/15.2), prázdný stav (R15.6).
- `PageVisibilityToggles` (`app/src/components/admin/page-visibility-toggles.tsx`) — client. Přepínače skrytá/viditelná per sekce (`MANAGEABLE_SECTIONS`: search/models/collections/settings), klíče sladěny s `decideAccess`/NAV_ITEMS (R16.1).
- `NotificationBannerForm` (`app/src/components/admin/notification-banner-form.tsx`) — client. Aktivace/deaktivace banneru, validace textu 1–500 přes `validateNotificationText` (R17.1/17.3).
- Barrel `app/src/components/admin/index.ts`.
- Admin stránky (Admin-only; vynucení přístupu = task 21): rozcestník `app/src/app/(app)/admin/page.tsx` + podstránky `admin/media`, `admin/models`, `admin/users`, `admin/pages`, `admin/notifications`. Vykreslují příslušné komponenty s placeholder daty a `TODO(task 21)` pro načtení dat i odeslání (server actions / route handlery, task 21.2).

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — NotificationBanner + Models + Preview)

### Hotové tasky
- 20.5 Implementovat NotificationBanner, ModelCard/ModelDetail a Preview — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm lint` bez warningů v nových souborech; `pnpm build` zelený; `pnpm test` 214/214)

### Nové funkce
- `NotificationBanner` (`app/src/components/NotificationBanner.tsx`) — client, globální oznamovací banner (R17.1). Vykreslí předaný `text` (prázdný/`null` → nic, R17.2) v akcentu `--color-netflix-red`, `role=status`/`aria-live=polite`. Lze zavřít (lokální dismiss stav); při změně textu se zobrazí znovu (`useEffect` reset, R17.5). Text napojí task 21 na `Notification_Service.getActiveBanner()`.
- `ModelCard` (`app/src/components/ModelCard.tsx`) — prezentační karta modelu (R13.1). Profilová fotka přes proxy nebo placeholder s iniciálou, když fotka chybí (R13.2). Odkazuje (`next/link`) na `/models/<id>`, hover/focus zvětšení, radius 16px.
- `ModelDetail` (`app/src/components/ModelDetail.tsx`) — client artist page (R13.4). Jméno + bio (skryje se, je-li prázdné) + galerie přes `MasonryGrid` (`poolLoader` memoizován). Prázdná galerie → textové sdělení (R13.5).
- `PreviewBoard` (`app/src/components/PreviewBoard.tsx`) — client nástěnka Preview (R10). Approved_Media v `MasonryGrid` (`poolLoader` memoizován); prázdný fond → prázdný stav.
- Stránka Models (`app/src/app/(app)/models/page.tsx`) — server, grid karet `ModelCard`; prázdný seznam → prázdný stav (R13.3).
- Detail modelu (`app/src/app/(app)/models/[id]/page.tsx`) — server, `await params`; neexistující model → chybové sdělení „Model nebyl nalezen." (R13.6); jinak `ModelDetail` s Approved_Media modelu.
- Preview (`app/src/app/(app)/page.tsx`) — server, řadí ukázkový fond čistou `previewOrder(SAMPLE_MEDIA, now)` (Approved_Media sestupně dle času zveřejnění, R10.1/R10.2) → `PreviewBoard`.
- `(app)/layout.tsx` — přidán render `NotificationBanner` nad obsah (placeholder text `null`, TODO task 21); AppShell zachován beze změny.
- Ukázková data (`app/src/lib/sample-content.ts`) — `SAMPLE_MODELS`, `SAMPLE_MEDIA` (tvar kompatibilní s `MediaCardItem`, vše `published` v minulosti) + helpery `findSampleModel`, `sampleMediaForModel`. Vše označeno `TODO(task 21)` k nahrazení reálným načítáním.

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — FilterBar + Search)

### Hotové tasky
- 20.3 Implementovat FilterBar a stránku Search — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm exec eslint` exit 0 na nových souborech)

### Nové funkce
- `FilterBar` (`app/src/components/FilterBar.tsx`) — client, prezentační. Multi-select chips per kategorie z nabídky `buildFilterMenu` (zobrazí jen kategorie s hodnotami → R11.1, R11.2). Chips jsou toggle buttony s `aria-pressed`; aktivní = `--color-netflix-red`, neaktivní = `--color-charcoal`. Řízený výběr (`selection`/`onChange`), sémantiku OR/AND vyhodnocuje `Filter_Service.apply`. ŽÁDNÉ fulltextové pole (R11.8). Drobné „Zrušit filtry" se ukáže jen když je něco vybráno.
- `SearchBrowser` (`app/src/components/SearchBrowser.tsx`) — client, drží `FilterSelection`, aplikuje `apply(selection, pool, now)` (now stabilní přes `useState(() => new Date())`), sestaví nabídku přes `buildFilterMenu`. Výsledky → `MediaCardItem` (strukturované `tags` → pole hodnot). `loadPage` memoizován přes `poolLoader(cards)` na výsledcích, takže změna výběru přepočítá mřížku (R11.6). Typ `SearchMediaItem extends PublicMediaItem, FilterableMediaView`. Při nule výsledků explicitní prázdný stav (`role=status`, R11.7) a výběr filtrů zůstává zachován.
- Stránka Search (`app/src/app/(app)/search/page.tsx`) — server komponenta, renderuje `SearchBrowser` nad statickým `SAMPLE_POOL` (Approved_Media, published v minulosti). Zdroj dat je `TODO(task 21)` — nahradí Media_Service / server action (21.2).

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — MasonryGrid + MediaCard)

### Hotové tasky
- 20.2 Implementovat MasonryGrid a MediaCard — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm lint` exit 0 bez warningů v nových souborech; `pnpm build` zelený)

### Nové funkce
- `MediaCard` (`app/src/components/MediaCard.tsx`) — prezentační karta jednoho média. Typ `MediaCardItem extends PublicMediaItem` (bez `driveFileId`) + volitelná zobrazovaná pole `tags`/`title`/`thumbnailUrl`. Rezervuje místo dle poměru stran (`style.aspectRatio` z `width`/`height`), takže dokreslení náhledu neposouvá rozložení (CLS ≤ 0,1, R12.3). U videa play overlay, štítky jako chips přes spodní scrim, hover/focus zvětšení (`scale-[1.03]`), radius 16px (`rounded-2xl`), gradient `--gradient-feature-card`. Pokud je předán `onSelect`, renderuje se jako `<button>` s `aria-label`, jinak `<article>`. Náhled přes `<img>` (proxy Streaming_URL, drátování později) s `loading="lazy"`.
- `MasonryGrid` (`app/src/components/MasonryGrid.tsx`) — client komponenta nekonečného scrollu (R12). Počet sloupců z čisté `columnsForWidth(clientWidth)` přes `ResizeObserver` (1/2–4/5, R12.1); masonry přes CSS `column-count` + `break-inside-avoid`. Donačítání spouští `IntersectionObserver` se `rootMargin: 600px` (R12.2), dávky `MAX_BATCH_SIZE` (24). Stavy `idle|loading|error|done`: indikátor načítání (`role=status`, R12.4), indikace konce „To je vše." (R12.6), a chybový stav (`role=alert`) s akcí „Zkusit znovu" — při selhání zůstanou zobrazená média beze změny a kurzor se neposune (R12.5). Prop `loadPage(cursor) => Promise<PaginationResult>` jako stabilní zdroj dávek + helper `poolLoader(items, delayMs?)`, který obalí čistou `paginate` nad statickým fondem (drátování na API je task 20.3/21.2).

### Bug & fix
- **Symptom:** `pnpm build` selhal `ENOENT … src/app/page.tsx` (soubor neexistuje), ač komponenty neimportuje žádná stránka.
- **Root cause:** Souběžná práce (task 20.1) přesunula Preview do route group `app/src/app/(app)/page.tsx`; v `.next` zůstala stará cesta v build cache.
- **Fix:** `rm -rf .next` a rebuild → zelený. Vlastní změna (komponenty) build nerozbila; tsc i lint prošly napřed.

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — AppShell: SideNav + TopNav)

### Hotové tasky
- 20.1 Implementovat AppShell (SideNav + TopNav) — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm lint` exit 0 bez warningů v nových souborech; `pnpm run build` zelený)

### Nové funkce
- Modul AppShell (`app/src/components/app-shell/`) — kostra přihlášené aplikace, jen pro přihlášené uživatele.
  - `nav-items.ts` (čisté jádro, bez DOM): `NavItem`, `NAV_ITEMS` (Preview `/`, Search `/search`, Models `/models`, Collections `/collections`, Settings `/settings`, Admin `/admin` jako `adminOnly`), `buildNavItems({role, hiddenSections})` filtruje admin položky pro ne-Adminy (R3.4) a globálně skryté sekce (R16.1/16.2; klíč sekce = první segment cesty, shodná konvence s `decideAccess`), `isNavItemActive` (kořen jen přesná shoda, jinak i vnořené cesty), `avatarInitial`.
  - `side-nav.tsx` (client, `usePathname`): logo MMMRED v akcentu `--color-netflix-red`, navigace s aktivním červeným levým indikátorem.
  - `top-nav.tsx` (client, `useRouter`): zpět/vpřed přes historii prohlížeče + profilový avatar s iniciálou.
  - `app-shell.tsx` (server): skládá SideNav + TopNav kolem `children`, sestaví viditelnou navigaci. Tokeny `bg-deep-space`, akcent `bg-netflix-red`/`text-netflix-red`.
- Route group `app/src/app/(app)/` s `layout.tsx`, který obaluje stránky do `AppShell`; Preview (`page.tsx`) přesunut z `app/src/app/page.tsx` do `(app)/`. Role a `hiddenSections` jsou zatím placeholder s `TODO(task 21)` — reálné napojení na relaci a Page_Visibility doplní middleware/server helpers (task 21).

### Bug & fix
- Žádný — tsc, lint i build prošly napoprvé. UI/komponentní testy jsou mimo rozsah (task 20.7).

## 2026-06-23 — mmmred-streaming-dashboard (Frontend — Html5Player napojený na Streaming_URL)

### Hotové tasky
- 20.4 Implementovat Html5Player napojený na Streaming_URL — ověřeno (`pnpm exec tsc --noEmit` čistý; `pnpm lint` exit 0, žádné warningy v nové komponentě)

### Nové funkce
- React client komponenta `Html5Player` (`app/src/components/Html5Player.tsx`) — první komponenta v `app/src/components/`. Přehrává Approved_Media výhradně přes proxy Streaming_URL (`/api/stream/<token>`), nikdy přes trvalý odkaz na Drive (R6.6, R6.3/6.4). Props: `media` (`PlayableMedia` = `Pick<PublicMediaItem, "id"|"mediaType"|"mimeType">` + volitelné `width`/`height`), `resolveStreamingUrl(mediaId) => string | Promise<string>` (token URL helper, napojí task 21.2), `alt`/`poster`/`autoPlay`/`className`. Foto → `<img>`, video → nativní `<video controls playsInline preload="metadata">`. Stav `loading|ready|error`: během načítání poster/placeholder s rezervací místa dle poměru stran (`aspect-ratio` z width/height, omezení CLS); race-guard přes `requestedIdRef` při rychlé změně `media.id`. Defenzivní pojistka `isDrivePermanentLink` (proti `DRIVE_DOMAINS` z drive-connectoru) odmítne URL s doménou Drive → stav `error`, src se nikdy nenastaví. Netflix tokeny (`bg-graphite`/`bg-deep-space`, `rounded-2xl`, `text-ash`/`text-silver`).

### Bug & fix
- Žádný — komponenta prošla tsc i lint napoprvé. UI/komponentní testy jsou mimo rozsah (task 20.7).

## 2026-06-23 — mmmred-streaming-dashboard (Subscription_Service — Property 42: nový účet má výchozí neaktivní předplatné)

### Hotové tasky
- 19.4 Napsat property test pro výchozí neaktivní předplatné (Property 42) — ověřeno (`pnpm test` cílový soubor 2/2 zelené; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/subscription-service.property-42.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 42: Nový účet má výchozí neaktivní předplatné`. Validates R20.7. Dva testy:
  1. `AuthService.register` nad `InMemoryAuthRepository` + fake hasher (žádná DB/argon2) pro libovolnou platnou registraci → `Ok` a `subscriptionStatus === "inactive"`.
  2. Čistý helper `defaultSubscriptionStatus()` vrací `"inactive"` invariantně bez ohledu na vstup.

### Bug & fix
- Žádný — test prošel napoprvé; default `subscriptionStatus: "inactive"` v `InMemoryAuthRepository.createUser` i helper odpovídají specifikaci.

## 2026-06-23 — mmmred-streaming-dashboard (Settings_Service — Property 37: round-trip uložení profilu a validace polí)

### Hotové tasky
- 18.2 Napsat property test pro uložení profilu a validaci polí (Property 37) — ověřeno (`pnpm test` 212/212 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/settings-service.property-37.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 37: Round-trip uložení profilu a validace polí`. Pohání `createSettingsService(prisma)` (`getProfile`/`saveProfile`) nad minimálním in-memory fake PrismaClient (`user.findUnique`/`update`; jeden uživatel v closure, počítadlo `__updateCalls` pro ověření „žádný zápis"). Generátor: `displayName` přes celé spektrum délek 0..300; větvení podle orákula `validateProfileField`. Ověřuje: platná hodnota (1..255) → `Ok`, perzistována a `getProfile` ji vrátí (R18.1); neplatná (prázdná nebo >255) → `Err{code:"validation"}`, `update` se nezavolá a původní hodnota beze změny (R18.2). Validates R18.1, R18.2.

### Bug & fix
- Žádný — test prošel napoprvé; implementace (task 18.1) i validační jádro `validateProfileField` odpovídají specifikaci.

## 2026-06-23 — mmmred-streaming-dashboard (Subscription_Service — Property 41: neověřitelný webhook nemění stav)

### Hotové tasky
- 19.3 Napsat property test pro neověřitelný webhook (Property 41) — ověřeno (`pnpm test` 212/212 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/subscription-service.property-41.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 41: Neověřitelný webhook nemění stav`. Validates R20.5. Dva testy:
  1. Čistá `verifyWebhookSignature` vrací `false` pro neplatný podpis/původ — generátor mixuje prázdný/whitespace řetězec, `undefined`/`null`, náhodný hex a HMAC podepsaný jiným secretem; filtr vylučuje náhodnou shodu se správným HMAC.
  2. End-to-end `processWebhook` nad minimální in-memory fake Prisma vrstvou: neověřený webhook je odmítnut s `Err{code:"webhook_unverified"}`, NEVOLÁ mutace stavu (`user.update`/`subscription.upsert` — čítač mutací zůstává 0, seedovaní uživatelé mají nezměněný `subscriptionStatus`) a vytvoří právě jeden audit řádek `WebhookEvent` s `accepted=false` a `reason="invalid_signature_or_origin"`.

### Hotové tasky
- 19.2 Napsat property test pro přechody stavu z ověřených webhooků (Property 40) — ověřeno (`pnpm test` 212/212 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/subscription-service.property-40.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 40: Přechody stavu předplatného z ověřených webhooků`. Validates R20.3, R20.4. Dva testy:
  1. Čistá `classifyWebhookType` proti `ACTIVATING_EVENT_TYPES`/`DEACTIVATING_EVENT_TYPES` — generátor mixuje typy z aktivační množiny (→ `"active"`), deaktivační množiny (→ `"inactive"`) a libovolné ostatní řetězce mimo obě množiny (→ `null`).
  2. End-to-end `processWebhook` se správně podepsaným HMAC-SHA256 payloadem nad drobnou in-memory fake Prisma vrstvou (jen volání potřebná pro cestu „ověřený webhook s userId v metadatech"): ověřená aktivační/deaktivační událost přepíše `subscriptionStatus` uživatele na cílovou hodnotu nezávisle na výchozím stavu a vrátí `Ok{applied:true,status,userId}`.

### Hotové tasky
- 18.4 Napsat property test pro přesměrování na Telegram (Property 39) — ověřeno (`pnpm test` 207/207 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/telegram-service.property-39.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 39: Přesměrování na Telegram dle platnosti URL`. Testuje čistou `resolveTelegramRedirect` z `@/services/telegram-service` proti predikátu `isValidUrl` z `@/lib/validation`. Generátor mixuje vstupy: platné URL (`fc.webUrl` se schématem/query/fragmentem), holé řetězce bez `://`, samý whitespace, prázdný řetězec a `null`/`undefined`. Invariant: `Ok` s `{url: configuredUrl, target: "_blank"}` *právě tehdy*, když je `configuredUrl` neprázdný string a `isValidUrl(it)`; jinak `Err` s `code === "destination_unavailable"`. Validates R19.1, R19.3.

### Bug & fix
- Žádný — test prošel napoprvé, implementace (task 18.3) i validační jádro odpovídají specifikaci.

## 2026-06-23 — mmmred-streaming-dashboard (Page_Visibility_Service — Property 6: skrytá sekce vrací 404 a stav přetrvává)

### Hotové tasky
- 16.2 Napsat property test pro skrytou sekci a perzistenci (Property 6) — ověřeno (`pnpm test` 206/206 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/page-visibility-service.property-6.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 6: Globálně skrytá sekce vrací 404 a stav přetrvává`. Kombinuje perzistentní `createPageVisibilityService(prisma)` (`setHidden`/`isHidden`/`getHiddenSections`) nad minimálním in-memory fake PrismaClient (`pageVisibility.upsert`/`findUnique`/`findMany`; `Map` v closure přetrvává napříč voláními i instancemi služby → simuluje cross-session perzistenci) s čistou `decideAccess` z `@/lib/access`. Generátor: sekvence 1–15 příkazů `{sectionKey, hidden}` nad alfanumerickými klíči (vyloučeny veřejné cesty signin/signup/paywall). Ověřuje: hide → `isHidden` true a `decideAccess` `deny404`; round-trip hide→show → `isHidden` false a `allow`; perzistovaná mapa přežije opakované čtení i novou instanci služby. Validates R16.2, R16.3, R16.5.

### Bug & fix
- **Symptom:** Property test selhal na counterexample `["constructor"]` — `expect(before[sectionKey]).toBeUndefined()` dostal `[Function Object]`.
- **Root cause:** `buildHiddenMap` vrací plain objekt; indexace `before["constructor"]` vrací zděděný `Object.prototype.constructor`, ne `undefined`. Šlo o příliš striktní assertion v testu, ne o chybu v kódu — produkční logika (`isSectionHidden`/`decideAccess`) porovnává přes `=== true`, takže klíč „constructor" je korektně vyhodnocen jako viditelný.
- **Fix:** assertion výchozího stavu nahrazena sémantickou kontrolou `svc.isHidden(sectionKey) === false` + `decideAccess(...) === allow` (`app/src/services/page-visibility-service.property-6.test.ts`).

## 2026-06-23 — mmmred-streaming-dashboard (Notification_Service — Property 36: round-trip a doručení oznámení)

### Hotové tasky
- 15.3 Napsat property test pro round-trip a doručení oznámení (Property 36) — ověřeno (`pnpm test` 204/204 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/notification-service.property-36.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 36: Round-trip aktivace/deaktivace a doručení novým relacím`. Testuje `createNotificationService(prisma)` (`activate`/`deactivate`/`getActiveBanner`) nad stejným minimálním in-memory fake PrismaClient jako Property 35 (`notification.updateMany`/`create`/`findFirst` + `$transaction`). Generátor: platné texty délky 1–500. Ověřuje: po `activate(text)` vrací `getActiveBanner()` `{text}` a opakovaný dotaz (další nová relace) vrací totéž (doručení aktuálního textu novým relacím, R17.4); po `deactivate()` je `getActiveBanner() === null` a `activeCount === 0` (round-trip zpět do „žádný banner", R17.2); deaktivace je idempotentní. Validates R17.2, R17.4.

## 2026-06-23 — mmmred-streaming-dashboard (Page_Visibility_Service — task 16.3: unit test selhání perzistence)

### Hotové tasky
- 16.3 Napsat unit test pro selhání uložení viditelnosti — ověřeno (`pnpm test` 204/204 zelené, cílový soubor 3/3; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Unit test (`app/src/services/page-visibility-service.persistence-failure.test.ts`) — vitest, bez fast-check. Testuje `createPageVisibilityService(prisma).setHidden` nad minimálním in-memory fake PrismaClient, kde `pageVisibility.upsert` vždy vyhodí (`findUnique`/`findMany` čtou z úložiště, upsert úložiště nemění). Ověřuje R16.4: (a) `setHidden` nevyhodí přes hranici a vrací `err` s kódem `persist_failed`; (b) předchozí uložený stav zůstane beze změny (prior `isHidden`/`getHiddenSections` stále vrací původní hodnoty); (c) při selhání úplně prvního zápisu nevznikne žádný záznam (`getHiddenSections()` = `{}`). Validates R16.4.

## 2026-06-23 — mmmred-streaming-dashboard (Notification_Service — Property 35: validace a singleton banneru)

### Hotové tasky
- 15.2 Napsat property test pro validaci a singleton banneru (Property 35) — ověřeno (`pnpm test` 200/200 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/notification-service.property-35.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 35: Validace a singleton oznamovacího banneru`. Testuje `createNotificationService(prisma).activate` + `getActiveBanner` nad minimálním in-memory fake PrismaClient (`notification.updateMany` set active=false where active, `notification.create`, `notification.findFirst` nejnovější aktivní, `$transaction` = Promise.all). `updatedAt` z monotónních hodin → jednoznačně „nejnovější" banner. Generátor: sekvence 1–12 textů délky 0–520. Ověřuje: aktivace uspěje právě pro délku 1–500 (R17.1, R17.3); po každé aktivaci je aktivní nejvýše jeden banner (singleton, R17.5); platná aktivace nahradí text (getActiveBanner = nejnovější), neplatná zachová předchozí stav. Validates R17.1, R17.3, R17.5.

## 2026-06-23 — mmmred-streaming-dashboard (Collection_Service — Property 34: guardy členství v kolekci)

### Hotové tasky
- 14.5 Napsat property test pro guardy členství (Property 34) — ověřeno (`pnpm test` 200/200 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/collection-service.property-34.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 34: …`. Testuje `createCollectionService(prisma).addMedia` + `removeMedia` nad minimálním in-memory fake PrismaClient (`collection.findUnique` vlastněná, `mediaItem.findUnique`, `collectionItem.findUnique/create/delete`) s čítači create/delete. Dvě větve: (a) přidání ne-Approved_Media — generátor pokrývá `scheduled`, `hidden`, `published` s budoucím/`null` publishAt i zcela chybějící médium — vrací `media_not_approved`, žádné členství nepřibude a `create` se nezavolá (R14.7); (b) odebrání nepřítomného média při libovolné seedované množině odlišných členství vrací `item_not_in_collection`, množina zůstane `toEqual` původní a `delete` se nezavolá (R14.8). Předpoklad ne-schválenosti ověřen sdílenou `isApproved` z media-service.

## 2026-06-23 — mmmred-streaming-dashboard (Collection_Service — Property 31: round-trip členství v kolekci)

### Hotové tasky
- 14.2 Napsat property test pro round-trip členství v kolekci (Property 31) — ověřeno (`pnpm test` 200/200 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý — vyřešilo i 2 dříve hlášené chyby v tomto souboru)

### Nové funkce
- Property test (`app/src/services/collection-service.property-31.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 31: …`. Testuje `createCollectionService(prisma).addMedia` + `removeMedia` nad minimálním in-memory fake PrismaClient (`collection.findUnique`, `mediaItem.findUnique`, `collectionItem.findUnique/create/delete`, množina členství). Generátor seeduje vlastněnou kolekci, jedno Approved_Media jako cíl (published + publishAt v minulosti) a libovolnou původní množinu členství BEZ cíle. Round-trip: `addMedia(owner, target)` cíl zařadí, `removeMedia(owner, target)` ho odebere a množina členství se vrátí do původního stavu (`toEqual`). Validates R14.2, R14.3.

### Bug & fix
- **Symptom:** `pnpm exec tsc --noEmit` → TS2339 `Property 'where' does not exist on type 'CompositeKey'` (řádky findUnique/delete fake `collectionItem`).
- **Root cause:** pomocný typ `CompositeKey` popisoval jen vnitřní tvar `{ collectionId_mediaId }`, ale destrukturoval se z něj `where` — argument Prisma volání je obalený do `{ where: { collectionId_mediaId } }`.
- **Fix:** přejmenováno na `CompositeKeyArg` s obalením `{ where: { collectionId_mediaId: {...} } }` a použito v obou signaturách (`app/src/services/collection-service.property-31.test.ts`).

## 2026-06-23 — mmmred-streaming-dashboard (Collection_Service — Property 33: validace názvu kolekce)

### Hotové tasky
- 14.4 Napsat property test pro validaci názvu kolekce (Property 33) — ověřeno (`pnpm test` 197/197 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý pro tento soubor)

### Nové funkce
- Property test (`app/src/services/collection-service.property-33.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 33: …`. Generuje názvy délky 0..120 (pokrývá obě strany hranice). Testuje `createCollectionService(prisma).createCollection` nad minimálním in-memory fake PrismaClient (jen `collection.create` + čítač vytvořených) a souběžně čistou `validateCollectionNameInput`. Biimplikace: create uspěje právě když 1 ≤ len ≤ 100 (uloží přesně název + ownerId), jinak err `validation` a `createdCount === 0` (nevznikne kolekce). Validates R14.6.

### Poznámka
- `pnpm exec tsc --noEmit` stále hlásí 2 předchozí chyby v `collection-service.property-31.test.ts` (task 14.2, in-progress) — mimo rozsah tohoto tasku, nový soubor 33 je čistý (žádné diagnostiky).

## 2026-06-23 — mmmred-streaming-dashboard (Collection_Service — Property 32: kolekce přístupná pouze vlastníkovi)

### Hotové tasky
- 14.3 Napsat property test pro přístup vlastníka ke kolekci (Property 32) — ověřeno (`pnpm test` cílový soubor 2/2 zelené; `pnpm exec tsc --noEmit` čistý pro tento soubor)

### Nové funkce
- Property test (`app/src/services/collection-service.property-32.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 32: …`. Testuje čistou funkci `checkOwnership(collection, userId)` bez I/O. Generátor `idArb` z malé domény (`u1`–`u4`), takže shoda i neshoda vlastníka nastávají často. Biimplikace: výsledek je `ok` právě když `ownerId === userId`, jinak err `forbidden` (HTTP 403); samostatná větev `null` kolekce → err `not_found`. Validates R14.1, R14.4, R14.5.

### Poznámka
- `pnpm exec tsc --noEmit` hlásí 2 chyby v `collection-service.property-31.test.ts` (task 14.2, in-progress) — `Property 'where' does not exist on type 'CompositeKey'`. Jsou předchozí a mimo rozsah tohoto tasku (zákaz editace cizích test souborů); nový soubor 32 je čistý.

## 2026-06-23 — mmmred-streaming-dashboard (Model_Service — Property 14: neplatný vstup profilu zachová původní stav)

### Hotové tasky
- 13.3 Napsat property test pro neplatný vstup profilu (Property 14) — ověřeno (`pnpm test` 193/193 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/model-service.property-14.test.ts`) — fast-check `fc.asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 14: …`. Testuje skutečnou logiku `createModelService(prisma)` přes minimální in-memory fake PrismaClient (`makeFakePrisma`): jen metody, které služba volá — `modelProfile.create/findUnique/update`. Fake navíc počítá volání `create`/`update` (gettery `__createCalls`/`__updateCalls`/`__profiles`), takže lze ověřit „žádný zápis" při neplatném vstupu. Generátory: neplatné jméno (délka 0 nebo 101–200) a/nebo neplatné bio (1001–1100), `invalidInputArb` zaručuje neplatnost alespoň jednoho pole. Dvě větve: (1) `createProfile` s neplatným vstupem → `Result` err `validation`, `__profiles` prázdné a `__createCalls === 0` (R4.2, R4.3); (2) existující validní profil + neplatný patch → `updateProfile` vrací err `validation`, `__updateCalls === 0` a `getProfile` stále vrací nezměněné původní `name`/`bio` (R4.5). Bez mocků knihovních volání a bez reálné DB. Validates R4.2, R4.3, R4.5.

## 2026-06-23 — mmmred-streaming-dashboard (Model_Service — unit testy prázdných stavů stránky Models)

### Hotové tasky
- 13.4 Napsat unit testy pro prázdné stavy stránky Models — ověřeno (`pnpm test` 191/191 zelené, cílový soubor 6/6; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Unit testy (`app/src/services/model-service.empty-states.test.ts`) — vitest, bez fast-check (EXAMPLE/EDGE kritéria). Testují skutečnou logiku `createModelService(prisma)` přes minimální ručně psaný in-memory fake PrismaClient (`makePrisma`): pouze metody, které služba volá — `modelProfile.findMany/findUnique/create`, média přes `include: { media: true }`. Pokryté stavy: prázdný seznam modelů → `listProfiles` vrací `[]` (R13.3); profil bez `profileMediaId` → UI placeholder (R13.2); model bez média i model jen s ne-Approved médii (scheduled/hidden/published-v-budoucnu) → `getGallery` vrací `[]` (R13.5, sdílí invariant `visibleMedia`); neexistující model → `getProfile`/`getGallery` vrací chybu `not_found`, ne prázdné pole (R13.6 hranice). Žádné mocky knihovních volání ani reálná DB.

## 2026-06-23 — mmmred-streaming-dashboard (Masonry — Property 29: počet sloupců dle šířky viewportu)

### Hotové tasky
- 12.5 Napsat property test pro počet sloupců masonry (Property 29) — ověřeno (`pnpm test` cílový soubor 1/1 zelený; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/masonry.property-29.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 29: …`. Testuje čistou funkci `columnsForWidth(width)` + konstanty `SMALL_BREAKPOINT` (600) / `LARGE_BREAKPOINT` (1200) z `masonry.ts` (bez I/O). Generátor `widthArb` kombinuje `fc.integer({ min: -2000, max: 4000 })`, explicitní hranice (599/600/601/1199/1200/1201/0/-1) a `fc.double` v okolí hranic → pokrývá záporné, nulové i zlomkové šířky. Invariant: width ≤ 600 → právě 1; width > 1200 → právě 5; jinak (600, 1200] → výsledek ∈ {2,3,4}. Validates R12.1.

## 2026-06-23 — mmmred-streaming-dashboard (Masonry/stránkování — Property 30: donačítání bez překryvů a korektní konec)

### Hotové tasky
- 12.6 Napsat property test pro stránkování (Property 30) — ověřeno (`pnpm test` 183/183 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/masonry.property-30.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 30: …`. Testuje čistou funkci `paginate(items, batchSize, cursor)` + konstantu `MAX_BATCH_SIZE` z `masonry.ts` (bez I/O). Generátor: `fc.uniqueArray(fc.integer(), { maxLength: 200 })` (unikátní položky pro přesné ověření pořadí/duplicit) + `batchSize ∈ [-5, 60]` (i mimo rozsah, sevření 1..24 řeší paginate). Iterace z kurzoru 0 přes `nextCursor`: každá dávka ≤ 24, posbíraná sekvence se rovná přesně vstupu (bez duplicit, bez mezer, pořadí zachováno), kurzor monotónně roste, finální krok má `done === true && nextCursor === null`. Pojistka proti nekonečné smyčce. Validates R12.2, R12.6.

## 2026-06-23 — mmmred-streaming-dashboard (Model_Service — Property 13: round-trip uložení a editace profilu modelu)

### Hotové tasky
- 13.2 Napsat property test pro round-trip profilu modelu (Property 13) — ověřeno (`pnpm test` cílový soubor 1/1 zelený; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/model-service.property-13.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 13: …`. Testuje `createModelService(prisma)` nad minimálním ručně psaným in-memory fake `PrismaClient` (`modelProfile.create / findUnique / update`, bez I/O). Generátory: jméno 1–100 znaků (filtr `validateModelName`), bio 0–1000 znaků (filtr `validateBio`). Tvrzení: (1) `createProfile` uloží přesně zadané `name`/`bio`; (2) `getProfile` vrátí tytéž hodnoty; (3) `updateProfile` perzistuje nové `name`/`bio`; (4) následný `getProfile` odráží editované hodnoty. Validates R4.1, R4.4.

### Hotové tasky
- 12.3 Napsat property test pro nabídku filtrů (Property 28) — ověřeno (`pnpm test` cílový soubor 1/1 zelený; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/filter-service.property-28.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 28: …`. Testuje čistou funkci `buildFilterMenu(tagValues)` bez I/O. Generátor produkuje plochou množinu `TagValueView` napříč 6 kategoriemi (slova z malého slovníku s náhodnou velikostí písmen a okolními mezerami → vynucené case-insensitive duplicity; některé kategorie zůstanou přirozeně prázdné). Strukturální invarianty (bez znovuimplementace logiky): (1) menu obsahuje právě kategorie s ≥1 hodnotou, (2) bez opakování kategorií, (3) v kanonickém pořadí `FIXED_CATEGORIES`, (4) každá zobrazená kategorie neprázdná, (5) hodnoty case-insensitive deduplikované, (6) množinová úplnost normalizovaných hodnot vůči vstupu, (7) pořadí hodnot dle prvního výskytu. Validates R11.1, R11.2.

## 2026-06-23 — mmmred-streaming-dashboard (Tag_Service — Property 26: limit hodnot v kategorii na médium)

### Hotové tasky
- 11.4 Napsat property test pro limit hodnot v kategorii (Property 26) — ověřeno (`pnpm test` 176/176 zelené, cílový soubor 1/1; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/tag-service.property-26.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 26: …`. Testuje čisté jádro `checkCategoryLimit(resultingDistinctCount)` + konstantu `MAX_VALUES_PER_CATEGORY` z `tag-service.ts` (bez I/O). Generátor `fc.integer({ min: 0, max: 100 })` pokrývá hranici 50 z obou stran: výsledek je `ok` právě když `resultingCount <= 50`, jinak `err` s kódem `category_limit_exceeded` a `limit === MAX_VALUES_PER_CATEGORY`. Validates R7.6.

## 2026-06-23 — mmmred-streaming-dashboard (Tag_Service — Property 25: upsert normalizuje a deduplikuje)

### Hotové tasky
- 11.3 Napsat property test pro upsert hodnoty štítku (Property 25) — ověřeno (`pnpm test` cílový soubor 3/3 zelené; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/tag-service.property-25.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 25: …`. Testuje `createTagService(prisma).upsertValue` + čisté `normalize`/`validateTagValue` nad minimálním ručně psaným in-memory fake `PrismaClient` (`tagValue.findUnique({ where: { category_normalizedValue } })` + `tagValue.create`). Tři tvrzení: (1) platná nová hodnota (1–100 po trim, s okrajovými mezerami) se uloží trimovaná s `normalizedValue = trim+lower` a zpřístupní (počet v kategorii = 1); (2) hodnota prázdná po trim nebo > 100 znaků se odmítne s kódem `validation` a nevznikne Tag_Value; (3) opakovaný upsert case/whitespace variant vrací tutéž existující Tag_Value (stejné id) bez nárůstu počtu hodnot v kategorii. Validates R7.2, R7.3, R7.4.

## 2026-06-23 — mmmred-streaming-dashboard (Filter_Service — Property 27: logika filtrů)

### Hotové tasky
- 12.2 Napsat property test pro logiku filtrů (Property 27) — ověřeno (`pnpm test` 181/181 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/filter-service.property-27.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 27: …`. Testuje čistou `apply` z `filter-service.ts`. Generátory: výhradně Approved_Media (`status="published"`, `publishAt<=now`) s náhodnými štítky napříč 6 kategoriemi (malá hodnotová doména a–d, varianty s mezerami/velkými písmeny pro ověření case-insensitive normalizace) a náhodný `FilterSelection` nad podmnožinou kategorií. (1) Nezávislá referenční implementace `expectedMatches` (OR uvnitř kategorie, AND napříč, normalizace trim+lower) — výstup `apply` musí být přesně roven očekávané množině. (2) Prázdný výběr (`{}` i samé prázdné pole) vrací všechna Approved_Media. Validates R11.3, R11.4, R11.5.

## 2026-06-23 — mmmred-streaming-dashboard (Tag_Service — Property 24: pevná množina kategorií)

### Hotové tasky
- 11.2 Napsat property test pro pevnou množinu kategorií (Property 24) — ověřeno (`pnpm test` 176/176 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/tag-service.property-24.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 24: …`. Testuje čisté `isValidCategory` + `FIXED_CATEGORIES`. (1) Univerzální invariant nad směsí generátorů (6 fixních kategorií přes `fc.constantFrom` + libovolné řetězce): `isValidCategory(name) === FIXED_CATEGORIES.includes(name)` — platnost právě tehdy, když je jméno členem pevné množiny. (2) Příkladová + property kontrola: každá z 6 fixních kategorií je přijata, libovolný řetězec mimo množinu (`fc.pre` vyloučí kolize) je odmítnut. Validates R7.1, R7.7.

## 2026-06-23 — mmmred-streaming-dashboard (Scheduler — Property 19: plánovač publikuje právě dosažená média)

### Hotové tasky
- 8.2 Napsat property test pro plánovač (Property 19) — ověřeno (`pnpm test` 173/173 zelené, cílový soubor 2/2; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/scheduler.property-19.test.ts`) — fast-check, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 19: …`. Dvě tvrzení: (1) čisté jádro `selectDueMedia(items, now)` vrací přesně média s `publishAt != null && publishAt <= now` (ostatní vyloučena, vstup se nemutuje, zachované pořadí), generátor médií libovolného stavu s `publishAt` ∈ {null, ±~23 dní okolo now, přesně now}; (2) perzistentní `createScheduler(prisma).runScheduler(now)` nad minimální in-memory fake Prismou (`mediaItem.updateMany` se sémantikou `WHERE status='scheduled' AND publishAt<=now SET status='published'`) — na `published` přejdou právě naplánovaná dosažená média, `promoted` count i finální stavy všech řádků odpovídají očekávání spočítanému před během. Validates R8.2.

 — Property 23: ochrana zdroje a neautorizovaný přístup)

### Hotové tasky
- 9.3 Napsat property test pro ochranu zdroje a neautorizovaný přístup (Property 23) — ověřeno (`pnpm test` 171/171 zelené; nový test 2/2)

### Nové funkce
- Property test (`app/src/services/drive-connector.property-23.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 23: …`. Dvě tvrzení nad čistými funkcemi `issueStreamingToken` a `toPublicMedia` + konstantou `DRIVE_DOMAINS` z `drive-connector.ts` (žádné I/O). (1) Neautorizovaný požadavek: generátor `userId` ∈ {`undefined`, `null`, `""`, jen bílé znaky} → výsledek je `err` s kódem `unauthorized` a neobsahuje žádnou hodnotu tokenu (R6.2). (2) Serializace média: smart generátor `driveFileId` s jednoznačným prefixem `SECRET-DRIVE-` (varianta i s vloženou drive doménou), ostatní pole UUID / pevné MIME typy → `toPublicMedia` výstup nemá vlastnost `driveFileId`, jeho JSON neobsahuje hodnotu `driveFileId` ani žádnou doménu z `DRIVE_DOMAINS`, a neutajená pole zůstávají zachována (R6.4). Validates R6.2, R6.4.

### Poznámka
- `pnpm exec tsc --noEmit` hlásí 2 chyby v `src/services/media-service.persistence.test.ts` (TS2345 u `isErr` nad union typem) — předcházející stav, nesouvisí s taskem 9.3, soubor nebyl měněn; za běhu vitest tento test prochází.

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service — Property 21: trvalé smazání včetně kolekcí)

### Hotové tasky
- 7.7 Napsat property test pro trvalé smazání včetně kolekcí (Property 21) — ověřeno (`pnpm test` 171/171 zelené, cílový soubor 1/1)

### Nové funkce
- Property test (`app/src/services/media-service.property-21.test.ts`) — fast-check `asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 21: …`. Testuje perzistentní `createMediaService(prisma).delete`, která dělá `$transaction([collectionItem.deleteMany({mediaId}), mediaItem.delete({id})])`. Použit minimální ručně psaný in-memory fake `PrismaClient` (`makeFakePrisma`) držící řádky `mediaItem` + `collectionItem`; implementuje `mediaItem.findUnique`, `mediaItem.delete` a `collectionItem.deleteMany` jako "prepared ops" (thunky) a `$transaction` spustí pole těchto operací v pořadí. Smart generátor `scenarioArb`: neprázdná unikátní množina médií (`media-{n}`), libovolné členství v kolekcích (`col-a/b/c` × náhodné mediaId, jedno médium může být ve více kolekcích) a cílové existující médium k smazání. Po `delete(target)` assertuje: (1) `isOk`; (2) mediální záznam neexistuje (R9.2); (3) žádný `collectionItem` už cílové médium nereferencuje (R9.3); (4) cílenost úklidu — členství ostatních médií zůstává beze změny; (5) ostatní mediální záznamy se nesmazaly. Validates R9.2, R9.3.

### Známé problémy (mimo rozsah tasku)
- `pnpm exec tsc --noEmit` hlásí 2 typové chyby v `app/src/services/media-service.persistence.test.ts:209-210` (task 7.8, in-progress) — `it.each` mísí návratové typy `Ok<void>` (delete/hide) a `Ok<MediaItem>` (publishNow/schedulePublish), takže `isErr(result)` nelze sjednotit. Pre-existující, nesouvisí s 7.7; soubor jsem dle zadání neupravoval (testy runtime běží zeleně, vitest netypeuje).

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service — unit testy perzistentní vrstvy)

### Hotové tasky
- 7.8 Napsat unit testy pro ruční publikaci, potvrzení smazání a selhání operací — ověřeno (`pnpm test` 168/168 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Unit testy perzistentní vrstvy (`app/src/services/media-service.persistence.test.ts`) — pokrývají `createMediaService(prisma)` proti ručně psanému in-memory fake PrismaClientu (fake, ne mock; konvence jako `InMemoryAuthRepository`), bez běžící DB. Fake `FakePrisma` implementuje jen použité metody: `mediaItem.{findUnique,create,update,delete}`, `collectionItem.deleteMany`, `$transaction` (Promise.all nad polem už zavolaných operací). Pokrývá: ruční `publishNow` povýší scheduled→published a nastaví `publishAt=now` (R8.3) + guard odmítne skryté; `delete` je hard-delete a uklidí členství ve všech kolekcích a ponechá vazby ostatních médií (R9.4) + `hide` jen mění stav; operace nad neexistujícím id (`publishNow/schedulePublish/hide/delete`) vrací `not_found` (R9.5). Validates R8.3, R9.4, R9.5.


## 2026-06-23 — mmmred-streaming-dashboard (Drive_Connector — Property 22: platnost streamovacího tokenu)

### Hotové tasky
- 9.2 Napsat property test pro platnost streamovacího tokenu (Property 22) — ověřeno (`pnpm test` 168/168 zelené; nové i ostatní property testy projdou)

### Nové funkce
- Property test (`app/src/services/drive-connector.property-22.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 22: …`. Testuje čisté `issueStreamingToken` / `verifyStreamingToken` + konstantu `STREAMING_TOKEN_TTL_SECONDS` z `drive-connector.ts` s jedním pevným tajným klíčem. Smart generátory: čas vydání `issueNow` (ms v širokém okolí epochy), neprázdné `userId` (autorizovaný požadavek), `mediaId`, offset ověření v sekundách `-100..600` (před vydáním / těsně před expirací / přesně na hranici `exp` / po expiraci) a zbytkové ms `0..999` (ověření používá `floor(now/1000)`). Assertuje: (1) vydaný token má `exp <= issueNowSeconds + 300` (R6.1); (2) ověření uspěje právě když `verifyNowSeconds <= exp` a vrací zpět `mediaId/userId/exp`, jinak selže s kódem `token_expired` (R6.5). Validates R6.1, R6.5.

### Poznámka
- `pnpm exec tsc --noEmit` hlásí 2 chyby pouze v `media-service.persistence.test.ts` (mismatch `Ok<void>` vs typovaný result v jeho vlastních asercích) — předcházející stav, nesouvisí s tímto taskem; soubor nebyl upravován.

## 2026-06-23 — mmmred-streaming-dashboard (Scheduler — plánovač publikace)

### Hotové tasky
- 8.1 Implementovat plánovač publikace — ověřeno (`pnpm test` 160/160 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Scheduler (`app/src/services/scheduler.ts`) — stejný vzor jako ostatní služby (čisté jádro + factory). Čistá funkce `selectDueMedia(items, now)` vrací z naplánovaných médií ta s `publishAt != null && publishAt <= now` (nemutuje vstup, zachovává typ; přímo testovatelná pro PBT task 8.2 / Property 19). Factory `createScheduler(prisma)` vystavuje `runScheduler(now?)`, které jedním atomickým `prisma.mediaItem.updateMany` přechodem SCHEDULED→PUBLISHED povýší naplánovaná média s `publishAt <= now` a vrátí `Result<{ promoted: count }>`. Sdílí `MediaItemView` z `media-service.ts` a `Result`/`ok` z `lib/result`. Cron endpoint (každou minutu) je task 21.3. Validates R8.2.

### Hotové tasky
- 7.4 Napsat property test pro viditelnost pouze Approved_Media (Property 17) — ověřeno (`pnpm test` 159/159 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/media-service.property-17.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 17: …`. Testuje čisté funkce `visibleMedia` + `isApproved` (sdílený invariant viditelnosti pro Preview, galerii modelu i Filter_Service) nad shapem `MediaItemView` `{status, publishAt}`. Smart generátor: pole ≤50 položek s `status ∈ {scheduled, published, hidden}` a `publishAt` jako offset v širokém okolí `now=epocha` (minulost / přesně now / budoucnost) + varianta `null`. Assertuje: (1) každá vrácená položka je `published && publishAt!=null && publishAt<=now` a `isApproved` true; (2) úplnost — délka výstupu == počet schválených ve vstupu (žádné Approved_Media se neztratí); (3) žádné scheduled/hidden ve výstupu; (4) zdrojové pole se nemutuje (hluboký snapshot `toEqual`) → skrytá média zůstávají zachována v úložišti. Validates R8.1, R8.4, R9.1, R10.2, R13.4.

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service — Property 16: validace nahrávaného souboru)

### Hotové tasky
- 7.3 Napsat property test pro validaci nahrávaného souboru (Property 16) — ověřeno (`pnpm test` 159/159 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/media-service.property-16.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 16: …`. Testuje čistou `validateUpload(file)` + `MAX_UPLOAD_BYTES` z `media-service.ts`. Generuje MIME (mix podporovaných `constantFrom` a libovolných nepodporovaných řetězců přes `filter`) a velikosti soustředěné kolem hranice 500 MB (`MAX_UPLOAD_BYTES ± 1`, `0`) i širší rozsah `0..2×limit`. Assertuje ekvivalenci: `result.ok` iff (podporovaný formát ∧ `sizeBytes <= MAX_UPLOAD_BYTES`); při odmítnutí nese chyba `code ∈ {unsupported_format, file_too_large}` a neprázdnou `message`. Validates R5.3.

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service — Property 20: guardy plánování a publikace)

### Hotové tasky
- 7.6 Napsat property test pro guardy plánování a publikace (Property 20) — ověřeno (`pnpm test` 159/159 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/media-service.property-20.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 20: …`. Testuje čisté guardy `canSchedule(item, publishAt, now)` a `canPublishNow(item)` z `media-service.ts`. Generuje stavy média (`scheduled|published|hidden`), `publishAt` na médiu (datum nebo `null`) a `publishAt` argument kolem fixního `now` (offset v ms past/equal/future). Assertuje: `canSchedule` uspěje iff ne-skryté A `publishAt > now` (jinak `invalid_state` u skrytých, `invalid_schedule` u ne-skrytých s `publishAt <= now`); `canPublishNow` uspěje iff ne-skryté (`invalid_state` u skrytých); v obou případech vstupní `item` zůstává beze změny (guardy jsou čisté). Validates R8.5, R8.6.

### Hotové tasky
- 7.5 Napsat property test pro řazení Preview (Property 18) — ověřeno (`pnpm test` cílový soubor 1/1 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/media-service.property-18.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 18: …`. Testuje čistou `previewOrder` z `media-service.ts`. Generuje smíšené pole médií (`status ∈ {scheduled,published,hidden}`, `publishAt` jako datum nebo `null`) a libovolný čas `now`. Assertuje: (1) výstup obsahuje právě tolik prvků jako `isApproved` a každý je Approved_Media; (2) sestupné řazení dle `publishAt` (každý prvek má publishAt >= následující). Validates R10.1.

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service — Property 15: klasifikace typu média)

### Hotové tasky
- 7.2 Napsat property test pro klasifikaci typu média (Property 15) — ověřeno (`pnpm test` cílový soubor 1/1 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/media-service.property-15.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 15: …`. Testuje čistou `classifyType` z `media-service.ts`. Generuje známé podporované MIME typy (`image/jpeg|png|webp` → foto; `video/mp4|quicktime|webm` → video) přes `fc.constantFrom` plus libovolné ostatní řetězce filtrované tak, aby po normalizaci (trim+lowercase) nespadaly do podporovaných množin. Assertuje ekvivalenci (iff): foto právě pro foto-set, video právě pro video-set, jinak `null`. Validates R5.2.

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware — Property 5: platební režim z přepínače)

### Hotové tasky
- 5.6 Napsat property test pro platební režim z přepínače (Property 5) — ověřeno (`pnpm test` 153/153 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/access.property-5.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 5: …`. Testuje čistou `decideAccess` s autentizovaným (aktivní účet, neexpirovaná relace) `User` na chráněné, ne-admin, ne-skryté cestě (`/`, `/search`, `/models`, `/collections`, `/settings`). Generuje `paymentsEnabled ∈ {true,false}`, `subscriptionStatus ∈ {active,inactive}` a `isApiRoute`. Assertuje: `paymentsEnabled === false` (MVP) → vždy `allow` bez ohledu na předplatné; `paymentsEnabled === true` (post-MVP) → `allow` iff předplatné aktivní, jinak `redirectPaywall`. Validates R20.6, R21.1, R21.2, R21.3, R21.5.

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware — Property 3: respektování role)

### Hotové tasky
- 5.4 Napsat property test pro respektování role (Property 3) — ověřeno (`pnpm test` cílový soubor 3/3 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/access.property-3.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 3: …`. Testuje čistou `decideAccess` s plně autentizovaným aktivním kontextem (session non-null s čerstvým `lastActivityAt`, `accountStatus: active`, prázdné `hiddenSections`, `paymentsEnabled: false`), aby zbylo jen rozhodnutí o roli. Generuje administrátorské cesty (`/admin/**`, `/api/admin/**`) a neadministrátorské chráněné cesty, plus roli {Admin, User}. Assertuje: admin cesta + User → `deny403`; admin cesta + Admin → `allow`; neadmin chráněná cesta + libovolná role → `allow`. Validates R1.4, R1.5, R3.3, R9.6.

## 2026-06-22 — mmmred-streaming-dashboard (Access_Middleware — Property 4: vypršení relace, zablokování a revokace)

### Hotové tasky
- 5.5 Napsat property test pro vypršení relace a revokaci (Property 4) — ověřeno (`pnpm test` cílový soubor 1/1 zelený, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/access.property-4.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 4: …`. Testuje čistou `decideAccess` na chráněné, neveřejné, ne-admin a ne-API stránkové cestě (`/`, `/search`, `/models`, `/settings`, `/collections`, bez skrytých sekcí, `paymentsEnabled: false`) s existující relací. Generuje dobu inaktivity zaměřenou kolem 30min hranice (`SESSION_INACTIVITY_LIMIT_MS` ± 5 s i širší rozsah 0…2×limit) a `accountStatus` ∈ {active, blocked}. Assertuje „iff": výsledek je `redirectSignIn` (s `callbackUrl === path`) právě tehdy, když `now - lastActivityAt >= SESSION_INACTIVITY_LIMIT_MS` NEBO `accountStatus === "blocked"`; jinak `allow`. Pokrývá i revokaci (zablokovaný účet ⇒ žádná relace není platná). Validates R1.6, R15.3, R15.4.

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware — Property 1: dostupnost veřejných cest)

### Hotové tasky
- 5.2 Napsat property test pro dostupnost veřejných cest (Property 1) — ověřeno (`pnpm test` 148/148 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/access.property-1.test.ts`) — fast-check `fc.property`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 1: …`. Testuje čistou `decideAccess` s `session: null` (neautentizovaný). Generuje dva disjunktní fondy cest: veřejné (`PUBLIC_PATHS` + varianta s koncovým lomítkem) a chráněné (náhodné 1–4 segmenty, vyfiltrované tak, aby nebyly veřejné). Náhodné okolní prostředí (`role`, `accountStatus`, `subscriptionStatus`, `paymentsEnabled`, `hiddenSections`, `isApiRoute`) ověřuje, že u neautentizovaného požadavku výsledek neovlivní. Assertuje „iff": veřejná → `allow`; chráněná → nikdy `allow`, pro `isApiRoute` → `deny401` (bez `callbackUrl`), jinak → `redirectSignIn` s `callbackUrl === path`. Validates R1.1, R1.2, R1.3.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 38: změna hesla)

### Hotové tasky
- 4.8 Napsat property test pro změnu hesla (Property 38) — ověřeno (`pnpm test` 148/148 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/auth-service.property-38.test.ts`) — fast-check `asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 38: …`. Testuje `AuthService.changePassword` přes `InMemoryAuthRepository` + fake hasher. Generuje dvojici (zadané stávající heslo, nové heslo): stávající buď přesně správné, nebo libovolný řetězec; nové heslo napříč délkami (pod/ve/nad limitem 8–128). Assertuje, že změna uspěje právě když `providedCurrent === REAL_PASSWORD` AND `validatePassword(newPassword)`; jinak heslo zůstane nezměněné — ověřeno přes `login` (úspěch novým a selhání starým po změně; úspěch starým a selhání novým bez změny). Validates R18.3, R18.4, R18.5.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 12: blokace po neúspěšných pokusech)

### Hotové tasky
- 4.7 Napsat property test pro blokaci po neúspěšných pokusech (Property 12) — ověřeno (`pnpm test` 146/146 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/auth-service.property-12.test.ts`) — fast-check `asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 12: …`. Testuje `AuthService` + `InMemoryAuthRepository` + fake hasher s explicitním `now` a exportovanými konstantami `MAX_FAILED_ATTEMPTS` / `LOCKOUT_DURATION_MS`. Generuje libovolný počet chybných pokusů (`MAX_FAILED_ATTEMPTS`..+10) se zaručeně špatným heslem; po sekvenci assertuje: i správné heslo → `locked_out`, těsně před koncem okna (`now+LOCKOUT_DURATION_MS-1`) stále `locked_out`, a po uplynutí (`now+LOCKOUT_DURATION_MS+1`) přihlášení správným heslem uspěje. Validates R2.8.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — generická chyba přihlášení)

### Hotové tasky
- 4.9 Napsat unit testy pro generickou chybu přihlášení — ověřeno (`pnpm test` 146/146 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Unit testy (`app/src/services/auth-service.login-error.test.ts`) — 3 příkladové testy přes `AuthService` + `InMemoryAuthRepository` + fake hasher (shodný vzor jako `auth-service.test.ts`). Ověřují, že neznámý e-mail i správný e-mail s chybným heslem jsou odmítnuty STEJNÝM kódem `invalid_credentials` se STEJNOU zprávou a bez pole `field` (žádné prozrazení, které pole/účet je špatně). Třetí test porovnává oba chybové objekty `toEqual` → identické (R2.3, R2.4).

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware — Property 2: zachování cílové adresy)

### Hotové tasky
- 5.3 Napsat property test pro zachování cílové adresy (Property 2) — ověřeno (`pnpm test` cílový soubor 1/1 zelený, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/lib/access.property-2.test.ts`) — Property 2: neautentizovaný přístup zachová cílovou adresu pro návrat (R21.4). fast-check `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 2: …`. Testuje čistou `decideAccess`. Smart generátor `protectedPathArb`: 1–4 segmenty z `[a-zA-Z0-9._~-]`, vyloučí kolizi s `PUBLIC_PATHS` (po normalizaci) a API cesty (první segment ≠ `api`). Pro `session: null` assertuje `outcome === "redirectSignIn"` a `callbackUrl === path` (původní požadovaná adresa).

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 11: round-trip přihlášení/odhlášení)

### Hotové tasky
- 4.6 Napsat property test pro round-trip přihlášení/odhlášení (Property 11) — ověřeno (`pnpm test` 141/141 zelené, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/auth-service.property-11.test.ts`) — fast-check `asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 11: …`. Smart generátory: platný e-mail `local@domain.tld` (alfanumerické segmenty + písmenné TLD, filtrováno přes `validateEmail`) a heslo 8–128 (filtrováno přes `validatePassword`). Pro každou iteraci čerstvý `AuthService` + `InMemoryAuthRepository` + fake hasher: registrace → login (ověř `repo.findSessionById(sessionId)` ≠ null) → logout (ověř `findSessionById` === null). Validates R2.5.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 7: validace registračního vstupu)

### Hotové tasky
- 4.2 Napsat property test pro validaci registračního vstupu (Property 7) — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 141/141 zelené)

### Nové funkce
- Property test Property 7 (`app/src/services/auth-service.property-7.test.ts`) — fast-check `asyncProperty`, `numRuns: 100`, tag `// Feature: mmmred-streaming-dashboard, Property 7: …`. Testuje přímo `AuthService` + `InMemoryAuthRepository` + fake hasher. Generátory pokrývají hranice: `validEmailArb`/`validPasswordArb` (filtrováno přes sdílené `validateEmail`/`validatePassword`) i `anyEmailArb`/`anyPasswordArb` s hraničními délkami kolem 5/254 (e-mail) a 8/128 (heslo) a tvary bez tečky/`@`. Assertuje iff: `isOk(register) === (validateEmail && validatePassword)`, a při neplatném vstupu `findUserByEmail` vrací null (nevznikne účet). Validates R2.1, R2.7.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — property test výchozí role)

### Hotové tasky
- 4.3 Napsat property test pro výchozí roli nového účtu (Property 8) — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` cílový soubor 1/1 zelený)

### Nové funkce
- Property test (`app/src/services/auth-service.property-8.test.ts`) — Property 8: nový účet má právě jednu výchozí roli User (R3.1, R3.2). fast-check `numRuns: 100`, tagovaný `// Feature: mmmred-streaming-dashboard, Property 8: …`. Smart generátor platných registrací (e-mail `local@domain.tld` 5–254 + heslo 8–128, filtrováno přes sdílené `validateEmail`/`validatePassword`); pro každou iteraci čerstvý `AuthService` + `InMemoryAuthRepository` + fake hasher (žádná kolize unikátního e-mailu). Assertuje, že každý vytvořený účet má `role === "User"` a role patří do {Admin, User}.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 10: hashování hesel)

### Hotové tasky
- 4.5 Napsat property test pro hashování hesel (Property 10) — ověřeno (`pnpm test` zelené, 100 iterací ~38 s; `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test Property 10 (`app/src/lib/password.property-10.test.ts`) — fast-check `asyncProperty`, 100 iterací, testuje přímo produkční `argon2idHasher`: pro libovolné heslo (8–128) platí `hash !== plaintext`, `verify(hash, correct) === true` a `verify(hash, other) === false` (`fc.pre(correct !== other)`). Náklady argon2id se nesnižují; per-test timeout 120 s kvůli CPU-náročnosti (~330 ms/iterace). Validates R2.6.

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service — Property 9: unikátnost e-mailu)

### Hotové tasky
- 4.4 Napsat property test pro unikátnost e-mailu (Property 9) — ověřeno (`pnpm test` cílený 1/1 zelený, `pnpm exec tsc --noEmit` čistý)

### Nové funkce
- Property test (`app/src/services/auth-service.property-9.test.ts`) — fast-check, `numRuns: 100`, tag `Property 9`. Generuje platný lowercase e-mail (`local@domain.tld` z alfanumerických segmentů + písmenné TLD, filtrováno přes `validateEmail`) a tři case-varianty (upper/lower/mixed přes bitové pole). Ověřuje nad `AuthService` + `InMemoryAuthRepository` + fake hasher, že po první úspěšné registraci je každá case-varianta odmítnuta s `email_taken` a `findUserByEmail(normalized)` stále vrací týž jediný účet (originalId) — počet účtů nevzroste (R2.2).

## 2026-06-23 — mmmred-streaming-dashboard (Subscription_Service — předplatné a webhooky) [POST-MVP]

### Hotové tasky
- 19.1 Implementovat zpracování předplatného a webhooků — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 136/136 zelené)

### Nové funkce
- Subscription_Service (`app/src/services/subscription-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako ostatní služby):
  - Čisté funkce (PBT-ready, bez I/O): `verifyWebhookSignature(payload, signature, secret)` → HMAC-SHA256 hex podpis ověřený v konstantním čase (`timingSafeEqual`); chybějící/prázdný podpis nebo secret = neověřeno (R20.5). `classifyWebhookType(type)` → `"active"` pro úspěšné události (`ACTIVATING_EVENT_TYPES`), `"inactive"` pro selhání/vypršení (`DEACTIVATING_EVENT_TYPES`), jinak `null` (ignorováno beze změny) (R20.3/20.4). `parseWebhookEvent(payload)` → `ParsedWebhookEvent | null` (čistý JSON parser, extrahuje `eventId`/`type`/`userId`/`stripeCustomerId`). `defaultSubscriptionStatus()` → `"inactive"` (R20.7, schématem vynuceno).
  - `createSubscriptionService(prisma, { webhookSecret?, stripe? })` → `processWebhook({ payload, signature })`: neověřitelný webhook odmítne (`webhook_unverified`), NEMĚNÍ stav žádného uživatele a zapíše audit `WebhookEvent(accepted=false, reason="invalid_signature_or_origin")` (R20.5); ověřená událost nastaví stav předplatného dotčeného uživatele (přes `userId` z metadat, fallback `stripeCustomerId`) atomicky na `User.subscriptionStatus` i `Subscription` (`$transaction` + upsert) a zapíše audit `accepted=true` (R20.3/20.4); ověřené, ale irelevantní/neparsovatelné/bez-uživatele události jsou auditovány bez změny stavu. `setSubscriptionStatusByAdmin(userId, status)` ruční změna Adminem (R20.9). `getSubscriptionStatus(userId)` zdroj pro Access_Middleware. Secret čten líně z `STRIPE_WEBHOOK_SECRET` (import neselže v MVP režimu; chybí-li, webhook se neověří → odmítne).
  - Stripe SDK za rozhraním `StripeGateway` (`createCheckoutSubscription` R20.1, `createCustomerPortalSession` R20.8) + `createStubStripeGateway()` vrací `not_found` — skutečné napojení a webhook endpoint je task 21.3.
- Unit testy (`app/src/services/subscription-service.test.ts`) — 11 příkladových/hraničních testů čistého jádra (správný podpis, tamper, cizí secret, chybějící podpis/secret; mapování všech aktivačních/deaktivačních typů + irelevantní typ; parser id/typ/reference, nevalidní JSON, chybějící reference; výchozí neaktivní stav). Property testy 19.2–19.4 (Property 40–42) zůstávají samostatné `*` tasky.

### Hotové tasky
- 15.1 Implementovat oznamovací banner — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 125/125 zelené)

### Nové funkce
- Notification_Service (`app/src/services/notification-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Model_Service):
  - Čistá funkce (PBT-ready, bez I/O): `validateNotificationInput(text)` → `Result<void, NotificationError>` — text 1–500 přes sdílené `validateNotificationText`; jinak `validation`/`text` (R17.3).
  - `createNotificationService(prisma)` → `activate(text)` validuje a neplatný text odmítne beze změny stavu (R17.1, R17.3); singleton přes `$transaction` (deaktivuj všechny aktivní + vytvoř jeden nový aktivní), takže aktivace nahradí text předchozího a aktivní je nejvýše jeden banner (R17.5). `deactivate()` skryje banner (idempotentní, R17.2). `getActiveBanner()` vrací `{ text } | null` — zdroj textu doručeného každé nově vzniklé relaci (R17.4). Produkční singleton `notificationService`.
- Unit testy (`app/src/services/notification-service.test.ts`) — 3 příkladové/hraniční testy (1/500 ok, prázdné a 501 odmítnuto). Property testy 15.2/15.3 (Property 35/36) zůstávají samostatné `*` tasky.

## 2026-06-23 — mmmred-streaming-dashboard (Telegram_Service — přesměrování na Telegram)

### Hotové tasky
- 18.3 Implementovat resolver přesměrování na Telegram — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 122/122 zelené)

### Nové funkce
- Telegram_Service (`app/src/services/telegram-service.ts`) — čistý resolver `resolveTelegramRedirect(configuredUrl)` → `Result<TelegramRedirect, TelegramError>`. Přesměrování *právě tehdy*, když je `configuredUrl` neprázdný řetězec s platným formátem URL (sdílí `isValidUrl` z `validation.ts`); pak vrací `{ url, target: "_blank" }` pro otevření v nové záložce (R19.1/19.2). Jinak (chybí `null`/`undefined`, prázdné, neplatný formát) vrací chybu `destination_unavailable` (R19.3). Resolver je čistý — skutečnou navigaci řeší UI vrstva.
- Nový chybový typ `TelegramError` (`app/src/lib/errors.ts`) — kód `destination_unavailable`.
- Unit testy (`app/src/services/telegram-service.test.ts`) — 6 příkladových/hraničních testů (platná URL → `_blank`; undefined/null/prázdné/bez schématu/whitespace → chyba). Property test 18.4 (Property 39) zůstává samostatný task.

## 2026-06-23 — mmmred-streaming-dashboard (Settings_Service — uložení profilu)

### Hotové tasky
- 18.1 Implementovat uložení profilu v Settings — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 122/122 zelené)

### Nové funkce
- Settings_Service (`app/src/services/settings-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Model_Service):
  - Čistá funkce (PBT-ready, bez I/O): `validateProfileSave(input)` → `Result<void, SettingsError>` — pole `displayName` je povinné neprázdné a ≤ 255 znaků přes sdílené `validateProfileField`; jinak `validation`/`displayName` (R18.2). Typ `SettingsError = ValidationError | not_found`.
  - `createSettingsService(prisma)` → `getProfile(userId)` (round-trip čtení hodnot, R18.1); `saveProfile(userId, input)` — neexistující uživatel `not_found`, platné hodnoty perzistuje do `User.displayName` (R18.1), neplatné pole odmítne se zachováním původních hodnot a bez zápisu (R18.2, žádný částečný zápis). Produkční singleton `settingsService`.
- Unit testy (`app/src/services/settings-service.test.ts`) — 3 příkladové/hraniční testy (displayName 1/255 ok, prázdné a 256 odmítnuto). Property test 18.2 (Property 37) zůstává TODO (volitelný `*` task).

## 2026-06-23 — mmmred-streaming-dashboard (Collection_Service — privátní kolekce)

### Hotové tasky
- 14.1 Implementovat privátní kolekce — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 113/113 zelené)

### Nové funkce
- Collection_Service (`app/src/services/collection-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Model_Service):
  - Čisté funkce (PBT-ready, bez I/O): `validateCollectionNameInput(name)` → `Result<void, CollectionError>` (název 1–100 přes sdílené `validateCollectionName`, jinak `validation`/`name`, R14.6); `checkOwnership(collection, userId)` → neexistující kolekce `not_found`, cizí vlastník `forbidden` (→ HTTP 403), vlastník ok (R14.4/14.5).
  - `createCollectionService(prisma)` → `createCollection(ownerId, name)` (validace názvu, jinak žádná kolekce); `getCollection`/`getItems`/`deleteCollection` s kontrolou vlastnictví; `addMedia(collectionId, userId, mediaId, now)` — přidá **pouze** Approved_Media (sdílí `isApproved` z Media_Service; neexistující i neschválené médium → `media_not_approved`, R14.7) a je **idempotentní** (opakované přidání téhož média kolekci nezmění, R14.2); `removeMedia` — odebere jen přítomné médium, jinak `item_not_in_collection` beze změny (R14.3/14.8). Produkční singleton `collectionService`.
- Unit testy (`app/src/services/collection-service.test.ts`) — 6 příkladových/hraničních testů (název 1/100/101 a prázdný; ownership owner/cizí/null). Property testy 14.2–14.5 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (Page_Visibility_Service — perzistentní viditelnost sekcí)

### Hotové tasky
- 16.1 Implementovat perzistentní viditelnost sekcí — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 107/107 zelené)

### Nové funkce
- Page_Visibility_Service (`app/src/services/page-visibility-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Model_Service):
  - Čisté funkce (PBT-ready, bez I/O): `buildHiddenMap(rows)` → `Record<string, boolean>` přímo konzumovatelný `decideAccess` (pole `hiddenSections`); `isSectionHidden(map, key)` se shodnou sémantikou `map[key] === true` jako v `access.ts` (R16.3). Typ `VisibilityRow`.
  - `createPageVisibilityService(prisma)` → `setHidden(sectionKey, hidden)` (upsert nad `PageVisibility`, trvale uloží, round-trip zpět na původní stav; selhání → `persist_failed` bez změny stavu, R16.4); `isHidden(sectionKey)` (sekce bez záznamu = viditelná/false); `getHiddenSections()` → mapa pro `decideAccess` (R16.5). Produkční singleton `pageVisibilityService`.
  - Integrace: výstup `getHiddenSections()` je vstupem `RequestContext.hiddenSections`, takže skrytá sekce vrací 404 přes existující `decideAccess`. Perzistence napříč relacemi je daná DB modelem `PageVisibility` (sectionKey @id, hidden default false). Property test 16.2 a unit test 16.3 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (Tag_Service — jádro štítků)

### Hotové tasky
- 11.1 Implementovat jádro štítků — ověřeno (`pnpm exec tsc --noEmit` čistý, `pnpm test` 107/107 zelené)

### Nové funkce
- Tag_Service (`app/src/services/tag-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Media_Service):
  - Čisté funkce (PBT-ready, bez I/O): `normalize(raw)` = trim + lower (porovnávací klíč, R7.2); `isValidCategory(name)` type guard nad `FIXED_CATEGORIES` (R7.1/7.7); `validateTagValue(raw)` → `Result<{value, normalizedValue}, TagError>` (1..100 po trim, R7.3; ukládá trimovanou podobu se zachováním velikosti, klíč lower); `checkCategoryLimit(resultingCount)` (limit 50, R7.6). Konstanty `MIN/MAX_TAG_VALUE_LENGTH` (1/100), `MAX_VALUES_PER_CATEGORY` (50).
  - `createTagService(prisma)` → `upsertValue(category, raw)` (R7.2/7.3/7.4/7.7; deduplikace přes unikátní `category_normalizedValue` → vrátí existující bez vytvoření duplikátu, jinak vytvoří novou; neplatná kategorie → `invalid_category`); `assignValueToMedia(mediaId, tagValueId)` (R7.5/7.6; idempotentní, vynucuje limit 1..50 v kategorii na médium počítáním `mediaTag.count` filtrovaného přes `tagValue.category`).
- Unit testy (`app/src/services/tag-service.test.ts`) — 11 příkladových/hraničních testů (normalizace case/whitespace, 6 fixních kategorií + odmítnutí mimo množinu, hranice délky 100 / prázdné po trim / >100, limit na hranici 50 vs 51). Property testy 11.2–11.4 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (Drive_Connector — streamovací tokeny a proxy)

### Hotové tasky
- 9.1 Implementovat streamovací tokeny a proxy — ověřeno (`tsc --noEmit` čistý, `pnpm test` 91/91 zelené)

### Nové funkce
- Drive_Connector (`app/src/services/drive-connector.ts`) — odděleno čisté jádro (PBT-ready) od I/O adaptéru ke Google Drive.
  - Čisté tokeny (HMAC-SHA256, `node:crypto`): `issueStreamingToken({mediaId, userId, now}, secret)` → `Result<StreamingToken, DriveError>`; `exp = floor(now/1000) + STREAMING_TOKEN_TTL_SECONDS` (= 300 s, R6.1). Neautorizovaný požadavek (chybějící/prázdný `userId`) vrací `unauthorized` a **nevygeneruje token** (R6.2). `verifyStreamingToken(token, now, secret)` uspěje právě když je podpis platný a `now <= exp` (porovnání v sekundách, R6.5); jinak `token_expired` / `token_invalid` (podvržený podpis, špatný klíč, poškozený formát). Token formát: `base64url(json).base64url(hmac)`, podpis ověřen `timingSafeEqual`. Pomocný `signStreamingToken(payload, secret)`.
  - Serializace (R6.3, R6.4): `toPublicMedia(item)` vrací `PublicMediaItem` bez `driveFileId` (explicitní destructuring) a bez jakékoli drive domény; konstanta `DRIVE_DOMAINS` pro defenzivní kontrolu úniku.
  - I/O port `DriveStorage` (authenticate/upload/streamFile) + `createStubDriveStorage()` (vrací `auth_failed` místo výjimky, napojení Service Account je task 21.2). `streamFile` vrací proxy bajty (`ReadableStream`) — klientovi se nikdy nepošle trvalý odkaz.
  - `createDriveConnector({secret?, storage?})` — secret z `process.env.STREAMING_TOKEN_SECRET` (fail-fast, když chybí), váže token logiku + storage.
- Unit testy (`app/src/services/drive-connector.test.ts`) — 12 příkladových/hraničních testů (exp = now+300, hranice now==exp platná / now+1 vypršelá, neautorizované varianty, podvržený/cizí klíč, serializace bez driveFileId i drive domény, fail-fast bez secret, stub vrací chybu). Property testy 9.2–9.3 zůstávají TODO (volitelné `*` tasky).

### Konfigurace
- Přidán `STREAMING_TOKEN_SECRET` do `app/.env` (dev placeholder) — vstup pro HMAC podpis tokenu.

## 2026-06-23 — mmmred-streaming-dashboard (Model_Service)

### Hotové tasky
- 13.1 Implementovat správu profilů modelů — ověřeno (`tsc --noEmit` čistý, `pnpm test` 96/96 zelené)

### Nové funkce
- Model_Service (`app/src/services/model-service.ts`) — čisté jádro + Prisma factory (shodný vzor jako Media_Service):
  - `validateProfileInput({ name, bio })` (R4.1–R4.5) — čistá validace přes sdílené `validateModelName`/`validateBio`; jméno kontrolováno první, vrací `ValidationError` s polem `name`/`bio`.
  - `createModelService(prisma)` → `createProfile` (R4.1–R4.3; neplatný vstup profil nevytvoří, bio výchozí ""), `getProfile`/`listProfiles` (R13.1, R13.6), `updateProfile` (R4.4/R4.5; částečná editace, neplatný vstup zachová původní hodnoty bez zápisu), `deleteProfile`, `getGallery(modelId, now)` (R13.4; výhradně Approved_Media přes sdílené `visibleMedia`), `assignMedia(mediaId, modelId)` (R4.6; not_found u neexistujícího profilu/média).
  - Singleton `modelService` napojený na sdílený Prisma klient.
- Unit testy (`app/src/services/model-service.test.ts`) — 5 příkladových/hraničních testů pro `validateProfileInput` (hranice 1–100/0–1000, prázdné jméno, příliš dlouhé jméno/bio, pořadí validace). Property testy 13.2–13.3 a unit testy prázdných stavů 13.4 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (Filter_Service)

### Hotové tasky
- 12.1 Implementovat aplikaci filtrů a nabídku filtrů — ověřeno (`tsc --noEmit` čistý, `pnpm test` 79/79 zelené)

### Nové funkce
- Filter_Service (`app/src/services/filter-service.ts`) — čisté funkce bez I/O, PBT-ready:
  - `apply(selection, pool, now)` (R11.3–R11.5, Property 27): nejdřív zúží na Approved_Media přes `visibleMedia` (sdílený invariant z Media_Service), pak OR uvnitř kategorie + AND napříč kategoriemi nad „aktivními" kategoriemi (neprázdný výběr). Prázdný výběr (žádná aktivní kategorie, vč. prázdných polí) → všechna Approved_Media. Porovnání hodnot case+whitespace insensitive (trim+lower, shodně s `normalizedValue` štítků). Vstup se nemutuje, pořadí výstupu = pořadí poolu.
  - `buildFilterMenu(tagValues)` (R11.1, R11.2, Property 28): zobrazí jen kategorie s ≥1 hodnotou v kanonickém pořadí `FIXED_CATEGORIES`; hodnoty deduplikovány case-insensitive se zachováním pořadí prvního výskytu. Kategorie bez hodnot vynechány.
  - Exportované view typy: `FilterableMediaView` (rozšiřuje `MediaItemView` o `tags`), `MediaTagView`, `TagValueView`, `FilterSelection`, `FilterCategoryMenu`.
- Unit testy (`app/src/services/filter-service.test.ts`) — 11 příkladových/hraničních testů (prázdný výběr, prázdné pole = bez omezení, vyloučení non-Approved, OR/AND, case-insensitive shoda, nemutace poolu; nabídka: jen neprázdné kategorie, fixní pořadí, dedupe, prázdná sada). Property testy 12.2–12.3 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (masonry + stránkování)

### Hotové tasky
- 12.4 Implementovat masonry a stránkování (čisté funkce) — ověřeno (`tsc --noEmit` čistý, `pnpm test` 68/68 zelené)

### Nové funkce
- Masonry/pagination jádro (`app/src/lib/masonry.ts`) — čisté, I/O-prosté funkce přímo PBT-ready:
  - `columnsForWidth(width)` (R12.1, Property 29): šířka ≤ 600 → 1; pásmo (600, 1200] → 2–4 deterministicky po třetinách (`(600,800]→2`, `(800,1000]→3`, `(1000,1200]→4`); šířka > 1200 → 5. Nulová/záporná šířka spadá do 1 sloupce.
  - `paginate(items, batchSize, cursor)` (R12.2, R12.6, Property 30): vrací jednu dávku `{ items, nextCursor, done }`. `batchSize` sevřen do 1..24 (`MAX_BATCH_SIZE`), `cursor` na ≥ 0. Postupné volání s vraceným `nextCursor` (od 0) pokryje celou množinu bez duplicit a mezer; po vyčerpání `nextCursor === null` a `done === true`.
  - Exportované konstanty `SMALL_BREAKPOINT=600`, `LARGE_BREAKPOINT=1200`, `MAX_BATCH_SIZE=24`.
- Unit testy (`app/src/lib/masonry.test.ts`) — 10 příkladových/hraničních testů (hranice sloupců 600/800/1000/1200/1201, clamp dávky, round-trip pokrytí množiny bez duplicit/mezer, prázdná množina, kurzor za koncem). Property testy 12.5–12.6 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard (Media_Service)

### Hotové tasky
- 7.1 Implementovat jádro správy médií — ověřeno (`tsc --noEmit` čistý, `pnpm test` 58/58 zelené)

### Nové funkce
- Media_Service (`app/src/services/media-service.ts`) — odděleno čisté jádro (bez I/O, PBT-ready) od perzistence přes `createMediaService(prisma)`.
  - Čisté exporty: `classifyType(mime)` (foto JPEG/PNG/WebP → `image/*`; video MP4/MOV(quicktime)/WebM → `video/*`; jinak `null`; case+whitespace insensitive), `validateUpload(meta)` (formát nejdřív, pak velikost ≤ `MAX_UPLOAD_BYTES` = 500·1024·1024), `isApproved(item, now)` (`published && publishAt != null && publishAt<=now`), `visibleMedia(items, now)` (invariant viditelnosti — vrací výhradně Approved_Media, nemutuje zdroj), `previewOrder(items, now)` (Approved_Media sestupně dle `publishAt`), guardy `canSchedule(item, publishAt, now)` a `canPublishNow(item)`.
  - Perzistentní metody: `createMediaItem` (publishAt v budoucnu → `scheduled`, jinak publikováno ihned s `publishAt=now`; mediaType z `classifyType`), `schedulePublish`, `publishNow`, `hide`, `delete` (hard-delete + úklid kolekcí v `$transaction`: nejdřív `collectionItem.deleteMany`, pak `mediaItem.delete`). Neexistující id → `not_found`.
- Unit testy (`app/src/services/media-service.test.ts`) — 16 příkladových/hraničních testů pure jádra (klasifikace, hranice 500 MB, isApproved včetně `publishAt==now` a null, filtr viditelnosti, řazení Preview, guardy). Property testy 7.2–7.8 zůstávají TODO (volitelné `*` tasky).

### Pozn. ke specifikaci (konflikt diagram vs. AC)
- Stavový diagram v design.md naznačuje přechod `hidden → published` (publishNow), ale AC R8.5 a zadání tasku 7.1 explicitně vyžadují **odmítnout** plánování i publikaci skrytého (a smazaného → `not_found`) média. Implementace se řídí R8.5 + zadáním: `canPublishNow`/`canSchedule` vrací `invalid_state` pro `hidden`. (Důsledek: skryté médium je v tomto modelu terminální mimo `delete` — kandidát na vyjasnění s autorem specifikace.)

## 2026-06-23 — mmmred-streaming-dashboard (Auth_Service)

### Hotové tasky
- 4.1 Implementovat autentizační jádro — ověřeno (`tsc --noEmit` čistý, `pnpm test` 42/42 zelené)

### Nové funkce
- Auth_Service (`app/src/services/auth-service.ts`) — `register` / `login` / `logout` / `changePassword` + čisté pomocné funkce `normalizeEmail` (trim+lower pro case-insensitive unikátnost e-mailu, R2.2), `isLockedOut(user, now)` a `computeSessionExpiry(now)`. Konstanty politiky: `MAX_FAILED_ATTEMPTS=5`, `LOCKOUT_DURATION_MS=15min`, `SESSION_INACTIVITY_MS=30min`. Logika oddělená od I/O; produkční instance `authService` napojená na Prisma + argon2id. Klíčové chování: registrace ukládá normalizovaný e-mail (DB constraint vynutí unikátnost), heslo jen jako hash, nový účet má default roli User a neaktivní předplatné; login vytvoří DB relaci s 30min inaktivitou, po 5 chybných pokusech blok na 15 min (blokace má přednost před ověřením hesla), chyba přihlášení je generická (neprozradí pole, R2.4); changePassword vyžaduje správné stávající heslo a nové heslo délky 8–128.
- Password hasher port (`app/src/lib/password.ts`) — `PasswordHasher` interface + `argon2idHasher` (argon2id, R2.6); injektovatelný kvůli testovatelnosti.
- Auth repository port (`app/src/services/auth-repository.ts`) — `AuthRepository` interface + `PrismaAuthRepository` (PostgreSQL) a `InMemoryAuthRepository` (fake pro testy bez DB); záznamy `UserRecord`/`SessionRecord` zrcadlí Prisma modely. Umožňuje přímou testovatelnost register/login/changePassword (Properties 7–12, 38).
- Prisma singleton (`app/src/lib/prisma.ts`) — sdílený klient s cache na `globalThis` (bezpečné při dev hot-reloadu).
- Unit testy (`app/src/services/auth-service.test.ts`) — 10 příkladových testů pure helperů + register/login/logout round-trip, lockout (5 pokusů → blok → po 15 min opět možný), changePassword; používají `InMemoryAuthRepository` + rychlý fake hasher. Property testy 4.2–4.8 zůstávají TODO (volitelné `*` tasky).

### Nástroje
- Přidána závislost `argon2` (`pnpm add argon2`, v0.44.0) pro produkční hashování hesel.

## 2026-06-23 — mmmred-streaming-dashboard (Access_Middleware)

### Hotové tasky
- 5.1 Implementovat `decideAccess` — ověřeno (`tsc --noEmit` čistý, `pnpm test` 32/32 zelené)

### Nové funkce
- Čistá rozhodovací funkce přístupu (`app/src/lib/access.ts`) — `decideAccess(ctx, config)` bez I/O, deterministická a přímo PBT-testovatelná. Pořadí: veřejná cesta → autentizace (relace + aktivní účet + neexpirovaná 30min inaktivita) → page visibility (404) → role (admin cesty jen pro Admina, 403) → předplatné [POST-MVP] (redirectPaywall jen když `paymentsEnabled`). Výstupy `allow | redirectSignIn | redirectPaywall | deny401 | deny403 | deny404`; neautentizovaný požadavek rozlišuje stránku (redirectSignIn + `callbackUrl`) vs media API (deny401). Exportováno: typy `RequestContext`, `SessionContext`, `AccessConfig`, `AccessDecision` a konstanta `SESSION_INACTIVITY_LIMIT_MS` (30 min). Admin cesty detekovány pro `/admin/**` i `/api/admin/**`; klíč skryté sekce odvozen z prvního segmentu cesty (u API se přeskočí `api`).
- Unit testy (`app/src/lib/access.test.ts`) — 20 příkladových/hraničních testů (veřejné cesty, 401 vs redirect, blokace, hranice inaktivity, 404 viditelnost vs role, role 403, MVP vs post-MVP předplatné). Property testy 5.2–5.6 zůstávají TODO (volitelné `*` tasky).

## 2026-06-23 — mmmred-streaming-dashboard

### Hotové tasky
- 3.1 Implementovat čisté validační funkce — ověřeno (`tsc --noEmit` čistý, `pnpm test` 12/12 zelené)

### Nové funkce
- Sdílená validační jádra (`app/src/lib/validation.ts`) — čisté predikáty bez I/O, přímo testovatelné PBT: `validateEmail` (formát `local@domain` + délka 5–254), `validatePassword` (8–128), `validateModelName` (1–100), `validateBio` (0–1000), `validateNotificationText` (1–500), `validateCollectionName` (1–100), `validateProfileField` (1–255) a `isValidUrl` (neprázdný řetězec s platným formátem URL přes `URL` konstruktor, bez síťového I/O). Délkové meze vyexportovány jako `LENGTH_BOUNDS` (jediný zdroj pravdy). Predikáty vrací `boolean`; mapování na `ValidationError` řeší volající služby.

## 2026-06-22 — mmmred-streaming-dashboard

### Hotové tasky
- 2.1 Vytvořit Prisma schema a migraci — ověřeno (`prisma validate` OK, `prisma generate` OK, migrace aplikována, `tsc --noEmit` čistý, `pnpm test` 12/12 zelené)

### Nové funkce
- Prisma schema (`app/prisma/schema.prisma`) — modely User, Session, ModelProfile, MediaItem, TagValue, MediaTag, Collection, CollectionItem, Subscription + singletony Notification, PageVisibility, AppConfig a WebhookEvent [POST-MVP]. Enumy Role/AccountStatus/SubscriptionStatus/MediaType/MediaStatus zrcadlí uniony v `src/lib/domain.ts`. Invarianty: `User.email` unique, `TagValue (category, normalizedValue)` unique, `role` default User, `subscriptionStatus` default inactive, `AppConfig.value` (PAYMENTS_ENABLED) default false.
- Init migrace (`app/prisma/migrations/20260622094326_init/migration.sql` + `migration_lock.toml`) — všechny tabulky, indexy, FK (onDelete: Cascade) a unique constrainty.

### Bug & fix
- **Symptom:** `prisma migrate dev --create-only` selhal s P4002 (cross schema references `public.profiles` → `auth.users`); `prisma migrate deploy` selhal s P3005 (schéma není prázdné).
- **Root cause:** Cílem je existující Supabase DB s vlastním `auth` schématem a tabulkami — shadow-DB introspekce migrate dev i prázdná-DB kontrola migrate deploy na to narážejí.
- **Fix:** Migrace SQL vygenerována offline přes `prisma migrate diff --from-empty --to-schema-datamodel` (bez shadow DB), aplikována aditivně přes `prisma db execute --file` a zaznamenána přes `prisma migrate resolve --applied`. `prisma migrate status` → „Database schema is up to date".
- **Nefungovalo:** `migrate dev` i `migrate deploy` proti Supabase DB s neprázdným/multi-schema obsahem; nepoužívat, dokud není nakonfigurován samostatný `directUrl` / `schemas`.

## 2026-06-21 — mmmred-streaming-dashboard

### Hotové tasky
- 1.2 Definovat sdílené typy a `Result<T, E>` — ověřeno (`tsc --noEmit` čistý, `pnpm test` 12/12 zelené)

### Nové funkce
- Chybové typy služeb (`app/src/lib/errors.ts`) — discriminated uniony nad polem `code` pro `AuthError`, `UploadError`, `MediaError`, `DriveError`, `TagError`, `ModelError`, `CollectionError`, `NotificationError`, `VisibilityError`, `SubscriptionError` + sdílený `ValidationError`; mapují na HTTP odpovědi dle Error Handling v designu. (`Result<T,E>` v `result.ts` a doménové typy v `domain.ts` už existovaly z 1.1.)
- Unit testy sdílených typů (`app/src/lib/result.test.ts`, `app/src/lib/domain.test.ts`) — ověřují helpery `ok/err/isOk/isErr/unwrapOr/mapResult`, 6 fixních kategorií v kanonickém pořadí a konstruovatelnost chybových variant.

### Bug & fix
- **Symptom:** `tsc --noEmit` hlásil TS18046 „'n' is of type 'unknown'" v `result.test.ts` u `mapResult(e, (n) => …)`.
- **Root cause:** Inference `mapResult<T,U,E>` neodvodila `T=number` z proměnné typované jako `Result<number, string>` v daném kontextu volání.
- **Fix:** Explicitní anotace parametru `(n: number)` v testu.

### Nástroje
- Přechod na pnpm (sdílené úložiště) — vygenerován `app/pnpm-lock.yaml` přes `pnpm install`, odstraněn `app/package-lock.json`. Po migraci znovu ověřeno: `tsc --noEmit` čistý, `pnpm test` 12/12 zelené.

## 2026-06-20 — mmmred-streaming-dashboard

### Hotové tasky
- 1.1 Založit Next.js 15 projekt a nástrojový řetězec — ověřeno (vitest --run zelené, `next build` čistý, žádné type/lint chyby)

### Nové funkce
- Next.js 15 App Router + TypeScript projekt (`app/`) — kořenová aplikace MMMRED; strict TS, alias `@/* → src/*`.
- Tailwind CSS v4 s Netflix `@theme` tokeny (`app/src/app/globals.css`) — pure-black canvas `--color-deep-space`, akcent `--color-netflix-red #e50914`, Inter jako substitut Netflix Sans; tokeny barev, typografie, spacing, radius.
- App Router root (`app/src/app/layout.tsx`, `page.tsx`) — Inter font přes `next/font/google`, bootstrap landing.
- Vitest + fast-check toolchain (`app/vitest.config.ts`, `app/tests/setup.test.ts`) — skript `npm test` běží v `--run` režimu; smoke property test s `numRuns: 100` dle konvence specifikace.
- Adresářová struktura `app/src/services`, `app/src/lib`, `app/src/app`, `app/tests`.
- ESLint flat config (`app/eslint.config.mjs`) přes `next/core-web-vitals` + `next/typescript`.

### Bug & fix
- **Symptom:** `next build` varoval „Next.js inferred your workspace root … selected /Users/mai/pnpm-lock.yaml" kvůli více lockfile na disku.
- **Root cause:** Next.js dohledá workspace root podle nejbližšího lockfile; mimo projekt existuje `~/pnpm-lock.yaml`.
- **Fix:** Nastaven `outputFileTracingRoot: path.join(__dirname)` v `app/next.config.ts` → build je nyní bez varování.

## 2026-06-23 — advisor-plans/001 secret hygiene (PONYTAIL)

### Hotové tasky
- advisor-plans/001 — ověřeno (tsc čistý, lint 0, `pnpm test` 268/268, DATABASE_URL 1×)

### Nové funkce
- `app/.env.example` — klíče bez hodnot, označení client-exposed vs SECRET, návod na generování HMAC klíčů (`openssl rand -base64 48`), přidán `DIRECT_URL` a `DRIVE_STORAGE`.
- `app/src/lib/env.ts` `assertProductionSecrets()` — startovní pojistka: v produkci fail-fast při chybějícím/slabém (<32)/placeholder podpisovém klíči; v dev/test no-op.
- `app/src/instrumentation.ts` — Next startup hook volá `assertProductionSecrets()`.
- `app/src/lib/env.test.ts` — 3 unit testy guardu.

### Bug & fix
- **Symptom:** `app/.env` mělo `DATABASE_URL` dvakrát; první `DATABASE_URL="${SUPABASE_CONNECTION_STRING}"` (interpolace) Prisma nerozparsuje (syrové `?`/`%` v hesle).
- **Root cause:** dotenv neexpanduje `${...}` a heslo nebylo URL-enkódované.
- **Fix:** odstraněn interpolovaný řádek; ponechán funkční URL-enkódovaný `DATABASE_URL`.

### Oprava auditu
- Finding SEC-02 (placeholder HMAC secrets) byl **mylný** — `SESSION_COOKIE_SECRET` i `STREAMING_TOKEN_SECRET` už jsou silné náhodné base64 hodnoty. Per-call placeholder kontroly v access-context/drive-connector proto vynechány (redundantní s jediným startup guardem). Regenerace klíčů není nutná.
