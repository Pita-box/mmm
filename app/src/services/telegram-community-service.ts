const GENERAL_PING_HOURS = [10, 15, 20] as const;

function formatDatePart(
  now: Date,
  timeZone: string,
  part: "year" | "month" | "day" | "hour" | "minute",
): number {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    [part]: "numeric",
    hour12: false,
  }).formatToParts(now).find((item) => item.type === part)?.value;
  return Number.parseInt(value ?? "0", 10);
}

export function buildTelegramGallerySummaryMessage(count: number): string {
  const isSingular = Math.abs(count) === 1;
  return `${count} new ${isSingular ? "item" : "items"} ${isSingular ? "was" : "were"} added on the site.`;
}

export function parseTelegramGeneralRandomMessages(
  raw: string | null | undefined,
): string[] {
  const source = raw?.trim();
  if (!source) return [];

  const parts = source.includes("|||")
    ? source.split("|||")
    : source.split(/\r?\n/);

  return parts.map((item) => item.trim()).filter((item) => item.length > 0);
}

export function buildTelegramGeneralPingDayKey(
  now: Date,
  timeZone = "Europe/Prague",
): string {
  const year = formatDatePart(now, timeZone, "year");
  const month = String(formatDatePart(now, timeZone, "month")).padStart(2, "0");
  const day = String(formatDatePart(now, timeZone, "day")).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveDueTelegramGeneralPingSlot(args: {
  readonly now: Date;
  readonly sentSlots: readonly boolean[];
  readonly timeZone?: string;
}): number | null {
  const timeZone = args.timeZone ?? "Europe/Prague";
  const hour = formatDatePart(args.now, timeZone, "hour");
  const minute = formatDatePart(args.now, timeZone, "minute");
  const currentMinutes = hour * 60 + minute;

  for (let index = 0; index < GENERAL_PING_HOURS.length; index++) {
    const sent = args.sentSlots[index] ?? false;
    if (sent) continue;
    const slotMinutes = GENERAL_PING_HOURS[index] * 60;
    if (currentMinutes >= slotMinutes) return index;
  }

  return null;
}

export function pickRandomTelegramGeneralMessage(
  messages: readonly string[],
  random = Math.random,
): string | null {
  if (messages.length === 0) return null;
  const index = Math.floor(random() * messages.length);
  return messages[index] ?? null;
}
