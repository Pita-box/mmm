/**
 * Layout přihlášené části aplikace — obaluje stránky do `AppShell`
 * (SideNav + TopNav) a nad obsah vykresluje globální `NotificationBanner`
 * (R17.1, R17.4). Route group `(app)` neovlivňuje URL.
 *
 * Data se čtou z reálné relace a služeb (task 21.2): role a zobrazované jméno
 * z principála + DB, mapa skrytých sekcí z `Page_Visibility_Service` (R16.1)
 * a aktuální text banneru z `Notification_Service.getActiveBanner()` (R17.4).
 */
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NotificationBanner } from "@/components/NotificationBanner";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { pageVisibilityService } from "@/services/page-visibility-service";
import { notificationService } from "@/services/notification-service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requireSession();

  const [hiddenSections, banner, user] = await Promise.all([
    pageVisibilityService.getHiddenSections(),
    notificationService.getActiveBanner(),
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: {
        displayName: true,
      },
    }),
  ]);

  return (
    <AppShell
      role={principal.role}
      hiddenSections={hiddenSections}
      displayName={user?.displayName ?? null}
    >
      <NotificationBanner text={banner?.text ?? null} />
      {children}
    </AppShell>
  );
}
