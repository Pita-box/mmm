# Requirements Document

## Introduction

MMMRED je privátní webová aplikace (SPA/SSR, Next.js App Router) pro sdílení a streamování autorských kolekcí fotografií a videí. Aplikace je v uzavřeném režimu — veškerý obsah kromě přihlašovacích stránek a Paywallu je za autentizační bariérou. Existují dvě role: Admin (kompletní správa platformy a obsahu) a User (prohlížení schváleného obsahu a tvorba vlastních privátních kolekcí).

Média jsou fyzicky uložena na Google Drive a nikdy nejsou veřejně linkována — backend generuje časově omezené streamovací URL. Obsah je organizován kolem "profilů modelů" a štítkovacího systému s pevně danými kategoriemi a dynamickými hodnotami. Vyhledávání probíhá výhradně přes kombinaci chytrých filtrů (žádný fulltext).

Předplatné (Stripe, 5 USD/měsíc) je vědomě zařazeno jako **poslední krok po dokončení MVP**. Požadavky na předplatné jsou v tomto dokumentu označeny jako **[POST-MVP]** a v MVP fázi je platební brána vypnutá/odložená — uživatelé s ověřeným účtem mají v MVP přístup k obsahu bez platební bariéry.

Tento dokument definuje rozsah pomocí EARS vzorů a INCOSE kvalitativních pravidel. Vizuální styl aplikace vychází z Netflix-style tmavého prémiového designu (řízeno steeringem `design-system-netflix`).

## Glossary

- **MMMRED_System**: Celá webová aplikace MMMRED (frontend i backend) jako celek.
- **Auth_Service**: Komponenta odpovědná za registraci, přihlašování, odhlašování a správu relací.
- **Access_Middleware**: Serverová vrstva, která vyhodnocuje autentizaci a (post-MVP) stav předplatného před přístupem k chráněným stránkám a API.
- **Media_Service**: Komponenta spravující záznamy médií, jejich metadata a stav zveřejnění.
- **Drive_Connector**: Komponenta integrující Google Drive API a generující časově omezené streamovací URL.
- **Tag_Service**: Komponenta spravující pevné kategorie štítků a jejich dynamické hodnoty.
- **Filter_Service**: Komponenta vyhodnocující chytré filtry nad médii.
- **Model_Service**: Komponenta spravující profily modelů (jméno, bio, galerie).
- **Collection_Service**: Komponenta spravující privátní uživatelské kolekce (playlisty).
- **Admin_Console**: Administrátorská rozhraní pro správu obsahu, uživatelů, stránek a oznámení.
- **Notification_Service**: Komponenta spravující globální oznamovací banner.
- **Page_Visibility_Service**: Komponenta řídící globální skrytí/zobrazení sekcí webu.
- **Scheduler**: Komponenta spravující plánované zveřejnění médií.
- **Subscription_Service**: Komponenta integrující Stripe a spravující stav předplatného. **[POST-MVP]**
- **Admin**: Uživatel s rolí administrátora a plnými oprávněními.
- **User**: Registrovaný uživatel s rolí běžného člena.
- **Media_Item**: Jeden mediální záznam (foto nebo video) s referencí na soubor v Google Drive, referencí na model a polem štítků.
- **Model_Profile**: Profil modelu obsahující jméno a krátké bio, ke kterému jsou přiřazena média.
- **Tag_Category**: Pevně daná kategorie štítku (Category, Face type, Body type, Body hair, Hair color, Clothes).
- **Tag_Value**: Dynamická hodnota v rámci kategorie (např. "blue eyes" v kategorii Face type).
- **Collection**: Privátní uživatelská kolekce (playlist) sestavená z dostupných médií.
- **Paywall**: Veřejně dostupná stránka informující o nutnosti předplatného. **[POST-MVP]**
- **Approved_Media**: Médium ve stavu zveřejněno (publikováno, neskryté, po naplánovaném čase).
- **Streaming_URL**: Časově omezená, podepsaná URL pro přehrání/zobrazení média v HTML5 přehrávači.

## Requirements

### Requirement 1: Uzavřený režim a řízení přístupu

**User Story:** Jako provozovatel platformy chci, aby byl veškerý obsah dostupný jen přihlášeným, abych udržel platformu privátní.

#### Acceptance Criteria

