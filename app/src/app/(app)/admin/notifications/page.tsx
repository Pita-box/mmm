/**
 * Admin — oznamovací banner (task 21.2, R17.1/R17.2). Načte aktivní banner a
 * aktivaci/deaktivaci napojuje na `activate/deactivateNotificationAction`.
 */
import { NotificationBannerForm } from "@/components/admin";
import { notificationService } from "@/services/notification-service";
import { requireAdmin } from "@/lib/session";
import {
  activateNotificationAction,
  deactivateNotificationAction,
} from "../admin-actions";

export default async function AdminNotificationsPage() {
  await requireAdmin();
  const banner = await notificationService.getActiveBanner();

  async function onActivate(text: string): Promise<void> {
    "use server";
    await activateNotificationAction(text);
  }

  async function onDeactivate(): Promise<void> {
    "use server";
    await deactivateNotificationAction();
  }

  return (
    <NotificationBannerForm
      activeText={banner?.text ?? null}
      onActivate={onActivate}
      onDeactivate={onDeactivate}
    />
  );
}
