# Implementation Plan: MMMRED Streaming Dashboard

## Overview

Implementační plán převádí design do inkrementálních kódovacích kroků pro Next.js 15 (App Router) + TypeScript, Prisma/PostgreSQL, Tailwind v4 a Google Drive/Stripe integrace. Postup je „čisté jádro nejdřív": nejprve sdílené typy a datový model, pak I/O-prosté logické jádro každé služby (přímo testovatelné), na něj navázané property-based testy (knihovna **fast-check**, **min. 100 iterací**, tagované odkazem na vlastnost), a teprve nakonec route handlery, middleware, UI a integrační dráty. Každý krok staví na předchozím a vše se nakonec propojí; nezůstává žádný osamocený kód.

Konvence testů (dle Testing Strategy v designu):
- Každá korektnostní vlastnost (Property 1–42) je implementována **jediným** property-based testem přes `fc.assert(property, { numRuns: 100 })` (min. 100 iterací).
- Každý property test nese tag-komentář ve formátu:
  `// Feature: mmmred-streaming-dashboard, Property {číslo}: {text vlastnosti}`
- Testovací sub-tasky označené `*` jsou volitelné (lze přeskočit pro rychlejší MVP), ale jsou zahrnuty v grafu závislostí.

## Tasks

- [x] 1. Inicializace projektu a sdílené typy
  - [x] 1.1 Založit Next.js 15 projekt a nástrojový řetězec
    - Inicializovat Next.js 15 App Router + TypeScript v podsložce `app/`
    - Nastavit Tailwind CSS v4 s `@theme` tokeny z `design-system-netflix` (pure-black canvas, akcent `#e50914`, Inter)
    - Přidat a nakonfigurovat `vitest` a `fast-check`; přidat skript pro testy v `--run` režimu
    - Vytvořit adresářovou strukturu `src/services`, `src/lib`, `src/app`, `tests`
    - _Requirements: 1.3_

  - [x] 1.2 Definovat sdílené typy a `Result<T, E>`
    - Implementovat typ `Result<T, E>` (success/failure) používaný všemi službami
    - Definovat doménové typy: `Role`, `AccountStatus`, `MediaType`, `MediaStatus`, `TagCategory` a `FIXED_CATEGORIES` (6 fixních kategorií)
    - Definovat chybové typy (`AuthError`, `MediaError`, `UploadError`, `TagError`, `DriveError`, …)
    - _Requirements: 3.1, 7.1_

- [x] 2. Datový model a perzistence
  - [x] 2.1 Vytvořit Prisma schema a migraci
    - Definovat modely User, Session, ModelProfile, MediaItem, TagValue, MediaTag, Collection, CollectionItem, Subscription
    - Definovat singletony/konfiguraci: Notification, PageVisibility, AppConfig (`PAYMENTS_ENABLED` default `false`), WebhookEvent [POST-MVP]
    - Vynutit invarianty: unikátní `email`, unikátní `TagValue.normalizedValue` v rámci `category`, role default `User`, `subscriptionStatus` default `inactive`
    - Vygenerovat migraci a Prisma client
    - _Requirements: 3.1, 3.2, 7.1, 7.4, 20.7, 21.3_

- [x] 3. Sdílená validační jádra
  - [x] 3.1 Implementovat čisté validační funkce
    - `validateEmail` (formát local@domain, délka 5–254), `validatePassword` (8–128)
    - Validátory: jméno modelu (1–100), bio (0–1000), text oznámení (1–500), název kolekce (1–100), pole profilu (povinné neprázdné, ≤255)
    - `isValidUrl` pro Telegram cíl (neprázdný řetězec s platným formátem URL)
    - _Requirements: 2.1, 2.7, 4.1, 4.2, 4.3, 14.6, 17.3, 18.2, 19.3_

  - [x]* 3.2 Napsat unit testy validačních jader
    - Hraniční délky (5/254, 8/128, 0/1/100/101, 0/1000/1001, 0/1/500/501, 255/256)
    - _Requirements: 2.7, 4.2, 4.3, 17.3, 18.2_

