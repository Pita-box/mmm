import { describe, it, expect } from "vitest";
import { canUpload, canManageAdmin, canDeleteMedia } from "./permissions";

describe("permissions (feature distributor)", () => {
  it("canUpload: Admin a Distributor ano, User ne", () => {
    expect(canUpload("Admin")).toBe(true);
    expect(canUpload("Distributor")).toBe(true);
    expect(canUpload("User")).toBe(false);
  });

  it("canManageAdmin: jen Admin", () => {
    expect(canManageAdmin("Admin")).toBe(true);
    expect(canManageAdmin("Distributor")).toBe(false);
    expect(canManageAdmin("User")).toBe(false);
  });

  describe("canDeleteMedia", () => {
    const own = { uploaderId: "u1" };
    const other = { uploaderId: "u2" };
    const legacy = { uploaderId: null };

    it("Admin smaže jakékoli médium (i legacy bez uploaderId)", () => {
      expect(canDeleteMedia("Admin", "u1", other)).toBe(true);
      expect(canDeleteMedia("Admin", "u1", legacy)).toBe(true);
    });

    it("Distributor smaže jen vlastní; cizí ani legacy ne", () => {
      expect(canDeleteMedia("Distributor", "u1", own)).toBe(true);
      expect(canDeleteMedia("Distributor", "u1", other)).toBe(false);
      expect(canDeleteMedia("Distributor", "u1", legacy)).toBe(false);
    });

    it("User nesmaže nic", () => {
      expect(canDeleteMedia("User", "u1", own)).toBe(false);
    });
  });
});
