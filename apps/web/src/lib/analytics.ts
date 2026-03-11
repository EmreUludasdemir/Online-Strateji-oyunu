import type { AnalyticsEventType, AnalyticsMetadata } from "@frontier/shared";

import { api } from "../api";

const STORAGE_PREFIX = "frontier.analytics.";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function trackAnalyticsEvent(event: AnalyticsEventType, metadata?: AnalyticsMetadata): void {
  void api.trackAnalytics({ event, metadata }).catch(() => undefined);
}

export function trackAnalyticsOnce(key: string, event: AnalyticsEventType, metadata?: AnalyticsMetadata): void {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  if (canUseStorage() && window.localStorage.getItem(storageKey)) {
    return;
  }

  if (canUseStorage()) {
    window.localStorage.setItem(storageKey, "1");
  }

  trackAnalyticsEvent(event, metadata);
}