- [x] 4. Auth_Service
  - [x] 4.1 Implementovat autentizační jádro
    - `register` (default role User, default subscription inactive, hash hesla `argon2id`), `login` (DB session, expirace 30 min inaktivity), `logout`, `changePassword`
    - `isLockedOut` (5 chybných pokusů → 15 min blok), unikátnost e-mailu (case-insensitive)
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.8, 3.1, 3.2, 18.3, 18.4, 18.5, 20.7_

  - [x]* 4.2 Napsat property test pro validaci registračního vstupu
    - **Property 7: Validace registračního vstupu**
    - **Validates: Requirements 2.1, 2.7**

  - [x]* 4.3 Napsat property test pro výchozí roli nového účtu
    - **Property 8: Nový účet má právě jednu výchozí roli User**
    - **Validates: Requirements 3.1, 3.2**

  - [x]* 4.4 Napsat property test pro unikátnost e-mailu
    - **Property 9: Unikátnost e-mailu při registraci**
    - **Validates: Requirements 2.2**

  - [x]* 4.5 Napsat property test pro hashování hesel
    - **Property 10: Hesla jsou uložena pouze jako hash**
    - **Validates: Requirements 2.6**

  - [x]* 4.6 Napsat property test pro round-trip přihlášení/odhlášení
    - **Property 11: Round-trip přihlášení a odhlášení**
    - **Validates: Requirements 2.5**

  - [x]* 4.7 Napsat property test pro blokaci po neúspěšných pokusech
    - **Property 12: Blokace po opakovaných neúspěšných pokusech**
    - **Validates: Requirements 2.8**

  - [x]* 4.8 Napsat property test pro změnu hesla
    - **Property 38: Změna hesla respektuje stávající heslo a délku**
    - **Validates: Requirements 18.3, 18.4, 18.5**

  - [x]* 4.9 Napsat unit testy pro generickou chybu přihlášení
    - Nesprávná kombinace → odmítnutí bez prozrazení pole
    - _Requirements: 2.3, 2.4_

- [x] 5. Access_Middleware (čistá rozhodovací funkce)
  - [x] 5.1 Implementovat `decideAccess`
    - Pořadí vyhodnocení: veřejná cesta → autentizace → stav účtu → inaktivita → page visibility → role → (post-MVP) předplatné
    - Výstupy `allow | redirectSignIn | redirectPaywall | deny401 | deny403 | deny404` s `callbackUrl`; mód čte `PAYMENTS_ENABLED`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.3, 9.6, 15.3, 15.4, 16.3, 20.6, 21.1, 21.2, 21.3, 21.4, 21.5_

  - [-]* 5.2 Napsat property test pro dostupnost veřejných cest
    - **Property 1: Pouze veřejné cesty jsou dostupné bez autentizace**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [-]* 5.3 Napsat property test pro zachování cílové adresy
    - **Property 2: Neautentizovaný přístup zachová cílovou adresu pro návrat**
    - **Validates: Requirements 21.4**

  - [x]* 5.4 Napsat property test pro respektování role
    - **Property 3: Přístup respektuje roli a nikdy neprozradí obsah mimo roli**
    - **Validates: Requirements 1.4, 1.5, 3.3, 9.6**

  - [x]* 5.5 Napsat property test pro vypršení relace a revokaci
    - **Property 4: Vypršení relace, zablokování a revokace**
    - **Validates: Requirements 1.6, 15.3, 15.4**

  - [x]* 5.6 Napsat property test pro platební režim z přepínače
    - **Property 5: Platební režim je deterministicky odvozen z přepínače**
    - **Validates: Requirements 20.6, 21.1, 21.2, 21.3, 21.5**