1. WHEN neautentizovaný návštěvník požádá o jakoukoli stránku kromě veřejných stránek Sign In, Sign Up a Paywall, THE Access_Middleware SHALL přesměrovat návštěvníka na stránku Sign In a nevrátit obsah požadované stránky.
2. WHEN neautentizovaný návštěvník požádá o jakýkoli chráněný API endpoint s médii, THE Access_Middleware SHALL odpovědět stavovým kódem 401 a nevrátit v těle odpovědi žádná mediální data.
3. THE MMMRED_System SHALL ponechat veřejně dostupné výhradně stránky Sign In, Sign Up a Paywall a všechny ostatní stránky i API endpointy považovat za chráněné.
4. WHILE je uživatel přihlášen, THE Access_Middleware SHALL umožnit přístup ke stránkám a endpointům přiřazeným jeho roli.
5. IF přihlášený uživatel požádá o stránku nebo endpoint nepřiřazený jeho roli, THEN THE Access_Middleware SHALL přístup odepřít a vrátit indikaci nedostatečného oprávnění bez zpřístupnění chráněného obsahu.
6. WHEN platnost relace přihlášeného uživatele vyprší po 30 minutách nečinnosti, THE Access_Middleware SHALL považovat následný požadavek za neautentizovaný a přesměrovat návštěvníka na stránku Sign In.

### Requirement 2: Registrace a autentizace uživatelů

**User Story:** Jako návštěvník chci si vytvořit účet a přihlásit se, abych získal přístup k obsahu.

#### Acceptance Criteria

1. WHEN návštěvník odešle registrační formulář s e-mailem ve formátu místní-část@doména o délce 5 až 254 znaků a s heslem o délce 8 až 128 znaků, THE Auth_Service SHALL vytvořit uživatelský účet s rolí User.
2. IF e-mail při registraci již existuje, THEN THE Auth_Service SHALL odmítnout registraci, nevytvořit nový účet a zobrazit chybovou zprávu označující, že zadaný e-mail je již registrován.
3. WHEN uživatel odešle přihlašovací formulář se správnou kombinací e-mailu a hesla, THE Auth_Service SHALL vytvořit autentizovanou relaci, která vyprší po 30 minutách nečinnosti.
4. IF uživatel odešle přihlašovací formulář s nesprávnou kombinací e-mailu a hesla, THEN THE Auth_Service SHALL odmítnout přihlášení, nevytvořit relaci a zobrazit chybovou zprávu označující neúspěšné přihlášení bez upřesnění, které pole je nesprávné.
5. WHEN přihlášený uživatel zvolí odhlášení, THE Auth_Service SHALL ukončit autentizovanou relaci.
6. THE Auth_Service SHALL ukládat hesla pouze v podobě kryptografického hashe.
7. IF návštěvník odešle registrační formulář s e-mailem mimo formát místní-část@doména nebo mimo délku 5 až 254 znaků, nebo s heslem mimo délku 8 až 128 znaků, THEN THE Auth_Service SHALL odmítnout registraci, nevytvořit účet a zobrazit chybovou zprávu označující neplatné pole.
8. IF uživatel zadá nesprávnou kombinaci e-mailu a hesla 5krát po sobě, THEN THE Auth_Service SHALL dočasně zablokovat další pokusy o přihlášení daného účtu na dobu 15 minut.

### Requirement 3: Řízení rolí a oprávnění

**User Story:** Jako provozovatel chci oddělit oprávnění Admina a Usera, aby běžní uživatelé nemohli spravovat platformu.

#### Acceptance Criteria

1. THE MMMRED_System SHALL přiřadit každému účtu právě jednu roli z množiny {Admin, User} a nesmí povolit stav, kdy účet nemá žádnou roli nebo má více než jednu roli.
2. WHEN je vytvořen nový účet, THE MMMRED_System SHALL přiřadit tomuto účtu výchozí roli User.
3. IF uživatel s rolí User požádá o administrátorskou stránku nebo administrátorský API endpoint, THEN THE Access_Middleware SHALL požadavek odmítnout se stavovým kódem 403, nesmí provést žádnou požadovanou administrátorskou operaci, nesmí změnit žádná data a SHALL vrátit volajícímu indikaci odepření přístupu.
4. WHERE je uživatel přihlášen s rolí Admin, THE MMMRED_System SHALL zpřístupnit rozhraní Admin_Console.

### Requirement 4: Správa profilů modelů

**User Story:** Jako Admin chci nejprve vytvořit profil modelu, abych pak mohl k modelu přiřazovat média.

#### Acceptance Criteria

