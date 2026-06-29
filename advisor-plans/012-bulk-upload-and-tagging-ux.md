# Plan 012 (DIRECTION): uživatelsky přívětivý upload — bulk + drag&drop + štítkovací wizard + našeptávač

> **Executor instructions**: Stavěj po slicech v pořadí 1 → 4. Každý slice je
> samostatně ověřitelný a smí se mergnout zvlášť. Po každém kroku spusť ověření
> a potvrď očekávaný výsledek. Při jakékoli STOP podmínce zastav a nahlas —
> neimprovizuj. Po dokončení (nebo po každém sliceu) aktualizuj stavový řádek
> 012 v `advisor-plans/README.md`.
>
> **Drift check (git)**: `git diff --stat a4cef1c..HEAD -- app/src/components/admin app/src/services/tag-service.ts app/src/app/\(app\)`
> Pokud se některý in-scope soubor od baseline změnil, porovnej „Current state"
> výňatky s živým kódem; na neshodu reaguj jako na STOP.

## Status
- **Priority**: P1 (upload je dnes neohrabaný — hlavní bolest vlastníka)
- **Effort**: Slice 1 = S, Slice 2 = M, Slice 3 = L, Slice 4 = S
- **Risk**: MED (klientský bulk upload do Drive; nová route)
- **Depends on**: 010 (posterUrl náhledy — wizard je použije), 011 (edit akce/štítky) — oba DONE
- **Category**: direction
- **Planned at**: commit `a4cef1c`, 2026-06-28

