# Plan 011 (DIRECTION): UI pro úpravu média — přiřazení modelu a štítků

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření a potvrď očekávaný výsledek. Při jakékoli STOP podmínce zastav a
> nahlas — neimprovizuj. Po dokončení aktualizuj řádek 011 v
> `advisor-plans/README.md`.
>
> **Drift check (no VCS)**: otevři `app/src/services/model-service.ts`
> (`assignMedia`), `app/src/services/tag-service.ts` (`assignValueToMedia`,
> `upsertValue`), `app/src/components/admin/media-list.tsx`
> (`AdminMediaList`, `AdminMediaRow`), `app/src/app/(app)/admin/admin-actions.ts`
> (`setMediaPublishedAction`, `deleteMediaAction`, `importFromDriveAction`).
> Pokud se živý kód liší od výňatků níže, ber to jako STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (admin-only UI nad existujícími službami)
- **Depends on**: none (služby existují; logicky po 007, DONE)
- **Category**: direction
- **Planned at**: no VCS; baseline = 2026-06-28 build session

## Why this matters
Média naimportovaná z Drive (plán 007 A) nebo nahraná bez metadat mají
`modelId = null` a žádné štítky. Neexistuje UI, jak je dodatečně přiřadit k
modelu nebo otagovat → tato média se **nikdy neobjeví v albu modelu ani ve
filtrech** podle kategorií, jen v obecném Preview. Servisní vrstva už umí
přiřadit model (`modelService.assignMedia`) i štítek
(`tagService.assignValueToMedia` + `upsertValue`), chybí jen admin UI a
server akce, které to propojí. Cíl: v `/admin/media` umět u položky nastavit
model a přidat/odebrat štítky.

## Current state
- `app/src/services/model-service.ts` →
  `assignMedia(mediaId, modelId): Promise<Result<MediaItem, ModelError>>`
  (ověří existenci profilu i média, pak `mediaItem.update({ data: { modelId } })`).
  `listProfiles()` vrací všechny modely (pro výběr v UI).
- `app/src/services/tag-service.ts` →
  `upsertValue(category, raw)` (dedup přes `category_normalizedValue`) a
  `assignValueToMedia(mediaId, tagValueId)` (idempotentní, limit 50/kategorie).
  **Chybí** odebrání štítku z média (`MediaTag` delete) — viz Step 1.
  Kategorie jsou pevná množina `FIXED_CATEGORIES` (`@/lib/domain`).
- `app/src/components/admin/media-list.tsx` — `AdminMediaList`/`AdminMediaRow`
  (`id`, `label`, `status`, `canDelete`); řádek má tlačítka Publikovat/Skrýt
  a Smazat, akce přes props (`onDelete`, `onSetPublished`), `useTransition` +
  `router.refresh()`, chyby do `role="alert"`. UI primitiva v
  `./admin-ui` (`AdminCard`, `Button`, `Badge`).
- `app/src/app/(app)/admin/admin-actions.ts` — vzor server akcí:
  `requireUploader()`, zavolá službu, `revalidatePath`, vrací `ActionResult`
  (`{ ok, message? }`). Viz `setMediaPublishedAction`, `deleteMediaAction`.
- `/admin/media/page.tsx` skládá data (rows) a předává akce do `AdminMediaList`.

Convention: služby vrací `Result`; akce `requireUploader` (Admin+Distributor)
a vrací `ActionResult`; UI je prezentační, data/akce přes props; pnpm only;
po mutaci `revalidatePath`/`router.refresh()`.