- [x] 6. Checkpoint — autentizace a přístup
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Media_Service
  - [x] 7.1 Implementovat jádro správy médií
    - `classifyType` (foto: JPEG/PNG/WebP; video: MP4/MOV/WebM; jinak null), `validateUpload` (podporovaný formát + ≤500 MB)
    - `isApproved` (published && publishAt<=now), stavové přechody (`schedulePublish`, `publishNow`, `hide`, `delete` s hard-delete a úklidem kolekcí), guardy plánování/publikace
    - Pohledy dostupné uživatelům vrací výhradně Approved_Media; Preview řazeno sestupně dle času zveřejnění
    - _Requirements: 5.2, 5.3, 8.1, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 10.1, 10.2, 13.4_

  - [x]* 7.2 Napsat property test pro klasifikaci typu média
    - **Property 15: Klasifikace typu média podle formátu**
    - **Validates: Requirements 5.2**

  - [x]* 7.3 Napsat property test pro validaci nahrávaného souboru
    - **Property 16: Validace nahrávaného souboru**
    - **Validates: Requirements 5.3**

  - [x]* 7.4 Napsat property test pro viditelnost pouze Approved_Media
    - **Property 17: Viditelná jsou výhradně Approved_Media**
    - **Validates: Requirements 8.1, 8.4, 9.1, 10.2, 13.4**

  - [x]* 7.5 Napsat property test pro řazení Preview
    - **Property 18: Preview řadí Approved_Media sestupně dle času zveřejnění**
    - **Validates: Requirements 10.1**

  - [x]* 7.6 Napsat property test pro guardy plánování a publikace
    - **Property 20: Guardy plánování a publikace**
    - **Validates: Requirements 8.5, 8.6**

  - [x]* 7.7 Napsat property test pro trvalé smazání včetně kolekcí
    - **Property 21: Trvalé smazání odstraní záznam i z kolekcí**
    - **Validates: Requirements 9.2, 9.3**

  - [x]* 7.8 Napsat unit testy pro ruční publikaci, potvrzení smazání a selhání operací
    - _Requirements: 8.3, 9.4, 9.5_

- [x] 8. Scheduler
  - [x] 8.1 Implementovat plánovač publikace
    - Přechod SCHEDULED→PUBLISHED pro média s `publishAt <= now`; interní endpoint spouštěný cronem každou minutu
    - _Requirements: 8.2_

  - [x]* 8.2 Napsat property test pro plánovač
    - **Property 19: Plánovač publikuje právě dosažená média**
    - **Validates: Requirements 8.2**

- [x] 9. Drive_Connector a streamování
  - [x] 9.1 Implementovat streamovací tokeny a proxy
    - `issueStreamingToken` (podepsaný, exp ≤ now+300 s), `verifyStreamingToken` (uspěje právě když now<=exp)
    - Serializace mediálních odpovědí bez `driveFileId` a bez drive domény; neautorizovaný požadavek nevygeneruje token
    - Proxy stream přes Service Account; klientovi se nikdy nepošle trvalý odkaz
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 9.2 Napsat property test pro platnost streamovacího tokenu
    - **Property 22: Streamovací token má omezenou platnost a chrání zdroj**
    - **Validates: Requirements 6.1, 6.5**

  - [x]* 9.3 Napsat property test pro ochranu zdroje a neautorizovaný přístup
    - **Property 23: Neautorizovaný požadavek nevygeneruje token a zdroj se neodhalí**
    - **Validates: Requirements 6.2, 6.4**

- [x] 10. Checkpoint — média a streamování
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Tag_Service
  - [x] 11.1 Implementovat jádro štítků
    - `normalize` (trim + case-insensitive), `upsertValue` (uloží novou 1–100 hodnotu, deduplikuje existující), `isValidCategory` (jen 6 fixních), limit 1–50 hodnot v kategorii na médium
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 11.2 Napsat property test pro pevnou množinu kategorií
    - **Property 24: Množina kategorií je pevná a neměnná**
    - **Validates: Requirements 7.1, 7.7**

  - [x]* 11.3 Napsat property test pro upsert hodnoty štítku
    - **Property 25: Upsert hodnoty štítku normalizuje a deduplikuje**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x]* 11.4 Napsat property test pro limit hodnot v kategorii
    - **Property 26: Limit počtu hodnot v kategorii na jedno médium**
    - **Validates: Requirements 7.6**

