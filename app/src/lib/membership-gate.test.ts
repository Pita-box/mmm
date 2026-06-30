import { describe, it, expect } from "vitest";
import { membershipGate } from "./membership-gate";
import type { SessionPrincipal } from "./access-context";

describe("membershipGate", () => {
  it("staff (Admin/Distributor) se negatuje (vrací null, bez DB)", async () => {
    const base = {
      userId: "u1",
      sessionId: "s1",
      accountStatus: "active",
      subscriptionStatus: "inactive",
      lastActivityAt: new Date().toISOString(),
    } as const;
    expect(
      await membershipGate({ ...base, role: "Admin" } satisfies SessionPrincipal),
    ).toBeNull();
    expect(
      await membershipGate({
        ...base,
        role: "Distributor",
      } satisfies SessionPrincipal),
    ).toBeNull();
  });
});