## Commands you will need
| Purpose   | Command (z `app/`)        | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`  | exit 0   |
| Tests     | `pnpm test`               | all pass |
| Build     | `pnpm run build`          | exit 0   |
| Lint      | `pnpm run lint`           | exit 0   |

## Scope
**In scope:**
- `app/src/services/tag-service.ts` — přidat
  `removeValueFromMedia(mediaId, tagValueId): Promise<Result<void, TagError>>`
  (smaže `MediaTag`; idempotentní — neexistující vazba = ok) + test.
- `app/src/app/(app)/admin/admin-actions.ts` — nové akce:
  - `assignMediaModelAction(mediaId, modelId | null)` — přiřadí/odebere model
    (`modelId=null` → odpojit; `mediaItem.update({ modelId: null })`, viz Step 2),
  - `addMediaTagAction(mediaId, category, value)` — `upsertValue` + `assignValueToMedia`,
  - `removeMediaTagAction(mediaId, tagValueId)` — `removeValueFromMedia`.
  Všechny `requireUploader`, `revalidatePath("/admin/media")`, vrací `ActionResult`.
- `app/src/components/admin/media-edit-panel.tsx` — **nová** klientská komponenta:
  select modelu (z předaných `models`), správa štítků (kategorie select +
  hodnota text → přidat; čip s ✕ → odebrat). Vzor interakce = `media-list.tsx`
  (`useTransition`, `router.refresh()`, chyba do `role="alert"`).
- `app/src/components/admin/media-list.tsx` — rozšířit `AdminMediaRow` o
  `modelId: string | null` a `tags: { id, category, value }[]`; vykreslit
  `MediaEditPanel` u řádku (např. rozbalovací sekce), předat nové akce + `models`.
- `app/src/app/(app)/admin/media/page.tsx` — načíst modely (`modelService.listProfiles`)
  a štítky média, naplnit rozšířené `rows`, předat nové akce.

**Out of scope (NEMĚNIT):**
- `model-service.assignMedia` (funguje) — pro odpojení modelu použij buď nový
  servisní helper, nebo přímo `mediaItem.update({ modelId: null })` v akci
  (rozhodni v Step 2; preferuj nevyhazující cestu).
- Veřejné stránky (Preview, model album) — jen budou těžit z dat.
- Tokeny/streamování, Drive, session.

## Steps

### Step 1: `removeValueFromMedia` v tag-service (+ test)
Přidej do `TagService` a `createTagService`:
```ts
async removeValueFromMedia(mediaId, tagValueId) {
  await prisma.mediaTag.deleteMany({ where: { mediaId, tagValueId } });
  return ok(); // idempotentní: neexistující vazba není chyba
}
```
Test v `app/src/services/tag-service.test.ts`: po `assign` + `remove` vazba
zmizí; `remove` neexistující vazby vrátí `ok` (idempotence).

**Verify**: `pnpm test -- tag` → zelené.

### Step 2: Server akce v `admin-actions.ts`
Přidej tři akce podle vzoru `setMediaPublishedAction`:
- `assignMediaModelAction(mediaId, modelId)`:
  - `modelId` neprázdné → `modelService.assignMedia(mediaId, modelId)`,
  - `modelId === null`/"" → odpoj: `prisma.mediaItem.update({ where:{id:mediaId}, data:{ modelId: null } })` v `try/catch` → `ActionResult`.
- `addMediaTagAction(mediaId, category, value)`:
  `tagService.upsertValue(category, value)` → na ok `assignValueToMedia(mediaId, tagValue.id)`; chyby (validace/limit/kategorie) přelož na `ActionResult.message`.
- `removeMediaTagAction(mediaId, tagValueId)`: `tagService.removeValueFromMedia(...)`.
Každá: `await requireUploader()`, na konci `revalidatePath("/admin/media")`.

**Verify**: `pnpm exec tsc --noEmit` → 0.

### Step 3: `MediaEditPanel` komponenta
Nová klientská komponenta (`"use client"`), props:
`{ mediaId, currentModelId, models: {id,name}[], tags: {id,category,value}[], onAssignModel, onAddTag, onRemoveTag }`.
- Model: `<select>` modelů + „— bez modelu —" (hodnota `""` → `onAssignModel(mediaId, null)`).
- Štítky: `<select>` kategorií z `FIXED_CATEGORIES`, text input hodnoty,
  tlačítko „Přidat" → `onAddTag(mediaId, category, value)`; existující štítky
  jako čipy s ✕ → `onRemoveTag(mediaId, tag.id)`.
- Vzor stavu/chyb = `media-list.tsx` (`useTransition`, `router.refresh()`,
  chyba do `role="alert"`). Použij `admin-ui` primitiva + design tokeny
  (border radius, netflix-red akcent) dle skill `design-system-netflix`.

**Verify**: `pnpm exec tsc --noEmit` → 0.

### Step 4: Zapojení do `media-list.tsx` + `media/page.tsx`
- Rozšiř `AdminMediaRow` o `modelId` a `tags`; přidej do `AdminMediaListProps`
  `models` + tři nové akce; vykresli `MediaEditPanel` u řádku.
- V `media/page.tsx` načti `modelService.listProfiles()` a štítky pro každé
  médium (Prisma include `mediaTags.tagValue`), naplň `rows`, předej akce.

**Verify**: `pnpm exec tsc --noEmit` 0; `pnpm test` zelené; `pnpm run build` 0.

### Step 5: Lint + manuální smoke
**Verify**: `pnpm run lint` 0. Smoke (zdokumentuj): v `/admin/media` u
naimportovaného média vyber model → médium se objeví v albu modelu; přidej
štítek kategorie/hodnota → objeví se ve filtru; odeber štítek → zmizí.

## Test plan
- `app/src/services/tag-service.test.ts` — `removeValueFromMedia`
  (odebere existující vazbu; idempotence neexistující). Vzor = existující
  testy assign v témže souboru.
- (Akce a UI jsou tenké drátování; pokud má repo akční testy, přidej jeden
  šťastný + jeden chybový pro `addMediaTagAction`, jinak stačí servisní test.)
- Verifikace: `pnpm test` → vše zelené vč. nových.

## Done criteria
- [ ] `tagService.removeValueFromMedia` existuje + test (zelený)
- [ ] `assignMediaModelAction` / `addMediaTagAction` / `removeMediaTagAction` v `admin-actions.ts` (všechny `requireUploader` + `revalidatePath`)
- [ ] `MediaEditPanel` zapojen v `AdminMediaList`; `/admin/media` umožní nastavit model a přidat/odebrat štítky
- [ ] `pnpm exec tsc --noEmit` 0, `pnpm test` 0, `pnpm run build` 0, `pnpm run lint` 0
- [ ] žádný soubor mimo In-scope změněn
- [ ] `advisor-plans/README.md` řádek 011 aktualizován

## STOP conditions
- Živé `assignMedia`/`assignValueToMedia`/`AdminMediaList` nevypadají jako
  výňatky výše (drift) → STOP.
- Přiřazení modelu/štítku by vyžadovalo měnit veřejné stránky nebo schéma
  (mimo přidání metody) → STOP a nahlas.
- Verifikace selže dvakrát po rozumné opravě → STOP.

## Maintenance notes
- Až přibude Approach B (web resumable upload) nebo bulk import, tentýž panel
  poslouží k doplnění metadat — zvážit bulk přiřazení modelu více médiím.
- `assignMedia` ověřuje existenci profilu i média; akce ať chyby `not_found`
  přeloží na srozumitelnou hlášku.
- Reviewer ať ověří `requireUploader` na všech třech akcích (defense-in-depth)
  a že odebrání modelu (`modelId=null`) je dostupné jen Adminovi/Distributorovi.