- [x] 12. Filter_Service a masonry logika
  - [x] 12.1 Implementovat aplikaci filtrů a nabídku filtrů
    - `apply` (OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = všechna Approved_Media)
    - Sestavení nabídky kategorií: zobrazí jen kategorie s alespoň jednou hodnotou a všechny jejich hodnoty
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x]* 12.2 Napsat property test pro logiku filtrů
    - **Property 27: Filtr — OR uvnitř kategorie, AND napříč kategoriemi, prázdný výběr = vše**
    - **Validates: Requirements 11.3, 11.4, 11.5**

  - [x]* 12.3 Napsat property test pro nabídku filtrů
    - **Property 28: Nabídka filtrů odpovídá dostupným hodnotám**
    - **Validates: Requirements 11.1, 11.2**

  - [x] 12.4 Implementovat masonry a stránkování (čisté funkce)
    - `columnsForWidth` (1 / 2–4 / 5 dle hranic 600/1200 px), `paginate` (dávky ≤24, bez duplicit a mezer, korektní konec)
    - _Requirements: 12.1, 12.2, 12.6_

  - [x]* 12.5 Napsat property test pro počet sloupců masonry
    - **Property 29: Počet sloupců masonry podle šířky viewportu**
    - **Validates: Requirements 12.1**

  - [x]* 12.6 Napsat property test pro stránkování
    - **Property 30: Stránkování donačítá bez překryvů a korektně končí**
    - **Validates: Requirements 12.2, 12.6**

- [x] 13. Model_Service
  - [x] 13.1 Implementovat správu profilů modelů
    - CRUD profilů s validací jména (1–100) a bio (0–1000); neplatný vstup zachová původní stav; galerie vrací výhradně Approved_Media; chyba u neexistujícího profilu/modelu
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 13.4, 13.6_

  - [x]* 13.2 Napsat property test pro round-trip profilu modelu
    - **Property 13: Round-trip uložení a editace profilu modelu**
    - **Validates: Requirements 4.1, 4.4**

  - [x]* 13.3 Napsat property test pro neplatný vstup profilu
    - **Property 14: Neplatný vstup profilu zachová původní stav**
    - **Validates: Requirements 4.2, 4.3, 4.5**

  - [x]* 13.4 Napsat unit testy pro prázdné stavy stránky Models
    - Placeholder bez fotky, prázdný seznam modelů, prázdná galerie, neexistující model
    - _Requirements: 13.2, 13.3, 13.5_

- [x] 14. Collection_Service
  - [x] 14.1 Implementovat privátní kolekce
    - Vytvoření s validací názvu (1–100), idempotentní přidání pouze Approved_Media, odebrání přítomného média, přístup pouze vlastníkovi (403 jinak), guardy členství
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x]* 14.2 Napsat property test pro round-trip členství v kolekci
    - **Property 31: Round-trip přidání a odebrání média v kolekci**
    - **Validates: Requirements 14.2, 14.3**

  - [x]* 14.3 Napsat property test pro přístup vlastníka ke kolekci
    - **Property 32: Kolekce je přístupná pouze vlastníkovi**
    - **Validates: Requirements 14.1, 14.4, 14.5**

  - [x]* 14.4 Napsat property test pro validaci názvu kolekce
    - **Property 33: Validace názvu kolekce**
    - **Validates: Requirements 14.6**

  - [x]* 14.5 Napsat property test pro guardy členství
    - **Property 34: Guardy členství v kolekci**
    - **Validates: Requirements 14.7, 14.8**

- [x] 15. Notification_Service
  - [x] 15.1 Implementovat oznamovací banner
    - Validace textu (1–500), singleton (nejvýše jeden aktivní), aktivace nahradí předchozí text, deaktivace, doručení aktuálního textu novým relacím
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x]* 15.2 Napsat property test pro validaci a singleton banneru
    - **Property 35: Validace a singleton oznamovacího banneru**
    - **Validates: Requirements 17.1, 17.3, 17.5**

  - [x]* 15.3 Napsat property test pro round-trip a doručení oznámení
    - **Property 36: Round-trip aktivace/deaktivace a doručení novým relacím**
    - **Validates: Requirements 17.2, 17.4**

