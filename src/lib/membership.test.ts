import { describe, it, expect } from "vitest";
import { isActiveMember } from "./membership";

const NOW = new Date("2026-06-29T12:00:00.000Z");

describe("isActiveMember", () => {
  it("inactive subscription → nikdy člen", () => {
    expect(isActiveMember({ subscriptionStatus: "inactive", membershipExpiresAt: null }, NOW)).toBe(false);
    expect(
      isActiveMember(
        { subscriptionStatus: "inactive", membershipExpiresAt: new Date("2099-01-01") },
        NOW,
      ),
    ).toBe(false);
  });

  it("active bez expirace → člen", () => {
    expect(isActiveMember({ subscriptionStatus: "active", membershipExpiresAt: null }, NOW)).toBe(true);
  });

  it("active s expirací v budoucnu → člen", () => {
    expect(
      isActiveMember(
        { subscriptionStatus: "active", membershipExpiresAt: new Date("2026-07-01T00:00:00Z") },
        NOW,
      ),
    ).toBe(true);
  });

  it("active s expirací v minulosti (nebo == now) → není člen", () => {
    expect(
      isActiveMember(
        { subscriptionStatus: "active", membershipExpiresAt: new Date("2026-06-01T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
    expect(isActiveMember({ subscriptionStatus: "active", membershipExpiresAt: NOW }, NOW)).toBe(false);
  });
});
