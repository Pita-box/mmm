/**
 * Admin — Membership gate: výběr „sample" náhledů zobrazených v bariéře členství.
 *
 * Admin vybírá z publikovaných médií, která se rozmazaně ukážou uživatelům bez
 * platného členství. Náhledy jdou přes proxy `/api/thumb/<token>` (R6.4).
 */
import { AdminCard, GateSamplePicker, type GateSampleMedia } from "@/components/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { thumbUrlFor } from "@/lib/media-presentation";
import { setGateSampleAction } from "../admin-actions";

export default async function AdminMembershipGatePage() {
  const admin = await requireAdmin();
  const now = new Date();

  const [media, samples] = await Promise.all([
    prisma.mediaItem.findMany({
      where: { status: "published", publishAt: { lte: now } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, mediaType: true },
    }),
    prisma.membershipGateSample.findMany({ select: { mediaId: true } }),
  ]);

  const items: GateSampleMedia[] = media.map((m) => ({
    id: m.id,
    mediaType: m.mediaType,
    posterUrl: thumbUrlFor(m.id, admin.userId, now),
  }));
  const initialSelected = samples.map((s) => s.mediaId);

  async function onToggle(mediaId: string, included: boolean): Promise<void> {
    "use server";
    await setGateSampleAction(mediaId, included);
  }

  return (
    <AdminCard
      title="Membership gate"
      description="Vyber publikované fotky, které se rozmazaně zobrazí uživatelům bez platného členství."
    >
      <GateSamplePicker
        media={items}
        initialSelected={initialSelected}
        onToggle={onToggle}
      />
    </AdminCard>
  );
}
