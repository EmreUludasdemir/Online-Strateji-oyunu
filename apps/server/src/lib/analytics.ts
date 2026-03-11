import type { AnalyticsEventRequest } from "@frontier/shared";

import { incrementCounter } from "./metrics";

export function ingestAnalyticsEvent(userId: string, payload: AnalyticsEventRequest): void {
  incrementCounter("product_analytics_events_total", {
    event: payload.event,
  });

  console.info(
    JSON.stringify({
      channel: "analytics",
      at: new Date().toISOString(),
      userId,
      event: payload.event,
      metadata: payload.metadata ?? {},
    }),
  );
}
