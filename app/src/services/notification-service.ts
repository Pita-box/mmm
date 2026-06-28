/**
 * Notification_Service — globální oznamovací banner (task 15.1).
 *
 * Banner je **singleton**: v jeden okamžik je aktivní nejvýše jeden a každý
 * nově přihlášený uživatel (nová relace) dostane jeho aktuální text. Tento
 * soubor odděluje **čisté jádro** (validace textu) od **perzistentní vrstvy**
 * (Prisma). Čistá validace je bez I/O a přímo testovatelná generátory
 * (PBT tasky 15.2–15.3); perzistentní operace jsou vystaveny přes
 * `createNotificationService(prisma)` a vracejí `Result<…, NotificationError>`
 * — nikdy nevyhazují výjimku přes svou hranici.
 *
 * Klíčová pravidla (R17):
 *  - aktivace vyžaduje text délky 1–500; jinak je odmítnuta beze změny (R17.1, R17.3),
 *  - aktivní je vždy nejvýše jeden banner — singleton (R17.5),
 *  - aktivace dalšího oznámení nahradí zobrazený text předchozího (R17.5),
 *  - deaktivace přestane banner zobrazovat (R17.2),
 *  - aktuální text je doručen každé nově vzniklé relaci přes `getActiveBanner` (R17.4).
 */
import type { PrismaClient, Notification } from "@prisma/client";
import type { NotificationError } from "@/lib/errors";
import { ok, err, isErr, type Result } from "@/lib/result";
import { validateNotificationText } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

// ─── Čisté jádro ───────────────────────────────────────────────────────────────

/**
 * Validace textu banneru (R17.3). Vrací typovanou `ValidationError` s názvem
 * pole, aby UI mohlo zvýraznit neplatné pole; při chybě se nikdy nic
 * neperzistuje a stav banneru zůstává beze změny (R17.1).
 */
export function validateNotificationInput(
  text: string,
): Result<void, NotificationError> {
  if (!validateNotificationText(text)) {
    return err({
      code: "validation",
      field: "text",
      message: "Text oznámení musí mít délku 1–500 znaků.",
    });
  }
  return ok();
}

// ─── Perzistentní vrstva ────────────────────────────────────────────────────────

/** Aktuálně doručovaný banner pro novou relaci (R17.4). */
export interface ActiveBanner {
  readonly text: string;
}

export interface NotificationService {
  /**
   * Aktivuje banner s daným textem (R17.1). Neplatný text aktivaci odmítne
   * beze změny stavu (R17.3). Pokud je již banner aktivní, jeho text je
   * nahrazen a zůstává jediný aktivní banner (R17.5).
   */
  activate(text: string): Promise<Result<Notification, NotificationError>>;
  /** Deaktivuje banner; přestane se zobrazovat (R17.2). Idempotentní. */
  deactivate(): Promise<Result<void, NotificationError>>;
  /**
   * Vrátí aktuálně aktivní banner, nebo `null` když žádný není (R17.4).
   * Tato funkce je zdrojem textu doručeného každé nově vzniklé relaci.
   */
  getActiveBanner(): Promise<ActiveBanner | null>;
}

/**
 * Vytvoří instanci Notification_Service nad daným Prisma klientem.
 * Čistá validace je vystavena i jako samostatný export (pro PBT bez I/O).
 */
export function createNotificationService(
  prisma: PrismaClient,
): NotificationService {
  return {
    async activate(text) {
      const v = validateNotificationInput(text);
      if (isErr(v)) return v; // neplatný text → žádná změna stavu (R17.1, R17.3)

      // Singleton: deaktivuj případný stávající aktivní banner a aktivuj jeden
      // nový s daným textem. Transakce zaručí, že v jeden okamžik je aktivní
      // nejvýše jeden banner (R17.5) — aktivace nahradí text předchozího.
      const [, created] = await prisma.$transaction([
        prisma.notification.updateMany({
          where: { active: true },
          data: { active: false },
        }),
        prisma.notification.create({
          data: { text, active: true },
        }),
      ]);
      return ok(created);
    },

    async deactivate() {
      // Skryje banner všem; opakovaná deaktivace je bezpečná (R17.2).
      await prisma.notification.updateMany({
        where: { active: true },
        data: { active: false },
      });
      return ok();
    },

    async getActiveBanner() {
      // Doručení aktuálního textu nové relaci (R17.4): nejnovější aktivní banner.
      const banner = await prisma.notification.findFirst({
        where: { active: true },
        orderBy: { updatedAt: "desc" },
      });
      return banner === null ? null : { text: banner.text };
    },
  };
}

/** Produkční instance napojená na sdílený Prisma klient. */
export const notificationService: NotificationService =
  createNotificationService(prisma);
