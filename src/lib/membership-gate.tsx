/**
 * Per-page membership gate (server). Volá se na začátku každé user-facing
 * stránky: pro roli `User` bez platného členství vrátí `MembershipGate`
 * (rozmazané sample + výzva) MÍSTO obsahu stránky — obsah se tak nikdy
 * nevyrenderuje ani nepošle klientovi. Na rozdíl od layoutu se stránka
 * re-renderuje při každé (i soft) navigaci, takže bariéru nelze obejít.
 *
 * Staff (Admin/Distributor) se negatuje. Členství se čte živě z DB.
 */
import type { ReactNode } from "react";
import { prisma } from "./prisma";
import { isActiveMember } from "./membership";
import { isApproved } from "@/services/media-service";
import { toCardItem } from "./media-presentation";
import { MembershipGate } from "@/components/MembershipGate";
import type { SessionPrincipal } from "./access-context";

/**
 * Vrátí gate UI, pokud principal nemá platné členství (jen role `User`),
 * jinak `null` (stránka pokračuje normálně).
 */
export async function membershipGate(
  principal: SessionPrincipal,
  now: Date = new Date(),
): Promise<ReactNode | null> {
  if (principal.role !== "User") return null;

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { subscriptionStatus: true, membershipExpiresAt: true },
  });
  if (
    user !== null &&
    isActiveMember(
      {
        subscriptionStatus: user.subscriptionStatus,
        membershipExpiresAt: user.membershipExpiresAt,
      },
      now,
    )
  ) {
    return null;
  }

  // Sample náhledy — jen Approved_Media (proxy /api/thumb je vyžaduje).
  const samples = await prisma.membershipGateSample.findMany({
    orderBy: { createdAt: "desc" },
    include: { media: true },
  });
  const media = samples
    .map((s) => s.media)
    .filter((m) => isApproved(m, now))
    .map((m) => toCardItem(m, principal.userId, {}, now));

  return <MembershipGate media={media} />;
}