1. WHEN Admin odešle formulář pro vytvoření profilu modelu s jménem o délce 1 až 100 znaků a s volitelným bio o délce 0 až 1000 znaků, THE Model_Service SHALL vytvořit Model_Profile s uloženými hodnotami jména a bio.
2. IF Admin odešle formulář pro vytvoření profilu modelu s prázdným jménem nebo se jménem delším než 100 znaků, THEN THE Model_Service SHALL odmítnout vytvoření, nevytvořit žádný Model_Profile a vrátit chybovou zprávu označující neplatné jméno.
3. IF Admin odešle formulář pro vytvoření profilu modelu s bio delším než 1000 znaků, THEN THE Model_Service SHALL odmítnout vytvoření, nevytvořit žádný Model_Profile a vrátit chybovou zprávu označující překročení délky bio.
4. WHEN Admin upraví jméno na hodnotu o délce 1 až 100 znaků nebo bio na hodnotu o délce 0 až 1000 znaků u existujícího profilu modelu, THE Model_Service SHALL uložit aktualizované hodnoty.
5. IF Admin upraví existující profil modelu na prázdné jméno, jméno delší než 100 znaků nebo bio delší než 1000 znaků, THEN THE Model_Service SHALL odmítnout uložení, zachovat původní hodnoty profilu a vrátit chybovou zprávu označující neplatný vstup.
6. IF Admin požádá o přiřazení média k neexistujícímu Model_Profile, THEN THE Model_Service SHALL odmítnout přiřazení a vrátit chybovou zprávu označující, že profil modelu neexistuje.

### Requirement 5: Nahrávání médií na Google Drive

**User Story:** Jako Admin chci nahrávat foto a video, aby se uložily na Google Drive a byly dostupné v aplikaci.

#### Acceptance Criteria

1. WHEN Admin nahraje soubor média ve formátu foto (JPEG, PNG, WebP) nebo video (MP4, MOV, WebM) o velikosti maximálně 500 MB a přiřadí jej k existujícímu Model_Profile, THE Drive_Connector SHALL uložit soubor na Google Drive a THE Media_Service SHALL vytvořit Media_Item s referencí na soubor a referencí na Model_Profile.
2. THE Media_Service SHALL u každého Media_Item evidovat typ média jako foto, je-li formát souboru JPEG, PNG nebo WebP, nebo jako video, je-li formát souboru MP4, MOV nebo WebM.
3. IF nahraný soubor má nepodporovaný formát nebo přesahuje velikost 500 MB, THEN THE Media_Service SHALL soubor odmítnout, Media_Item nevytvořit a vrátit chybovou zprávu označující důvod odmítnutí (nepodporovaný formát nebo překročení velikosti).
4. IF nahrání souboru na Google Drive selže nebo nedoběhne do 120 sekund, THEN THE Drive_Connector SHALL vrátit popisnou chybovou zprávu označující příčinu selhání a THE Media_Service SHALL Media_Item nevytvořit a nezanechat žádný částečně uložený záznam.
5. THE Drive_Connector SHALL se autentizovat vůči Google Drive API pomocí Service Account nebo OAuth2 s refresh tokenem.
6. IF autentizace Drive_Connector vůči Google Drive API selže, THEN THE Drive_Connector SHALL nahrávání neprovést a vrátit chybovou zprávu označující selhání autentizace.

### Requirement 6: Bezpečné streamování médií

**User Story:** Jako provozovatel chci, aby se soubory z Google Drive nikdy nelinkovaly přímo, aby nebylo možné obsah stahovat mimo aplikaci.

#### Acceptance Criteria

1. WHEN autorizovaný uživatel požádá o přehrání Media_Item, THE Drive_Connector SHALL vygenerovat Streaming_URL s dobou platnosti nejvýše 300 sekund.
2. IF o přehrání Media_Item požádá neautorizovaný uživatel, THEN THE Drive_Connector SHALL požadavek zamítnout a SHALL nevygenerovat žádnou Streaming_URL.
3. THE MMMRED_System SHALL doručovat médium klientovi výhradně přes Streaming_URL.
4. THE MMMRED_System SHALL klientovi neodhalovat trvalý odkaz na soubor v Google Drive.
5. WHEN klient přistoupí ke Streaming_URL po vypršení doby její platnosti, THE Drive_Connector SHALL přístup přes tuto URL zamítnout a SHALL vrátit chybovou odpověď indikující vypršení platnosti.
6. WHEN autorizovaný uživatel zahájí přehrávání foto nebo videa, THE MMMRED_System SHALL přehrát daný Media_Item v HTML5 přehrávači.

