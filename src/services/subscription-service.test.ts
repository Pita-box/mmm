import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  classifyWebhookType,
  parseWebhookEvent,
  defaultSubscriptionStatus,
  ACTIVATING_EVENT_TYPES,
  DEACTIVATING_EVENT_TYPES,
} from "./subscription-service";

const SECRET = "whsec_test_secret";
const sign = (payload: string, secret = SECRET): string =>
  createHmac("sha256", secret).update(payload, "utf8").digest("hex");

describe("verifyWebhookSignature (R20.5)", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "invoice.payment_succeeded" });

  it("accepts a correct HMAC-SHA256 signature", () => {
    expect(verifyWebhookSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it("rejects a tampered payload (same signature, changed body)", () => {
    const sig = sign(payload);
    expect(verifyWebhookSignature(payload + "x", sig, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyWebhookSignature(payload, sign(payload, "other"), SECRET)).toBe(false);
  });

  it("rejects when signature or secret is missing/empty", () => {
    expect(verifyWebhookSignature(payload, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(payload, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(payload, sign(payload), "")).toBe(false);
    expect(verifyWebhookSignature(payload, sign(payload), undefined)).toBe(false);
  });
});

describe("classifyWebhookType (R20.3, R20.4)", () => {
  it("maps every activating event type to active", () => {
    for (const t of ACTIVATING_EVENT_TYPES) {
      expect(classifyWebhookType(t)).toBe("active");
    }
  });

  it("maps every deactivating event type to inactive", () => {
    for (const t of DEACTIVATING_EVENT_TYPES) {
      expect(classifyWebhookType(t)).toBe("inactive");
    }
  });

  it("returns null for an unrelated event type (ignored, no change)", () => {
    expect(classifyWebhookType("customer.updated")).toBeNull();
    expect(classifyWebhookType("")).toBeNull();
  });
});

describe("parseWebhookEvent", () => {
  it("extracts id, type and user references", () => {
    const event = parseWebhookEvent(
      JSON.stringify({
        id: "evt_42",
        type: "invoice.payment_succeeded",
        data: { userId: "user-1", stripeCustomerId: "cus_9" },
      }),
    );
    expect(event).toEqual({
      eventId: "evt_42",
      type: "invoice.payment_succeeded",
      userId: "user-1",
      stripeCustomerId: "cus_9",
    });
  });

  it("returns null for invalid JSON or a payload without type", () => {
    expect(parseWebhookEvent("{not json")).toBeNull();
    expect(parseWebhookEvent(JSON.stringify({ id: "evt_1" }))).toBeNull();
  });

  it("defaults missing references to null", () => {
    const event = parseWebhookEvent(JSON.stringify({ type: "invoice.payment_failed" }));
    expect(event).toEqual({
      eventId: null,
      type: "invoice.payment_failed",
      userId: null,
      stripeCustomerId: null,
    });
  });
});

describe("defaultSubscriptionStatus (R20.7)", () => {
  it("is inactive for a new account", () => {
    expect(defaultSubscriptionStatus()).toBe("inactive");
  });
});
