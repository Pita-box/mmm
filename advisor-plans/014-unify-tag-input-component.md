# Plan 014: Sjednotit štítkovací vstup do jedné sdílené komponenty

> **Executor instructions**: Postupuj krok po kroku, po každém kroku spusť
> ověření. Při STOP podmínce zastav a nahlas. Po dokončení aktualizuj řádek 014
> v `advisor-plans/README.md`.
>
> **Drift check**: `git diff --stat 9338b72..HEAD -- app/src/components/admin/media-edit-panel.tsx app/src/components/admin/media-upload-form.tsx app/src/components/admin/upload-wizard.tsx`
> Na neshodu s „Current state" reaguj jako na STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (dotýká se 3 živých UI; snadno zanést regresi do chování štítků)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9338b72`, 2026-06-28

## Why this matters
Logika „přidej štítek na Enter nebo čárku při psaní + dedupe + našeptávač přes
`<datalist>`" je teď **třikrát** skoro shodně:
1. `media-edit-panel.tsx` — interní `CategoryTagInput` (lightbox edit, expanded).
2. `upload-wizard.tsx` — inline `<input>` v mapě kategorií + `addValuesToMeta`.
3. `media-upload-form.tsx` — interní `TagCategoryInput` (chips + Přidat tlačítko).
Tři kopie znamenají drift (jedna se opraví, druhé ne — což už se stalo: čárka
nejdřív fungovala jen v jedné). Cíl: jedna sdílená komponenta `TagValueInput`,
kterou použijí všechny tři.

## Current state
- `app/src/components/admin/media-edit-panel.tsx` — `CategoryTagInput({ mediaId,
  category, chips, suggestions, onCommit, onRemove })`: vlastní `draft`, na
  `onChange` detekuje čárku (split → `onCommit(category, parts)`, zbytek do
  draftu), Enter → `onCommit`; `<datalist>` ze `suggestions`; chipy s `onRemove`.
  Toto je **nejúplnější varianta** — použij ji jako základ sdílené komponenty.
- `app/src/components/admin/upload-wizard.tsx` — v `FIXED_CATEGORIES.map` inline
  `<input>` s identickou čárka/Enter logikou (`addValuesToMeta`/`addTag`) +
  `<datalist>` + chipy (`rounded-[var(--radius-pills)]`) + „+" tlačítko.
- `app/src/components/admin/media-upload-form.tsx` — `TagCategoryInput({
  category, values, onChange, suggestions })`: chips + `splitTagInput` na
  Enter/„Přidat". (Pozn.: zde čárka-při-psaní NENÍ — drift!)
- Sdílené jádro: `splitTagInput(raw)` z `@/services/tag-service` (čárka split +
  trim + dedupe + ořez délky) — všechny tři ho už používají.
- Společné typy: kategorie jsou `TagCategory` z `@/lib/domain` (`FIXED_CATEGORIES`).

Convention: prezentační komponenty bez I/O, akce/stav přes props; design tokeny
(`--color-*`, `rounded-[var(--radius-*)]`); `"use client"`; pnpm only.

## Commands you will need
| Purpose   | Command (z `app/`)        | Expected |
|-----------|---------------------------|----------|
| Typecheck | `pnpm exec tsc --noEmit`  | exit 0   |
| Test      | `pnpm test`               | all pass |
| Build     | `pnpm run build`          | exit 0   |
| Lint      | `pnpm run lint`           | exit 0   |

## Scope
**In scope:**
- `app/src/components/admin/tag-value-input.tsx` (vytvořit) — sdílená komponenta.
- `app/src/components/admin/media-edit-panel.tsx` — nahradit `CategoryTagInput` sdílenou.
- `app/src/components/admin/upload-wizard.tsx` — nahradit inline vstup sdílenou.
- `app/src/components/admin/media-upload-form.tsx` — nahradit `TagCategoryInput` sdílenou.
- `app/src/components/admin/index.ts` — export nové komponenty (pokud je potřeba).
- (volitelně) `app/src/components/admin/tag-value-input.test.tsx` — viz Test plan.

**Out of scope:**
- Server akce, `tag-service`, `splitTagInput` (beze změny — sdílené jádro).
- Chování ukládání (immediate vs batch) — to řídí rodič přes callbacky.

## Steps