### Requirement 7: Dynamický štítkovací systém

**User Story:** Jako Admin chci štítkovat média podle pevných kategorií s libovolnými hodnotami, aby bylo možné obsah přesně filtrovat.

#### Acceptance Criteria

1. THE Tag_Service SHALL udržovat pevnou množinu šesti kategorií {Category, Face type, Body type, Body hair, Hair color, Clothes} a nesmí umožnit přidání, odebrání ani přejmenování žádné z těchto kategorií.
2. WHEN Admin při štítkování zadá v rámci kategorie novou hodnotu, která po odstranění počátečních a koncových mezer má délku 1 až 100 znaků a dosud v dané kategorii neexistuje (porovnání bez ohledu na velikost písmen), THE Tag_Service SHALL tuto Tag_Value uložit a zpřístupnit ji pro pozdější výběr i ve filtrech.
3. IF Admin zadá novou hodnotu, která je po odstranění počátečních a koncových mezer prázdná nebo přesahuje 100 znaků, THEN THE Tag_Service SHALL hodnotu odmítnout, neuložit žádnou Tag_Value a zobrazit chybové oznámení indikující neplatnou délku hodnoty.
4. IF Admin zadá novou hodnotu, která se v dané kategorii již vyskytuje (porovnání bez ohledu na velikost písmen), THEN THE Tag_Service SHALL místo vytvoření duplicitní Tag_Value přiřadit k Media_Item existující Tag_Value.
5. WHEN Admin při štítkování vybere existující hodnotu kategorie, THE Tag_Service SHALL přiřadit tuto Tag_Value k Media_Item.
6. THE Media_Service SHALL umožnit přiřazení jedné až padesáti různých Tag_Value v rámci jedné kategorie k jednomu Media_Item.
7. IF je proveden pokus o vytvoření kategorie mimo pevnou množinu kategorií, THEN THE Tag_Service SHALL tento pokus odmítnout, neuložit žádnou kategorii a zobrazit chybové oznámení indikující nepovolenou kategorii.

### Requirement 8: Plánované a ruční zveřejnění médií

**User Story:** Jako Admin chci naplánovat zveřejnění média na konkrétní čas, abych řídil, kdy se obsah objeví uživatelům.

#### Acceptance Criteria

1. WHEN Admin nastaví u Media_Item čas zveřejnění v budoucnosti, THE Media_Service SHALL ponechat Media_Item skryté před uživateli až do dosažení nastaveného času.
2. WHEN naplánovaný čas zveřejnění Media_Item nastane, THE Scheduler SHALL do 60 sekund od tohoto času změnit stav Media_Item na zveřejněno.
3. WHEN Admin ručně zveřejní Media_Item, THE Media_Service SHALL do 2 sekund nastavit stav Media_Item na zveřejněno.
4. THE Media_Service SHALL zobrazovat uživatelům pouze Approved_Media se stavem zveřejněno.
5. IF se Admin pokusí naplánovat nebo ručně zveřejnit Media_Item, který je již skrytý nebo smazaný, THEN THE Media_Service SHALL operaci zamítnout, ponechat stav Media_Item beze změny a zobrazit chybové hlášení indikující neplatný stav média.
6. IF Admin nastaví čas zveřejnění v minulosti nebo roven aktuálnímu času, THEN THE Media_Service SHALL nastavení zamítnout, ponechat stav Media_Item beze změny a zobrazit chybové hlášení indikující neplatný čas zveřejnění.

### Requirement 9: Skrytí a smazání médií

**User Story:** Jako Admin chci skrýt nebo smazat libovolné médium, abych spravoval dostupný obsah.

#### Acceptance Criteria

1. WHEN Admin skryje Media_Item, THE Media_Service SHALL odebrat Media_Item ze všech pohledů dostupných koncovým uživatelům do 2 sekund a SHALL zachovat záznam Media_Item v úložišti aplikace.
2. WHEN Admin potvrdí smazání Media_Item, THE Media_Service SHALL trvale odstranit záznam Media_Item z aplikace do 2 sekund.
3. WHEN Media_Service trvale odstraní Media_Item, THE Collection_Service SHALL odebrat dané Media_Item ze všech uživatelských kolekcí.
4. IF Admin zahájí smazání Media_Item, THEN THE Media_Service SHALL zobrazit potvrzovací výzvu a SHALL provést smazání pouze po explicitním potvrzení Admina.
5. IF operace skrytí nebo smazání Media_Item selže, THEN THE Media_Service SHALL zachovat původní stav Media_Item beze změny a SHALL zobrazit chybové hlášení indikující neúspěch operace.
6. IF uživatel bez role Admin se pokusí skrýt nebo smazat Media_Item, THEN THE Media_Service SHALL operaci odmítnout a SHALL zachovat stav Media_Item beze změny.

