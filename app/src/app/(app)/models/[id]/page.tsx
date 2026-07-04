/**
 * Detail modelu — artist page (R13.4, R13.5, R13.6).
 *
 * Načte profil přes `Model_Service.getProfile(id)` a galerii přes
 * `getGallery(id)` (výhradně Approved_Media — R13.4). Neexistuje-li model,
 * zobrazí chybové sdělení „model nenalezen" (R13.6). Náhledy jdou přes proxy
 * Streaming_URL (R6.4).
 */
import { ModelDetail } from "@/components/ModelDetail";
import { modelService } from "@/services/model-service";
import { prisma } from "@/lib/prisma";
import { isErr, isOk } from "@/lib/result";
import { requireSession } from "@/lib/session";
import { requireVisibleSection } from "@/lib/section-visibility";
import { membershipGate } from "@/lib/membership-gate";
import { thumbUrlFor, toCardItem } from "@/lib/media-presentation";
import {
  updateModelProfileAction,
  deleteModelProfileAction,
} from "../../admin/admin-actions";
import { UserX } from "lucide-react";

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requireSession();
  await requireVisibleSection("models", principal.role);
  const gate = await membershipGate(principal);
  if (gate) return gate;
  const { id } = await params;
  const now = new Date();

  const profile = await modelService.getProfile(id);
  if (isErr(profile)) {
    // R13.6 — neexistující model: chybové sdělení místo detailu.
    return (
      <section>
        <p className="flex flex-col items-center gap-3 py-12 text-center text-[length:var(--text-body)] text-[color:var(--color-silver)]">
          <UserX aria-hidden size={40} className="text-[color:var(--color-slate)]" />
          Model nebyl nalezen.
        </p>
      </section>
    );
  }

  // Galerie obsahuje výhradně Approved_Media modelu (R13.4).
  const gallery = await modelService.getGallery(id, now);
  const media = isOk(gallery)
    ? gallery.value.map((item) => toCardItem(item, principal.userId, {}, now))
    : [];

  // Distinct štítky z Approved_Media modelu (jen pro výpis na profilu).
  const tagRows = await prisma.tagValue.findMany({
    where: {
      mediaTags: {
        some: { media: { modelId: id, status: "published", publishAt: { lte: now } } },
      },
    },
    orderBy: [{ category: "asc" }, { value: "asc" }],
    select: { value: true },
  });
  const tags = tagRows.map((t) => t.value);

  const photoMedia = media.filter(
    (item) => item.mediaType === "photo" && typeof item.posterUrl === "string",
  );
  const autoCoverItem = photoMedia[0];
  const currentCoverItem = profile.value.coverMediaId
    ? photoMedia.find((item) => item.id === profile.value.coverMediaId)
    : autoCoverItem;
  const autoAvatarItem = photoMedia[1] ?? photoMedia[0];
  const currentAvatarItem = profile.value.profileMediaId
    ? photoMedia.find((item) => item.id === profile.value.profileMediaId)
    : autoAvatarItem;
  const coverUrl = currentCoverItem?.posterUrl ?? media[0]?.posterUrl;
  const avatarUrl = currentAvatarItem?.posterUrl
    ?? (
      profile.value.profileMediaId
        ? thumbUrlFor(profile.value.profileMediaId, principal.userId, now)
        : undefined
    )
    ?? media[1]?.posterUrl
    ?? media[0]?.posterUrl;

  const canEdit = principal.role === "Admin";

  async function onUpdate(values: {
    name: string;
    bio: string;
    coverMediaId?: string | null;
    coverFocusY?: number | null;
    profileMediaId?: string | null;
    avatarCropX?: number | null;
    avatarCropY?: number | null;
    avatarZoom?: number | null;
  }) {
    "use server";
    return updateModelProfileAction(id, values);
  }
  async function onDelete(withMedia: boolean) {
    "use server";
    return deleteModelProfileAction(id, withMedia);
  }

  return (
    <ModelDetail
      modelId={id}
      name={profile.value.name}
      bio={profile.value.bio ?? ""}
      coverUrl={coverUrl}
      avatarUrl={avatarUrl}
      initialCoverMediaId={profile.value.coverMediaId}
      initialCoverFocusY={profile.value.coverFocusY}
      initialAvatarMediaId={profile.value.profileMediaId}
      initialAvatarCropX={profile.value.avatarCropX}
      initialAvatarCropY={profile.value.avatarCropY}
      initialAvatarZoom={profile.value.avatarZoom}
      tags={tags}
      media={media}
      canEdit={canEdit}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
}