- [x] 16. Page_Visibility_Service
  - [x] 16.1 Implementovat perzistentní viditelnost sekcí
    - Mapa `section → hidden`, round-trip skrytí/zobrazení, perzistence napříč relacemi; integrace s `decideAccess` pro 404
    - _Requirements: 16.1, 16.2, 16.5_

  - [x]* 16.2 Napsat property test pro skrytou sekci a perzistenci
    - **Property 6: Globálně skrytá sekce vrací 404 a stav přetrvává**
    - **Validates: Requirements 16.2, 16.3, 16.5**

  - [x]* 16.3 Napsat unit test pro selhání uložení viditelnosti
    - Zachování předchozího stavu + chyba adminovi
    - _Requirements: 16.4_

- [x] 17. Checkpoint — doménové služby
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Nastavení profilu (Settings) a Telegram
  - [x] 18.1 Implementovat uložení profilu v Settings
    - Uložení platných hodnot, odmítnutí neplatného pole se zachováním původních hodnot
    - _Requirements: 18.1, 18.2_

  - [x]* 18.2 Napsat property test pro uložení profilu a validaci polí
    - **Property 37: Round-trip uložení profilu a validace polí**
    - **Validates: Requirements 18.1, 18.2**

  - [x] 18.3 Implementovat resolver přesměrování na Telegram
    - Přesměrování právě když je URL neprázdný řetězec s platným formátem; jinak chyba o nedostupném cíli; otevření v nové záložce
    - _Requirements: 19.1, 19.2, 19.3_

  - [x]* 18.4 Napsat property test pro přesměrování na Telegram
    - **Property 39: Přesměrování na Telegram dle platnosti URL**
    - **Validates: Requirements 19.1, 19.3**

- [x] 19. Subscription_Service [POST-MVP]
  - [x] 19.1 Implementovat zpracování předplatného a webhooků
    - Ověření podpisu/původu webhooku; přechody stavu (úspěch→aktivní, selhání/vypršení→neaktivní); odmítnutí neověřeného webhooku s audit logem; výchozí neaktivní stav nového účtu; admin manuální změna stavu
    - _Requirements: 20.3, 20.4, 20.5, 20.7, 20.9_

  - [x]* 19.2 Napsat property test pro přechody stavu z ověřených webhooků
    - **Property 40: Přechody stavu předplatného z ověřených webhooků**
    - **Validates: Requirements 20.3, 20.4**

  - [x]* 19.3 Napsat property test pro neověřitelný webhook
    - **Property 41: Neověřitelný webhook nemění stav**
    - **Validates: Requirements 20.5**

  - [x]* 19.4 Napsat property test pro výchozí neaktivní předplatné
    - **Property 42: Nový účet má výchozí neaktivní předplatné**
    - **Validates: Requirements 20.7**