### Requirement 10: Nástěnka (Preview / Newsfeed)

**User Story:** Jako User chci na úvodní nástěnce vidět nejnověji přidaná média, abych měl přehled o novém obsahu.

#### Acceptance Criteria

1. WHEN přihlášený uživatel otevře stránku Preview, THE MMMRED_System SHALL zobrazit Approved_Media seřazená sestupně podle času zveřejnění.
2. THE MMMRED_System SHALL na stránce Preview zobrazovat výhradně Approved_Media.

### Requirement 11: Chytré filtry (Search / Browser)

**User Story:** Jako User chci hledat obsah kombinací filtrů místo fulltextu, abych přesně cílil na konkrétní vlastnosti.

#### Acceptance Criteria

1. WHEN uživatel otevře stránku Search, THE MMMRED_System SHALL pro každou Tag_Category, která má alespoň jednu aktuální Tag_Value, zobrazit multi-select výběr složený ze všech aktuálních Tag_Value dané kategorie.
2. IF Tag_Category nemá žádnou aktuální Tag_Value, THEN THE MMMRED_System SHALL tuto kategorii na stránce Search nezobrazit.
3. WHEN uživatel vybere více hodnot v rámci jedné kategorie, THE Filter_Service SHALL vrátit Approved_Media, která odpovídají alespoň jedné z vybraných hodnot dané kategorie (logika OR uvnitř kategorie).
4. WHEN uživatel vybere hodnoty ve více kategoriích, THE Filter_Service SHALL vrátit Approved_Media, která odpovídají podmínkám všech zvolených kategorií (logika AND napříč kategoriemi).
5. WHEN uživatel nevybere žádnou hodnotu, THE Filter_Service SHALL vrátit všechna Approved_Media.
6. WHEN uživatel změní výběr filtrů, THE Filter_Service SHALL aktualizovat zobrazené výsledky do 2 sekund od změny výběru.
7. IF žádné Approved_Media neodpovídá aktuálně zvolené kombinaci filtrů, THEN THE MMMRED_System SHALL zobrazit prázdný stav s indikací, že žádný obsah neodpovídá zvoleným filtrům, a zachovat aktuální výběr filtrů beze změny.
8. THE MMMRED_System SHALL nezobrazovat na stránce Search pole pro fulltextové vyhledávání.

### Requirement 12: Masonry layout a postupné načítání

**User Story:** Jako User chci procházet média v plynulém masonry gridu, abych si pohodlně prohlížel obsah různých rozměrů.

#### Acceptance Criteria

1. WHEN jsou výsledky médií načteny, THE MMMRED_System SHALL zobrazit Approved_Media v masonry mřížce, kde si každý prvek zachová poměr stran zdrojového média a počet sloupců se přizpůsobí šířce viewportu (1 sloupec pro šířku do 600 px, 2 až 4 sloupce pro šířku 600 až 1200 px, 5 sloupců pro šířku nad 1200 px).
2. WHILE uživatel posouvá stránku s výsledky a vzdálenost od konce seznamu klesne pod 600 px, THE MMMRED_System SHALL donačíst další dávku 24 Approved_Media (infinite scroll / lazy-loading) do 1 500 ms.
3. WHEN se obrázek v masonry mřížce načítá, THE MMMRED_System SHALL předem rezervovat jeho prostor podle poměru stran tak, aby kumulativní posun rozložení (CLS) v zobrazené oblasti nepřekročil hodnotu 0,1.
4. WHILE probíhá donačítání další dávky médií, THE MMMRED_System SHALL zobrazit vizuální indikátor načítání na konci seznamu.
5. IF donačtení další dávky Approved_Media selže, THEN THE MMMRED_System SHALL zachovat již zobrazená média beze změny a zobrazit chybové oznámení informující o nezdařeném načtení s možností opakovat akci.
6. WHEN již nejsou k dispozici žádná další Approved_Media k donačtení, THE MMMRED_System SHALL ukončit donačítání a zobrazit indikaci konce seznamu.