### Step 1: Sdílená `TagValueInput`
Vytvoř `app/src/components/admin/tag-value-input.tsx` (`"use client"`) — vychází
z `CategoryTagInput` (nejúplnější). Návrh props (čistě prezentační):
```ts
export interface TagValueInputProps {
  readonly label: string;                 // název kategorie (zobrazí se nad vstupem)
  readonly listId: string;                // unikátní id pro <datalist>
  readonly values: readonly string[];     // aktuální hodnoty (chipy)
  readonly suggestions?: readonly string[];
  readonly disabled?: boolean;
  readonly onAdd: (values: string[]) => void;   // commit (čárka/Enter); volající dedupuje/ukládá
  readonly onRemove: (value: string) => void;
}
```
Chování: vlastní `draft`; `onChange` detekuje čárku (split → `onAdd(splitTagInput(parts))`,
zbytek v draftu); Enter → `onAdd(splitTagInput(draft))` + clear; `<datalist>` ze
`suggestions`; chipy `rounded-[var(--radius-sm)]` (NE pilulka) s „×" → `onRemove`.
`onAdd` dostává už rozdělené hodnoty (volá `splitTagInput` uvnitř), rodič si
řeší dedupe vůči svému stavu.

**Verify**: `pnpm exec tsc --noEmit` → 0.

### Step 2: Použít v `media-edit-panel.tsx`
Nahraď interní `CategoryTagInput` za `TagValueInput`. Mapování:
- `values` = chipy dané kategorie (`localTags.filter(...).map(c => c.value)`),
- `onAdd(vals)` = stávající `addLocal`/`commitImmediate` logika (dedupe + lokálně/server),
- `onRemove(value)` = najdi chip dle kategorie+value → `removeLocal(id)`/`removeImmediate(id)`.
Smaž starou `CategoryTagInput`. Zachovej oba režimy (expanded batch + compact immediate).

**Verify**: `pnpm exec tsc --noEmit` → 0; ručně: v lightbox edit i admin listu se štítek přidá Enterem i čárkou, chip se zobrazí, odebrání funguje.

### Step 3: Použít v `upload-wizard.tsx`
Nahraď inline `<input>`/`<datalist>`/chipy v `FIXED_CATEGORIES.map` za
`TagValueInput`. `onAdd(vals)` = `addValuesToMeta(category, vals.join(","))`
(nebo uprav `addValuesToMeta` na pole), `onRemove` = `removeTag(category, value)`,
`values` = `meta.tags[category] ?? []`. Smaž lokální `drafts` stav, který už
drží `TagValueInput` interně.

**Verify**: `pnpm exec tsc --noEmit` → 0; ručně: ve wizardu (popup i /upload) čárka i Enter přidají štítek.

### Step 4: Použít v `media-upload-form.tsx`
Nahraď `TagCategoryInput` za `TagValueInput` (tím se i sem doplní čárka-při-psaní,
která tu chyběla). `values`/`onAdd`/`onRemove` napoj na stávající `tags` stav
(`setCategoryValues`).

**Verify**: `pnpm exec tsc --noEmit` 0; `pnpm test` zelené; `pnpm run build` 0; `pnpm run lint` 0.

## Test plan
- (Doporučeno) `app/src/components/admin/tag-value-input.test.tsx`
  (`// @vitest-environment jsdom`, vzor = `src/components/FilterBar.test.tsx`):
  - napsání „a," zavolá `onAdd(["a"])`,
  - Enter s „b,c" zavolá `onAdd(["b","c"])`,
  - klik na „×" u chipu zavolá `onRemove(value)`.
- Existující snapshot testy (`design-tokens`) se nesmí rozbít; pokud se render
  `MediaCard`/`NotificationBanner` nezměnil, snapshoty zůstávají.
- Verifikace: `pnpm test` → vše zelené.

## Done criteria
- [ ] `tag-value-input.tsx` existuje a je použitý ve všech 3 místech
- [ ] `grep -rn "TagCategoryInput\|CategoryTagInput" app/src` → 0 (staré komponenty smazány)
- [ ] čárka-při-psaní funguje i v `media-upload-form` (dřív chyběla)
- [ ] `pnpm exec tsc --noEmit` 0, `pnpm test` 0, `pnpm run build` 0, `pnpm run lint` 0
- [ ] žádný soubor mimo In-scope změněn
- [ ] `advisor-plans/README.md` řádek 014 aktualizován

## STOP conditions
- Některý ze tří souborů nevypadá jako „Current state" (drift) → STOP.
- Sjednocení by si vynutilo měnit server akce nebo `tag-service` → STOP
  (komponenta je čistě prezentační).
- Po náhradě přestane fungovat batch režim (lightbox „Uložit") nebo immediate
  (admin list) → STOP a nahlas (rozdíl je v `onAdd`/`onRemove` rodiče, ne v komponentě).

## Maintenance notes
- Po sjednocení jakákoli změna chování štítkového vstupu (např. povolit i
  středník jako oddělovač) žije na jednom místě.
- Reviewer ať ověří, že všechny tři kontexty (lightbox edit, wizard, upload form)
  nadále přidávají Enterem i čárkou a že chipy mají `--radius-sm` (ne pilulka).
