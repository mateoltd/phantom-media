const compactCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 12,140,000 becomes "12.1M". */
export function formatCount(value: number): string {
  return compactCount.format(value);
}

// A fixed locale and zone, so the server and the browser print the same text.
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "2026-10-09T18:42:37Z" becomes "Oct 9, 2026". */
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : shortDate.format(date);
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
