"use client";

import { useEffect } from "react";
import { trackEvent, type AnalyticsParams } from "@/lib/analytics";

export interface TrackEventOnMountProps {
  readonly event: string;
  readonly params?: AnalyticsParams;
}

export function TrackEventOnMount({
  event,
  params = {},
}: TrackEventOnMountProps) {
  useEffect(() => {
    trackEvent(event, params);
  }, [event, params]);

  return null;
}
