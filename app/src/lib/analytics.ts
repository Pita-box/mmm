"use client";

export type AnalyticsParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export function trackEvent(
  event: string,
  params: AnalyticsParams = {},
): void {
  if (typeof window === "undefined") return;
  const payload = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  const target = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  };
  target.dataLayer = target.dataLayer || [];
  target.dataLayer.push({ event, ...payload });
}