### Requirement 13: Profily modelů jako "artist page"

**User Story:** Jako User chci otevřít profil modelu a vidět jeho galerii, podobně jako stránku interpreta na Spotify.

#### Acceptance Criteria

1. WHEN přihlášený uživatel otevře stránku Models, THE Model_Service SHALL zobrazit seznam všech existujících modelů, kde každá karta obsahuje fotografii a jméno modelu.
2. IF model nemá přiřazenou profilovou fotografii, THEN THE Model_Service SHALL na kartě modelu zobrazit zástupný vizuál (placeholder) a jméno modelu.
3. IF na stránce Models neexistuje žádný model, THEN THE Model_Service SHALL zobrazit prázdný stav s textovým sdělením, že nejsou k dispozici žádní modelové.
4. WHEN uživatel otevře detail existujícího modelu, THE Model_Service SHALL zobrazit jméno modelu, jeho bio a galerii obsahující výhradně všechna Approved_Media přiřazená k danému modelu, přičemž média v jiném stavu než Approved nesmí být zobrazena.
5. IF model nemá žádné přiřazené Approved_Media, THEN THE Model_Service SHALL zobrazit jméno, bio a prázdnou galerii s textovým sdělením, že model zatím nemá žádný obsah.
6. IF uživatel otevře detail modelu, který neexistuje, THEN THE Model_Service SHALL místo detailu zobrazit chybové sdělení indikující, že model nebyl nalezen.

### Requirement 14: Privátní kolekce uživatele (playlisty)

**User Story:** Jako User chci si vytvářet vlastní privátní kolekce z dostupných médií, abych si organizoval oblíbený obsah.

#### Acceptance Criteria

1. WHEN uživatel vytvoří kolekci s názvem o délce 1 až 100 znaků, THE Collection_Service SHALL vytvořit Collection vlastněnou tímto uživatelem.
2. WHEN uživatel přidá Approved_Media, které dosud není v jeho kolekci, THE Collection_Service SHALL přidat dané Media_Item do této kolekce.
3. WHEN uživatel odebere Media_Item, které je v jeho kolekci přítomné, THE Collection_Service SHALL odebrat dané Media_Item z této kolekce.
4. THE Collection_Service SHALL zpřístupnit kolekci výhradně uživateli, který ji vlastní.
5. IF uživatel požádá o kolekci jiného uživatele, THEN THE Collection_Service SHALL odpovědět stavovým kódem 403.
6. IF uživatel vytvoří kolekci s prázdným názvem nebo názvem delším než 100 znaků, THEN THE Collection_Service SHALL vytvoření odmítnout, žádnou Collection nevytvořit a vrátit chybovou zprávu označující neplatný název.
7. IF uživatel přidá do své kolekce Media_Item, které není Approved_Media, THEN THE Collection_Service SHALL přidání odmítnout, kolekci ponechat beze změny a vrátit chybovou zprávu označující, že médium není dostupné.
8. IF uživatel odebere Media_Item, které v jeho kolekci není přítomné, THEN THE Collection_Service SHALL kolekci ponechat beze změny a vrátit chybovou zprávu označující, že médium v kolekci není.

### Requirement 15: Správa uživatelů Adminem

**User Story:** Jako Admin chci spravovat uživatelské účty, abych mohl řídit přístup na platformu.

#### Acceptance Criteria

1. WHEN Admin aktivuje uživatelský účet, THE Admin_Console SHALL nastavit účet do aktivního stavu a do 2 sekund zobrazit Adminovi potvrzení o úspěšné změně stavu.
2. WHEN Admin zablokuje uživatelský účet, THE Admin_Console SHALL nastavit účet do zablokovaného stavu a do 2 sekund zobrazit Adminovi potvrzení o úspěšné změně stavu.
3. WHILE je uživatelský účet zablokovaný, THE Access_Middleware SHALL zamezit danému uživateli přístup k chráněnému obsahu a přesměrovat jej na stránku Sign In.
4. WHEN je uživatelský účet zablokován, THE Access_Middleware SHALL ukončit všechny aktivní relace daného uživatele do 5 sekund.
5. WHEN Admin otevře přehled uživatelů, THE Admin_Console SHALL zobrazit seznam uživatelských účtů, kde každá položka obsahuje roli (Admin nebo běžný uživatel) a stav (aktivní nebo zablokovaný).
6. IF přehled uživatelů neobsahuje žádný účet, THEN THE Admin_Console SHALL zobrazit Adminovi zprávu indikující prázdný seznam.
7. IF se změna stavu účtu nezdaří, THEN THE Admin_Console SHALL zachovat původní stav účtu beze změny a zobrazit Adminovi chybové hlášení indikující neúspěch operace.

