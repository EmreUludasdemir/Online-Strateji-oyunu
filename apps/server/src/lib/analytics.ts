import type { AnalyticsEventRequest } from "@frontier/shared";

import { incrementCounter } from "./metrics";
import { prisma } from "./prisma";

export async function ingestAnalyticsEvent(userId: string, payload: AnalyticsEventRequest): Promise<void> {
  incrementCounter("product_analytics_events_total", {
    event: payload.event,
  });

  await prisma.analyticsEvent.create({
    data: {
      userId,
      event: payload.event,
      metadata: (payload.metadata ?? {}) as object,
    },
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
