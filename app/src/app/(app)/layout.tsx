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
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { NotificationBanner } from "@/components/NotificationBanner";
import { MembershipGate } from "@/components/MembershipGate";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isActiveMember } from "@/lib/membership";
import { isApproved } from "@/services/media-service";
import { toCardItem } from "@/lib/media-presentation";
import type { MediaCardItem } from "@/components/MediaCard";
import { pageVisibilityService } from "@/services/page-visibility-service";
import { notificationService } from "@/services/notification-service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requireSession();

  const [hiddenSections, banner, user, hdrs] = await Promise.all([
    pageVisibilityService.getHiddenSections(),
    notificationService.getActiveBanner(),
    prisma.user.findUnique({
      where: { id: principal.userId },
      select: {
        displayName: true,
        subscriptionStatus: true,
        membershipExpiresAt: true,
      },
    }),
    headers(),
  ]);

  // Server-side membership gating: běžný uživatel bez platného členství vidí
  // místo obsahu jen výzvu (rozmazané sample + pricing). /settings je vždy
  // dostupné, aby mohl spravovat účet. Admin/Distributor (staff) gating neřeší.
  const pathname = hdrs.get("x-pathname") ?? "";
  const member =
    user !== null &&
    isActiveMember({
      subscriptionStatus: user.subscriptionStatus,
      membershipExpiresAt: user.membershipExpiresAt,
    });
  const gated =
    principal.role === "User" && !member && pathname !== "/settings";

  // Sample náhledy pro gate: jen když gatujeme. Filtrované na Approved_Media,
  // aby proxy thumbnaily (/api/thumb) fungovaly (jinak 404 → placeholder).
  let gateMedia: MediaCardItem[] = [];
  if (gated) {
    const now = new Date();
    const samples = await prisma.membershipGateSample.findMany({
      orderBy: { createdAt: "desc" },
      include: { media: true },
    });
    gateMedia = samples
      .map((s) => s.media)
      .filter((m) => isApproved(m, now))
      .map((m) => toCardItem(m, principal.userId, {}, now));
  }

  return (
    <AppShell
      role={principal.role}
      hiddenSections={hiddenSections}
      displayName={user?.displayName ?? null}
    >
      <NotificationBanner text={banner?.text ?? null} />
      {gated ? <MembershipGate media={gateMedia} /> : children}
    </AppShell>
  );
}
