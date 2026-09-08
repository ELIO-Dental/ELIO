/**
 * Calendar-day helpers for Flow dashboard date filters.
 * Match legacy ElioFlow (pages/index.tsx getDateRange): local midnights, not UTC ISO drift.
 */

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local start of day. */
export function parseLocalDateStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Parse YYYY-MM-DD as local end of day. */
export function parseLocalDateEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Legacy-compatible preset → { from, to } as YYYY-MM-DD (local).
 * `all` / `custom` return empty (caller handles custom inputs).
 */
export function flowDatePresetRange(preset: string): { from?: string; to?: string } {
  if (preset === "all" || preset === "custom") return {};

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = localYmd(today);

  switch (preset) {
    case "this-week":
      return { from: localYmd(mondayOf(today)), to: end };
    case "last-week": {
      const start = mondayOf(today);
      start.setDate(start.getDate() - 7);
      const lastSun = new Date(start);
      lastSun.setDate(start.getDate() + 6);
      return { from: localYmd(start), to: localYmd(lastSun) };
    }
    case "this-month":
      return { from: localYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
    case "last-month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: localYmd(start), to: localYmd(last) };
    }
    case "3m": {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 3);
      return { from: localYmd(start), to: end };
    }
    case "6m": {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 6);
      return { from: localYmd(start), to: end };
    }
    case "12m": {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 12);
      return { from: localYmd(start), to: end };
    }
    default:
      return {};
  }
}
