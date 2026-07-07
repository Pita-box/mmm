/**
 * Page_Visibility_Service — perzistentní viditelnost sekcí (task 16.1).
 *
 * Admin může globálně skrýt nebo zobrazit sekci webu; stav `section → hidden`
 * je trvale uložen (Prisma model `PageVisibility`) a přetrvává napříč relacemi
 * i po opětovném načtení, dokud ho Admin explicitně nezmění (R16.5). Mapa
 * skrytých sekcí je přímo konzumovatelná čistou funkcí `decideAccess`
 * (pole `hiddenSections`), která pro skrytou sekci vrací 404 (R16.2, R16.3).
 *
 * Soubor odděluje **čisté jádro** (sestavení a dotaz nad mapou viditelnosti —
 * bez I/O, přímo testovatelné generátory, PBT task 16.2) od **perzistentní
 * vrstvy** (`createPageVisibilityService(prisma)`), jejíž operace vracejí
 * `Result<…, VisibilityError>` a nikdy nevyhazují výjimku přes svou hranici.
 * Při selhání perzistence se předchozí stav zachová a vrátí se chyba
 * `persist_failed` (R16.4).
 */
import type { PrismaClient } from "@prisma/client";
import type { VisibilityError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import { prisma } from "@/lib/prisma";

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/** Jeden záznam viditelnosti tak, jak je uložen v perzistenci. */
export interface VisibilityRow {
  readonly sectionKey: string;
  readonly hidden: boolean;
}

/**
 * Sestaví mapu `section → hidden` z perzistovaných záznamů. Výstup je přímo
 * konzumovatelný `decideAccess` (`hiddenSections`). Sekce bez záznamu v mapě
 * není přítomna a je tedy považována za viditelnou (výchozí stav, R16 —
 * uzavřený režim skrývá jen explicitně skryté sekce).
 */
export function buildHiddenMap(
  rows: readonly VisibilityRow[],
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const row of rows) {
    map[row.sectionKey] = row.hidden;
  }
  return map;
}

/**
 * Čistý dotaz nad mapou viditelnosti: je daná sekce skrytá? Sekce bez záznamu
 * (nebo s `hidden === false`) je viditelná. Sdílí sémantiku s `decideAccess`,
 * kde se skrytá sekce testuje jako `hiddenSections[key] === true` (R16.3).
 */
export function isSectionHidden(
  map: Readonly<Record<string, boolean>>,
  sectionKey: string,
): boolean {
  return map[sectionKey] === true;
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

export interface PageVisibilityService {
  /**
   * Nastaví viditelnost sekce (upsert) a trvale ji uloží (R16.1, R16.2).
   * Při selhání perzistence vrací `persist_failed` a předchozí stav zůstává
   * beze změny (R16.4).
   */
  setHidden(
    sectionKey: string,
    hidden: boolean,
  ): Promise<Result<void, VisibilityError>>;
  /** Je sekce aktuálně skrytá? Sekce bez záznamu je viditelná (false). */
  isHidden(sectionKey: string): Promise<boolean>;
  /**
   * Aktuální mapa `section → hidden` napříč všemi sekcemi — vstup pro
   * `decideAccess` (R16.3, R16.5).
   */
  getHiddenSections(): Promise<Record<string, boolean>>;
}

const PERSIST_FAILED: VisibilityError = {
  code: "persist_failed",
  message: "Změnu viditelnosti sekce se nepodařilo uložit.",
};

/**
 * Vytvoří instanci Page_Visibility_Service nad daným Prisma klientem.
 * Čisté jádro (`buildHiddenMap`, `isSectionHidden`) je vystaveno samostatně
 * pro testování bez I/O.
 */
export function createPageVisibilityService(
  prisma: PrismaClient,
): PageVisibilityService {
  return {
    async setHidden(sectionKey, hidden) {
      try {
        // Upsert zajistí round-trip: opětovné nastavení na původní hodnotu
        // vrátí sekci do předchozího stavu (R16.5).
        await prisma.pageVisibility.upsert({
          where: { sectionKey },
          create: { sectionKey, hidden },
          update: { hidden },
        });
        return ok();
      } catch {
        // Selhání perzistence nemění uložený stav (R16.4).
        return err(PERSIST_FAILED);
      }
    },

    async isHidden(sectionKey) {
      const row = await prisma.pageVisibility.findUnique({
        where: { sectionKey },
      });
      return row?.hidden ?? false;
    },

    async getHiddenSections() {
      const rows = await prisma.pageVisibility.findMany();
      return buildHiddenMap(rows);
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient. */
export const pageVisibilityService: PageVisibilityService =
  createPageVisibilityService(prisma);