- [x] 20. Frontend komponenty (Netflix-style)
  - [x] 20.1 Implementovat AppShell (SideNav + TopNav)
    - Navigace jen pro přihlášené; skryté sekce se nezobrazí; design tokeny `--color-deep-space`, akcent `--color-netflix-red`
    - _Requirements: 3.4, 16.1, 16.2_

  - [x] 20.2 Implementovat MasonryGrid a MediaCard
    - Responzivní sloupce (1/2–4/5), rezervace místa dle poměru stran (CLS ≤ 0,1), infinite scroll s indikátorem načítání a koncem seznamu, chybový stav s opakováním
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 20.3 Implementovat FilterBar a stránku Search
    - Multi-select per kategorie, prázdný stav výsledků, **žádné fulltextové pole**
    - _Requirements: 11.1, 11.6, 11.7, 11.8_

  - [x] 20.4 Implementovat Html5Player napojený na Streaming_URL
    - Přehrávání foto/videa přes proxy Streaming_URL v HTML5 přehrávači
    - _Requirements: 6.6_

  - [x] 20.5 Implementovat NotificationBanner, ModelCard/ModelDetail a Preview
    - Globální banner, artist page modelu, nástěnka Preview
    - _Requirements: 10.1, 13.1, 13.4, 17.1_

  - [x] 20.6 Implementovat administrátorská rozhraní (Admin_Console)
    - Formuláře pro upload, tagging, scheduling, správu uživatelů, viditelnost stránek a oznámení; přehled uživatelů s rolí a stavem
    - _Requirements: 4.1, 5.1, 7.2, 8.1, 15.1, 15.2, 15.5, 16.1, 17.1_

  - [x]* 20.7 Napsat UI/komponentní testy
    - Snapshot design tokenů, absence fulltextového pole (R11.8), HTML5 player + proxy URL (R6.3, R6.6)
    - _Requirements: 6.3, 6.6, 11.8_

- [x] 21. Propojení — middleware, route handlery a server actions
  - [x] 21.1 Vytvořit `middleware.ts` a serverovou helper vrstvu
    - Napojit `decideAccess` na příchozí požadavky (redirecty pro stránky, 401/403/404 pro API), čtení `PAYMENTS_ENABLED`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 3.3, 16.3, 21.1, 21.4, 21.5_

  - [x] 21.2 Vytvořit route handlery a server actions pro služby
    - Auth, média, upload (Drive transakce + rollback), filtry, modely, kolekce, oznámení, viditelnost, settings, telegram; mapování `Result` na HTTP odpovědi
    - _Requirements: 2.5, 5.1, 5.4, 5.6, 6.1, 9.4, 11.6, 14.5, 15.1, 17.1, 18.1, 19.1_

  - [x] 21.3 Vytvořit cron endpoint pro Scheduler a webhook endpoint pro Stripe [POST-MVP]
    - Endpoint spouštěný každou minutu volá plánovač; ověřený webhook endpoint pro Stripe
    - _Requirements: 8.2, 20.3, 20.4, 20.5_

  - [x]* 21.4 Napsat integrační testy (mock Google Drive / Stripe)
    - Reprezentativní scénáře uploadu (úspěch, timeout 120 s, selhání autentizace), ověření/odmítnutí webhooku
    - _Requirements: 5.1, 5.4, 5.6, 20.1, 20.2_

- [x] 22. Závěrečný checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP; nejsou implementovány v běžném běhu, ale jsou zahrnuty v grafu závislostí.
- Každý task odkazuje na konkrétní (sub-)požadavky kvůli sledovatelnosti.
- Property testy (fast-check, min. 100 iterací, tagované) ověřují univerzální korektnostní vlastnosti; unit/integration testy pokrývají EXAMPLE/EDGE/INTEGRATION kritéria z designu.
- Požadavek 20 a části požadavku 21 jsou [POST-MVP]; logika je přítomna, ale vynucení platební bariéry řídí přepínač `PAYMENTS_ENABLED` (default `false`).
- Checkpointy zajišťují inkrementální ověření.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "5.1", "7.1", "9.1", "11.1", "12.1", "12.4", "13.1", "14.1", "15.1", "16.1", "18.1", "18.3", "19.1"] },
    { "id": 4, "tasks": ["8.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "5.2", "5.3", "5.4", "5.5", "5.6", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "9.2", "9.3", "11.2", "11.3", "11.4", "12.2", "12.3", "12.5", "12.6", "13.2", "13.3", "13.4", "14.2", "14.3", "14.4", "14.5", "15.2", "15.3", "16.2", "16.3", "18.2", "18.4", "19.2", "19.3", "19.4"] },
    { "id": 5, "tasks": ["8.2", "20.1", "20.2", "20.3", "20.4", "20.5", "20.6"] },
    { "id": 6, "tasks": ["20.7", "21.1", "21.2", "21.3"] },
    { "id": 7, "tasks": ["21.4"] }
  ]
}
```
