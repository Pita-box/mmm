import { describe, expect, it } from "vitest";
import {
  buildTelegramGallerySummaryMessage,
  buildTelegramGeneralPingDayKey,
  parseTelegramGeneralRandomMessages,
  pickRandomTelegramGeneralMessage,
  resolveDueTelegramGeneralPingSlot,
} from "./telegram-community-service";

describe("telegram community service", () => {
  it("builds singular gallery summary", () => {
    expect(buildTelegramGallerySummaryMessage(1)).toBe(
      "1 new item was added on the site.",
    );
  });

  it("builds plural gallery summary", () => {
    expect(buildTelegramGallerySummaryMessage(4)).toBe(
      "4 new items were added on the site.",
    );
    expect(buildTelegramGallerySummaryMessage(5)).toBe(
      "5 new items were added on the site.",
    );
  });

  it("parses random general messages from env", () => {
    expect(
      parseTelegramGeneralRandomMessages("Ahoj|||Mrkni na nové fotky|||Napiš svůj tip"),
    ).toEqual(["Ahoj", "Mrkni na nové fotky", "Napiš svůj tip"]);
    expect(parseTelegramGeneralRandomMessages("První\n\nDruhá")).toEqual([
      "První",
      "Druhá",
    ]);
  });

  it("resolves Prague day key", () => {
    expect(
      buildTelegramGeneralPingDayKey(new Date("2026-07-05T08:30:00.000Z")),
    ).toBe("2026-07-05");
  });

  it("returns due slot only once per day slot", () => {
    expect(
      resolveDueTelegramGeneralPingSlot({
        now: new Date("2026-07-05T08:30:00.000Z"),
        sentSlots: [false, false, false],
      }),
    ).toBe(0);

    expect(
      resolveDueTelegramGeneralPingSlot({
        now: new Date("2026-07-05T13:30:00.000Z"),
        sentSlots: [true, false, false],
      }),
    ).toBe(1);

    expect(
      resolveDueTelegramGeneralPingSlot({
        now: new Date("2026-07-05T19:30:00.000Z"),
        sentSlots: [true, true, true],
      }),
    ).toBeNull();
  });

  it("picks a random message from the provided pool", () => {
    expect(pickRandomTelegramGeneralMessage(["one", "two", "three"], () => 0.5)).toBe(
      "two",
    );
    expect(pickRandomTelegramGeneralMessage([], () => 0.5)).toBeNull();
  });
});
