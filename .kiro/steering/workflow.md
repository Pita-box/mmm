---
inclusion: always
---

# Workflow stavění aplikace (MMM-collections)

Závazný cyklus pro každou větší práci na aplikaci. Tři fáze, opakují se dokola:

```
1) IMPROVE  → plánování      (read-only, vytvoří plány)
2) PONYTAIL → kódování       (minimální funkční kód podle plánu)
3) IMPROVE  → audit          (zkontroluje hotovou práci) → zpět na 1)
```

## Pravidlo nápovědy (DŮLEŽITÉ)

Uživatel si on-demand příkazy nepamatuje. Proto na začátku KAŽDÉ fáze a vždy,
když nabízím další krok, MUSÍM vypsat doporučené příkazy té fáze (krátce, s
popisem). Nikdy nepředpokládej, že je uživatel zná.

## Fáze 1 — IMPROVE (plánování)

Doporučené příkazy:
- `improve`               — plný audit → nálezy → plány
- `improve quick`         — rychlý levný průchod (jen hotspoty)
- `improve deep`          — vyčerpávající
- `improve plan <popis>`  — naplánuj jednu konkrétní věc (bez auditu)
- `improve next`          — návrhy funkcí / směr projektu
- `improve review-plan <soubor>` — zkritizuj a utáhni existující plán

## Fáze 2 — PONYTAIL (kódování)

Doporučené příkazy:
- `ponytail`        — zapni líný režim (výchozí úroveň full)
- `ponytail lite`   — postav zadané, jen zmiň línější variantu
- `ponytail full`   — žebřík vynucen, nejkratší diff (výchozí)
- `ponytail ultra`  — YAGNI extrém
- `stop ponytail`   — vypnutí

Kóduje se podle plánu z fáze 1. Plán je zdroj pravdy.

## Fáze 3 — IMPROVE (audit)

Doporučené příkazy:
- `improve`             — audit celého repozitáře
- `improve branch`      — audit jen změn aktuální větve
- `improve execute <plan>` — nech levnějšího executora dokončit plán a zreviduj
- `improve reconcile`   — obnov backlog (ověř hotové, odblokuj, vyřaď)

Po auditu se vracíme do fáze 1 s novými nálezy.

## Design

Když se staví Netflix-style / tmavé prémiové UI, aktivuje se skill
`design-system-netflix` (tokeny, komponenty, do/don'ts).