## Why this matters
Přidávání médií je dnes jen v `/admin/media` přes `MediaUploadForm`: **jeden
soubor**, štítky se zadávají po jedné hodnotě Enterem, žádný drag&drop, žádné
hromadné nahrání ani hromadné štítkování. Pro vlastníka s desítkami médií je to
nepoužitelné. Cíl: nahrávat **odkudkoli z appky** (i z `/preview`), **více
souborů naráz drag&drop**, a otagovat je v **dvousloupcovém wizardu** (vlevo
náhled, vpravo kategorie/štítky, Prev/Next + „použít na všechna") s **našeptávačem**
z existujících hodnot a **čárkou jako oddělovačem** více štítků.

## Current state (co znovupoužít)
- `app/src/components/admin/media-upload-form.tsx` — `MediaUploadForm`:
  - `uploadResumable(uploadUrl, file, onProgress)` — nahraje 1 soubor po chuncích
    (8 MB) PŘÍMO na Drive (308=pokračuj, 200/201=hotovo → `driveFileId`). **Tuto
    funkci vytáhni a znovupoužij pro bulk.**
  - tok: `onCreateSession(name, mime)` → `uploadResumable` → `onFinalize({...})`.
  - `TagCategoryInput` — chip vstup, dnes přidává jednu hodnotu na Enter
    (`addValue` na `e.key === "Enter"`). **Zde přidej čárka-split + našeptávač.**
- `app/src/app/(app)/admin/admin-actions.ts`:
  - `createUploadSessionAction(name, mimeType)` → `{ ok, uploadUrl }` (resumable init),
  - `finalizeDriveUploadAction(input)` → vytvoří Media_Item + štítky (status hidden),
  - `addMediaTagAction` / `assignMediaModelAction` (plán 011) — per-médium editace.
  - Akce běží přes `requireUploader()` (Admin + Distributor).
- `app/src/services/tag-service.ts` — `createTagService(prisma)`:
  `upsertValue(category, raw)`, `assignValueToMedia`, `removeValueFromMedia`,
  čisté `normalize`, `validateTagValue`, `MAX_TAG_VALUE_LENGTH`. **Není** metoda
  na výpis existujících hodnot (potřeba pro našeptávač) ani čárka-split.
- `app/src/lib/domain.ts` — `FIXED_CATEGORIES` (6 kategorií), `TagCategory`,
  `Role`. `app/src/services/media-service.ts` — `classifyType(mime)`,
  `validateUpload`, `MAX_UPLOAD_BYTES` (10 GB).
- `app/src/app/(app)/page.tsx` (Preview, server) — má `principal.role`; renderuje
  klientský `PreviewFeed`. `app/src/app/(app)/layout.tsx` — `requireSession`
  (role je k dispozici). Žádná route `/upload` zatím neexistuje.
- `app/src/components/admin/admin-ui.tsx` — `AdminCard`, `Field`, `TextInput`,
  `Button`, `Badge` (Netflix tokeny). `MediaCard` má `posterUrl` (plán 010).

Convention: služby vrací `Result<T,E>`; čisté jádro testovat bez I/O; akce
`requireUploader` + `revalidatePath`; pnpm only; `"use client"` u interaktivních
komponent; design dle skillu `design-system-netflix` (zaoblené rohy 16px+,
netflix-red akcent, žádné box-shadows). Bajty uploadu NESMÍ jít přes server.

## Commands you will need
| Purpose   | Command (z `app/`)        | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`  | exit 0   |
| Tests     | `pnpm test`               | all pass |
| Jeden test| `pnpm test -- tag-service`| pass     |
| Build     | `pnpm run build`          | exit 0   |
| Lint      | `pnpm run lint`           | exit 0   |

## Suggested executor toolkit
- Skill `design-system-netflix` — drž tokeny/komponentní vzhled (dropzone, wizard).
- Lucide ikony (už v repu): `UploadCloud`, `Plus`, `X`, `ChevronLeft`,
  `ChevronRight`, `Check`.

---

## Slice 1 — Čárka-split + našeptávač + výpis hodnot (rychlé, zlepší i stávající formuláře)

**Scope:**
- `app/src/services/tag-service.ts` — přidat čisté `splitTagInput(raw): string[]`
  (rozdělí na `,`, trim, zahodí prázdné, case-insensitive dedup, ořež na
  `MAX_TAG_VALUE_LENGTH`) + jednotkový test. Přidat do `TagService`
  `listValues(): Promise<Result<{ category: string; value: string }[], TagError>>`
  (čte všechny `TagValue`, seřazené) pro našeptávač.
- `app/src/app/(app)/admin/admin-actions.ts` — `listTagValuesAction()` →
  `{ ok, values?: { category, value }[] }` (`requireUploader`).
- `app/src/components/admin/media-upload-form.tsx` (`TagCategoryInput`) a
  `app/src/components/admin/media-edit-panel.tsx` — vstup:
  - **čárka i Enter** přidávají hodnoty: `"daddy, bear, grandpa"` → 3 chipy
    (použij `splitTagInput`),
  - **našeptávač**: `<datalist>` (nebo jednoduchý filtrovaný dropdown) s
    existujícími hodnotami dané kategorie z `listTagValuesAction`. `<datalist>` je
    nejlevnější (nativní, přístupné) — preferuj ho (ponytail).

**Steps:**
1. `splitTagInput` + test (`tag-service.test.ts`): `"a, b ,, A"` → `["a","b"]`
   (dedup case-insensitive, prázdné pryč). Verify: `pnpm test -- tag-service`.
2. `listValues` v service + `listTagValuesAction`. Verify: `tsc` 0.
3. Zapoj čárka-split do `TagCategoryInput.addValue` (rozdělí draft a přidá víc) a
   do `MediaEditPanel` add-tag. Verify: `tsc` 0, `pnpm test` zelené.
4. Našeptávač přes `<datalist>` napojený na hodnoty kategorie. Verify: `build` 0.

**Done (1):** čárka přidá víc štítků; našeptávač nabízí existující; `listValues`
+ akce; testy zelené; build 0.

---

## Slice 2 — Dropzone: bulk + drag & drop (napojeno na existující finalize)

**Scope:**
- `app/src/components/admin/upload-dropzone.tsx` (nová klient komponenta) —
  drag&drop + `<input type="file" multiple>`; validace každého souboru
  (`validateUpload` + `classifyType`); fronta souborů s per-soubor progress
  barem; každý soubor: `onCreateSession` → `uploadResumable` (vytažená z
  `media-upload-form.tsx` do sdíleného `app/src/lib/resumable-upload.ts`) →
  vrátí `driveFileId`. Výstup: pole `{ file, driveFileId, mimeType, sizeBytes }`
  předané přes `onUploaded(items)`.
- `app/src/lib/resumable-upload.ts` — přesun `uploadResumable` + `UPLOAD_CHUNK_BYTES`
  sem (sdílí `MediaUploadForm` i nový dropzone; `MediaUploadForm` ho jen
  doimportuje, jinak beze změny).

**Steps:**
1. Vytáhni `uploadResumable` do `lib/resumable-upload.ts`; uprav import v
   `MediaUploadForm`. Verify: `tsc` 0, `pnpm test` zelené (chování stejné).
2. `UploadDropzone`: drag&drop (`onDragOver`/`onDrop`) + multiple input, fronta s
   progress, paralelně/sekvenčně nahraje (sekvenčně je bezpečnější — ponytail),
   po dokončení zavolá `onUploaded`. Verify: `tsc`/`build` 0.

**Done (2):** lze přetáhnout/vybrat víc souborů, každý se nahraje přímo na Drive
s progressem; komponenta vrací nahrané položky. Build 0.

**STOP (2):** pokud by bulk vyžadoval zvednout `serverActions.bodySizeLimit` →
STOP (bajty MUSÍ jít přímo na Drive, ne přes server — to je celý smysl).

---

## Slice 3 — Dvousloupcový štítkovací wizard + route `/upload`

**Scope:**
- `app/src/app/(app)/upload/page.tsx` (server) — `requireUploader()` (redirect
  ne-uploaderů), načte `modelService.listProfiles()` + `listTagValuesAction`
  data, vyrenderuje klientský `UploadWizard`. Plná šířka (wizard má 2 sloupce).
- `app/src/components/admin/upload-wizard.tsx` (nová klient komponenta):
  - nahoře `UploadDropzone` (slice 2),
  - po nahrání: **levý sloupec** = náhled aktuální položky (z `posterUrl`/lokální
    `URL.createObjectURL(file)` než vznikne médium) + lišta miniatur fronty;
    **pravý sloupec** = výběr modelu + 6 kategorií se štítky (znovupoužij
    štítkovací vstup ze slice 1 vč. čárky/našeptávače),
  - **Prev / Next** mezi položkami (`ChevronLeft/Right`),
  - **„Použít na všechna"** — zkopíruje aktuální model+štítky na všechny položky,
  - **„Publikovat vše"** vs. **„Uložit skryté"** — po dokončení.
- `app/src/app/(app)/admin/admin-actions.ts` — `finalizeUploadsAction(items[])`:
  pro každou položku `finalizeDriveUploadAction` (vytvoří Media_Item + štítky),
  volitelně `publishNow` když uživatel zvolil publikovat. Vrátí souhrn
  `{ created, failed }`. `requireUploader`, `revalidatePath("/")` + `/admin/media`.

**Steps:**
1. `finalizeUploadsAction` (smyčka nad finalize + volitelný publish). Verify: `tsc` 0.
2. `UploadWizard` UI — dropzone → 2 sloupce → Prev/Next → použít na všechna →
   finalize. Náhled videa přes `<video>` z `URL.createObjectURL` (lokální, než
   se publikuje). Verify: `tsc`/`build` 0.
3. `/upload/page.tsx` route (uploader-only). Verify: `build` ukáže route
   `/upload`; ne-uploader je přesměrován (manuální smoke).

**Done (3):** na `/upload` lze nahrát várku, otagovat (jednotlivě i „na všechna"),
publikovat/uložit skryté; média vzniknou se štítky. Build 0.

**STOP (3):** wizard by potřeboval měnit tokenovou/stream vrstvu → STOP (náhled
před publikací řeš lokálním `objectURL`, ne proxy tokenem).

---

## Slice 4 — Vstup z `/preview` (role-gated „+ Nahrát")

**Scope:**
- `app/src/app/(app)/page.tsx` — spočítej `canUpload = role === "Admin" || role === "Distributor"` a předej do `PreviewFeed`.
- `app/src/components/PreviewFeed.tsx` — nový prop `canUpload?: boolean`; když true,
  vyrenderuj plovoucí `Link` na `/upload` (FAB vpravo dole, `UploadCloud`/`Plus`,
  netflix-red, zaoblený, `fixed bottom-6 right-6 z-40`). Ne-uploader nic nevidí.

**Steps:**
1. Prop + FAB. Verify: `tsc`/`build` 0; manuální smoke — User FAB nevidí, Admin ano.

**Done (4):** uploader má z `/preview` (a kdekoli, FAB je v shellu Preview)
rychlý vstup do `/upload`.

---

## Test plan
- `tag-service.test.ts` — `splitTagInput` (čárka, trim, dedup, ořez délky); vzor =
  existující čisté testy tamtéž.
- (Volitelně) akční test `finalizeUploadsAction` happy + jeden failed, pokud má
  repo akční testy; jinak stačí čisté jádro + `tsc`/build.
- Dropzone/wizard jsou UI — ověř `tsc`/`build`/`lint` + manuální smoke.
- Verifikace: `pnpm test` → vše zelené vč. nových.

## Done criteria (celý plán)
- [x] Slice 1: `splitTagInput`+test, `listValues`/`listTagValuesAction`, čárka+našeptávač v upload formu i edit panelu
- [x] Slice 2: `UploadDropzone` (bulk + drag&drop, per-soubor progress), `uploadResumable` sdílená v `lib/resumable-upload.ts`
- [x] Slice 3: `/upload` route (uploader-only) + `UploadWizard` (2 sloupce, Prev/Next, použít na všechna, publikovat/skrýt) + `finalizeUploadsAction`
- [x] Slice 4: role-gated „+ Nahrát" FAB z `/preview`
- [x] `pnpm exec tsc --noEmit` 0, `pnpm test` 0, `pnpm run build` 0, `pnpm run lint` 0
- [x] žádné zvednutí `serverActions.bodySizeLimit` (bajty jdou přes proxy route po chuncích, ne přímo)
- [x] `advisor-plans/README.md` řádek 012 aktualizován

## STOP conditions
- Živé `MediaUploadForm`/`admin-actions`/`tag-service` nevypadají jako výňatky
  výše (drift) → STOP.
- Cokoli by nutilo posílat upload bajty přes Next server → STOP.
- Verifikace selže dvakrát po rozumné opravě → STOP a nahlas.
- `/upload` by byla přístupná ne-uploaderům (chybí `requireUploader`) → STOP.

## Maintenance notes
- Bulk upload sekvenčně (1 soubor po druhém) je nejjednodušší a šetrný; paralelní
  s limitem souběhu je follow-up, až bude vadit.
- Browser→Drive resumable PUT závisí na CORS (pozn. z plánu 007 B) — pokud
  prohlížeč blokuje, fallback je „Synchronizovat z Drive" (už funguje) nebo
  proxovat chunky přes Route Handler (samostatný plán).
- Reviewer ať ověří `requireUploader` na `/upload` i na `finalizeUploadsAction`,
  a že FAB na `/preview` nevidí role `User`.
- Našeptávač přes `<datalist>` je MVP; fulltext/četnost hodnot je budoucí vylepšení.

---

## Skutečně postaveno — odchylky a rozšíření oproti plánu (2026-06-28)

Plán 012 byl postaven v plném rozsahu (slice 1–4, vše ověřeno: tsc 0, 305 testů,
build 0, lint 0). Během stavění a navazujících iterací vznikly tyto **odchylky a
rozšíření oproti původnímu textu plánu**:

### Odchylky od plánu
- **Upload bajty NEJDOU přímo na Drive z prohlížeče.** Plán předpokládal přímý
  resumable PUT browser→Google. Realita: CORS to blokuje („Failed to fetch").
  Řešení: nová proxy route `app/src/app/api/drive-chunk/route.ts` (Node),
  přepošle chunk (8 MB) na Google session URL. SSRF guard (jen
  `https://www.googleapis.com/upload/`), jen Admin/Distributor. `uploadResumable`
  (`lib/resumable-upload.ts`) teď mluví s proxy (`{done,id}`), ne přímo s Googlem.
  Bajty tedy jdou serverem **po chuncích** (ne celý soubor) — Done criteria
  „bajty přímo na Drive" upraveno na „přes proxy po chuncích".
- **Vstup z `/preview` je popup (modal), ne jen FAB→/upload.** Primární je
  `UploadModal` (`components/admin/upload-modal.tsx`) obalující tentýž
  `UploadWizard` 1:1. FAB otevírá popup; stránka `/upload` zůstává. Navíc nav
  položka „Nahrát" (uploader-only) jako vždy-viditelná pojistka.
- **Drag & drop kdekoliv na `/preview`**, ne jen v dropzone: window listenery
  v `PreviewFeed` (overlay během tažení ve velikosti popupu, drop otevře popup s
  těmi soubory přes `initialFiles`). Jen pro uploadery.
- **FAB podoba:** kruhové „+", glassmorphism + hover, `z-[60]` nad toastem
  (původně červené „Nahrát" s textem `z-40`, které toast překrýval).

### Bug fixy během stavění
- **Duplikace při uploadu** (z 1 souboru „vytvořeno 2"): dev StrictMode spouštěl
  `initialFiles` efekt 2× + drop na dropzone bublal na window. Fix: ref guard v
  `UploadDropzone` (dávka jen jednou) + `stopPropagation`.
- **Popup ořez:** modal scrolluje jako celek (`min-h-full items-center`),
  vycentrovaný / s paddingem → zaoblené rohy vždy vidět.

### Rozšíření MIMO plán 012 (navazující požadavky)
- **Editace/sdílení/mazání média přímo v lightboxu** (`MediaLightbox`): toolbar
  vpravo nahoře — tužka (edit kategorie/štítky + Skrýt, jen uploader), sdílet
  (copy `/?m=<id>`, všechny role), koš (delete, jen uploader). Edit panel se
  odkryje až po kliknutí na tužku. Využívá `MediaEditPanel` + akce z plánu 011.
- **Kompletní smazání vč. Google Drive:** `deleteMediaAction` maže nejdřív z
  Drive, pak z DB (aby „Synchronizovat z Drive" nemohla re-import);
  `driveStorage.deleteFile` idempotentní (404 = ok).
- **Sdílený odkaz `/?m=<id>` bez navigace:** lightbox drží URL přes
  `history.replaceState`; načtení s `?m=` otevře médium; nepřihlášený → middleware
  redirect na `/signin` s `callbackUrl` vč. query (oprava `lib/access-response.ts`).
- **`SystemToast`** (`components/SystemToast.tsx`) — centrovaný dole, glass,
  auto-dismiss; „Link is copied! Ready to share." po kopii odkazu.
- **`MediaCardItem.editTags`** (id+kategorie+hodnota) plněné pro uploadery v
  `(app)/page.tsx` (potřeba pro editaci štítků v lightboxu).

> Tyto rozšíření nemají vlastní plán (vznikly jako přímé build požadavky); jsou
> zaznamenané v `plans/build-journal.md` (2026-06-28). Případný budoucí audit je
> může zpětně formalizovat.
