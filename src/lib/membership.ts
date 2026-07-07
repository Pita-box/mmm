/**
 * Membership — čisté rozhodnutí o platnosti aktivního členství.
 *
 * Aktivní členství = `subscriptionStatus === "active"` A zároveň buď bez
 * expirace (`membershipExpiresAt == null`), nebo expirace ještě nenastala
 * (`> now`). Admin nastavuje stav i datum expirace v `/admin/users`.
 *
 * Bez I/O → deterministické a přímo testovatelné. Gating obsahu (server-side)
 * i admin UI sdílí tento jediný invariant.
 */
import type { SubscriptionStatus } from "./domain";

export interface MembershipState {
  readonly subscriptionStatus: SubscriptionStatus;
  /** Konec platnosti členství, nebo `null` = bez expirace. */
  readonly membershipExpiresAt: Date | null;
}

/** Má uživatel vůči `now` platné aktivní členství? */
export function isActiveMember(m: MembershipState, now: Date = new Date()): boolean {
  if (m.subscriptionStatus !== "active") return false;
  if (m.membershipExpiresAt === null) return true;
  return m.membershipExpiresAt.getTime() > now.getTime();
}