### Requirement 16: Správa viditelnosti stránek (Pages Management)

**User Story:** Jako Admin chci globálně skrývat nebo zobrazovat sekce webu, abych řídil, co je uživatelům dostupné.

#### Acceptance Criteria

1. WHEN Admin skryje sekci webu, THE Page_Visibility_Service SHALL do 2 sekund odebrat danou sekci z navigace a z přístupu pro všechny uživatele a trvale uložit stav viditelnosti.
2. WHEN Admin zobrazí dříve skrytou sekci webu, THE Page_Visibility_Service SHALL do 2 sekund zpřístupnit danou sekci v navigaci a v přístupu pro všechny uživatele a trvale uložit stav viditelnosti.
3. IF uživatel požádá o globálně skrytou sekci, THEN THE Access_Middleware SHALL odpovědět stavovým kódem 404.
4. IF uložení změny viditelnosti sekce selže, THEN THE Page_Visibility_Service SHALL zachovat předchozí stav viditelnosti dané sekce a zobrazit Adminovi chybové hlášení indikující, že změnu nebylo možné uložit.
5. WHILE je sekce nastavena jako globálně skrytá, THE Page_Visibility_Service SHALL tento stav zachovat napříč relacemi a po opětovném načtení až do okamžiku, kdy Admin sekci explicitně znovu zobrazí.

### Requirement 17: Globální oznamovací banner

**User Story:** Jako Admin chci zobrazit globální oznámení, abych informoval všechny uživatele o důležité zprávě.

#### Acceptance Criteria

1. WHEN Admin aktivuje oznámení s textem o délce 1 až 500 znaků, THE Notification_Service SHALL do 5 sekund zobrazit oznamovací banner s tímto textem všem aktuálně přihlášeným uživatelům.
2. WHEN Admin deaktivuje oznámení, THE Notification_Service SHALL do 5 sekund přestat oznamovací banner zobrazovat všem přihlášeným uživatelům.
3. IF Admin aktivuje oznámení s prázdným textem nebo textem delším než 500 znaků, THEN THE Notification_Service SHALL aktivaci odmítnout, banner nezobrazit a vrátit chybové hlášení indikující neplatnou délku textu.
4. WHILE je oznámení aktivní, THE Notification_Service SHALL zobrazit oznamovací banner s aktuálním textem každému uživateli, který se nově přihlásí.
5. IF je oznámení již aktivní a Admin aktivuje nové oznámení, THEN THE Notification_Service SHALL nahradit zobrazený text textem nového oznámení a zachovat zobrazení jediného banneru.

### Requirement 18: Nastavení uživatelského profilu

**User Story:** Jako User chci spravovat svůj profil a heslo, abych měl kontrolu nad svým účtem.

#### Acceptance Criteria

1. WHEN uživatel uloží změny svého profilu na stránce Settings s platnými hodnotami, THE MMMRED_System SHALL trvale uložit aktualizované hodnoty profilu a do 3 sekund zobrazit potvrzení o úspěšném uložení.
2. IF uživatel uloží profil s neplatnou hodnotou pole (prázdné povinné pole nebo textová hodnota přesahující 255 znaků), THEN THE MMMRED_System SHALL změnu odmítnout, zachovat původní hodnoty profilu a zobrazit chybovou zprávu označující konkrétní neplatné pole.
3. WHEN uživatel zadá platné stávající heslo a nové heslo o délce 8 až 128 znaků, THE Auth_Service SHALL aktualizovat heslo uživatele a zobrazit potvrzení o úspěšné změně hesla.
4. IF uživatel při změně hesla zadá nesprávné stávající heslo, THEN THE Auth_Service SHALL změnu odmítnout, zachovat stávající heslo a vrátit chybovou zprávu indikující nesprávné stávající heslo.
5. IF uživatel zadá nové heslo, které nesplňuje délku 8 až 128 znaků, THEN THE Auth_Service SHALL změnu odmítnout, zachovat stávající heslo a vrátit chybovou zprávu indikující nesplněné požadavky na délku hesla.

### Requirement 19: Přesměrování na Telegram

