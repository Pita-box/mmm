/**
 * Scheduler — plánovač publikace médií (task 8.1).
 *
 * Stejně jako ostatní služby odděluje **čisté jádro** (`selectDueMedia`) od
 * **perzistentní vrstvy** (`createScheduler(prisma)`). Čisté jádro je bez I/O,
 * deterministické a přímo testovatelné (PBT task 8.2 — Property 19).
 *
 * Chování (R8.2, viz design.md → Scheduler): pro naplánovaná média
 * (`status == "scheduled"`), jejichž `publishAt <= now`, je proveden přechod
 * SCHEDULED → PUBLISHED. Ostatní naplánovaná média zůstanou beze změny.
 * Cron spouští interní endpoint každou minutu, čímž je splněn limit publikace
 * do 60 sekund od dosaženého času (drátování endpointu řeší task 21.3).
 */
import type { PrismaClient } from "@prisma/client";
import type { MediaItemView } from "@/services/media-service";
import { ok, type Result } from "@/lib/result";

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Vybere z naplánovaných médií ta, jejichž čas zveřejnění již nastal (R8.2).
 *
 * „Dosažená" média = `publishAt != null && publishAt <= now`. Médium bez
 * nastaveného času zveřejnění (`publishAt == null`) není nikdy dosažené.
 * Vstup se nemutuje; zachová se konkrétní typ položek.
 *
 * Tato funkce zrcadlí dotaz perzistentní vrstvy (`updateMany` s `publishAt<=now`)
 * a je přímo testovatelná property testem (task 8.2, Property 19).
 */
export function selectDueMedia<T extends MediaItemView>(items: readonly T[], now: Date): T[] {
  return items.filter(
    (item) => item.publishAt !== null && item.publishAt.getTime() <= now.getTime(),
  );
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

/** Výsledek jednoho běhu plánovače: počet médií povýšených na published. */
export interface SchedulerRunResult {
  readonly promoted: number;
}

export interface Scheduler {
  selectDueMedia<T extends MediaItemView>(items: readonly T[], now: Date): T[];
  /** Povýší všechna naplánovaná média s `publishAt <= now` na published (R8.2). */
  runScheduler(now?: Date): Promise<Result<SchedulerRunResult, never>>;
}

/**
 * Vytvoří instanci Scheduleru nad daným Prisma klientem.
 * Čistá funkce `selectDueMedia` je vystavena i jako samostatný export (pro PBT bez I/O).
 */
export function createScheduler(prisma: PrismaClient): Scheduler {
  return {
    selectDueMedia,

    async runScheduler(now = new Date()) {
      // Přechod SCHEDULED → PUBLISHED pouze pro naplánovaná, již dosažená média.
      // Jediný atomický updateMany; ostatní stavy (published/hidden) se nedotkne.
      const { count } = await prisma.mediaItem.updateMany({
        where: { status: "scheduled", publishAt: { lte: now } },
        data: { status: "published" },
      });
      return ok({ promoted: count });
    },
  };
}
