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

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);
}