**User Story:** Jako User chci jedním kliknutím přejít do privátní Telegram skupiny, abych byl součástí komunity.

#### Acceptance Criteria

1. WHEN uživatel zvolí akci Telegram a nakonfigurovaná URL privátní Telegram skupiny je platná, THE MMMRED_System SHALL přesměrovat uživatele na tuto URL do 2 sekund.
2. WHEN MMMRED_System přesměrovává uživatele na URL Telegram skupiny, THE MMMRED_System SHALL otevřít cílovou URL v nové záložce prohlížeče a zachovat původní stránku otevřenou.
3. IF uživatel zvolí akci Telegram a nakonfigurovaná URL privátní Telegram skupiny chybí nebo není platná (není neprázdný řetězec s platným formátem URL), THEN THE MMMRED_System SHALL přesměrování zrušit a zobrazit uživateli chybové hlášení indikující, že cíl Telegram není dostupný.

### Requirement 20: Předplatné přes Stripe [POST-MVP]

**User Story:** Jako provozovatel chci vybírat měsíční předplatné, aby měli přístup k obsahu jen platící uživatelé. Tato funkce se realizuje až po dokončení MVP.

#### Acceptance Criteria

1. WHEN uživatel zahájí předplatné, THE Subscription_Service SHALL přes Stripe založit měsíční předplatné ve výši 5 USD měsíčně.
2. IF se založení předplatného přes Stripe nezdaří, THEN THE Subscription_Service SHALL ponechat předplatné uživatele v neaktivním stavu a zobrazit chybové hlášení informující o neúspěšném zahájení předplatného.
3. WHEN Stripe zašle ověřený webhook o úspěšné platbě, THE Subscription_Service SHALL nastavit předplatné uživatele do aktivního stavu do 10 sekund od přijetí webhooku.
4. WHEN Stripe zašle ověřený webhook o selhání platby nebo vypršení předplatného, THE Subscription_Service SHALL nastavit předplatné uživatele do neaktivního stavu do 10 sekund od přijetí webhooku.
5. IF přijatý webhook nelze ověřit jako pravý (neplatný podpis nebo původ), THEN THE Subscription_Service SHALL webhook odmítnout, neměnit stav předplatného žádného uživatele a zaznamenat pokus o neoprávněný webhook.
6. WHILE má uživatel neaktivní předplatné, THE Access_Middleware SHALL přesměrovat uživatele na Paywall a zamezit přístup k API s médii.
7. WHEN je založen nový uživatelský účet, THE Subscription_Service SHALL nastavit jeho výchozí stav předplatného na neaktivní.
8. WHEN uživatel otevře správu předplatného v Settings, THE Subscription_Service SHALL přesměrovat uživatele do zákaznického portálu Stripe pro správu nebo zrušení předplatného.
9. WHEN Admin ručně změní stav předplatného uživatele na aktivní nebo neaktivní, THE Admin_Console SHALL nastavit požadovaný stav předplatného daného uživatele.

### Requirement 21: Odložení platební bariéry v MVP

**User Story:** Jako tým chci v MVP fázi provozovat aplikaci bez platební bariéry, abych mohl ověřit funkčnost dříve, než zapojím platby.

#### Acceptance Criteria

1. WHILE je platební funkce vypnutá (MVP režim), THE Access_Middleware SHALL umožnit každému autentizovanému uživateli přístup ke všemu chráněnému obsahu bez jakékoli kontroly stavu předplatného.
2. WHERE je platební funkce zapnutá (post-MVP režim), THE Access_Middleware SHALL vynucovat kontrolu stavu předplatného podle Requirementu 20.
3. THE Access_Middleware SHALL určovat aktivní režim (MVP / post-MVP) z jediného konfiguračního přepínače platební funkce, který má dvě hodnoty (vypnuto / zapnuto) a výchozí hodnotu vypnuto.
4. WHILE je platební funkce vypnutá (MVP režim), IF neautentizovaný uživatel požádá o chráněný obsah, THEN THE Access_Middleware SHALL přístup odepřít a přesměrovat uživatele na přihlášení, přičemž požadovaná cílová adresa zůstane zachována pro návrat po přihlášení.
5. WHEN se konfigurační přepínač platební funkce změní z vypnuto na zapnuto, THE Access_Middleware SHALL u každého následujícího požadavku aplikovat kontrolu stavu předplatného podle Requirementu 20 bez nutnosti restartu pro již přihlášené uživatele.
