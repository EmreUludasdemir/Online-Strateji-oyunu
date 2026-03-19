import { DEFAULT_LOCALE } from "./i18n";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRelativeTimer(isoTime: string, now: number): string {
  const difference = Math.max(0, new Date(isoTime).getTime() - now);
  const totalSeconds = Math.ceil(difference / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTimeRemaining(value: string, now: number): string {
  const difference = Math.max(0, new Date(value).getTime() - now);
  const totalMinutes = Math.ceil(difference / 60_000);

  if (totalMinutes < 1) {
    return "<1m";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);
}
