/** A resolved time from a TimeframeSelector (structurally the Strato TimeValue). */
export interface TimeValueLike {
  absoluteDate: string;
  value: string;
  type: "expression" | "iso8601";
}

/** A time as typed into a TimeframeSelector: an expression/ISO string or a resolved TimeValue. */
export type TimeInput = string | TimeValueLike;

/** Either both ends as strings (initial value) or both resolved (from onChange). */
export type TimeframeInput = { from: string; to: string } | { from: TimeValueLike; to: TimeValueLike };

export interface ResolvedTimeframe {
  start: string;
  end: string;
  /** Length in days (fractional). */
  days: number;
}

const DAY_MS = 86_400_000;
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: DAY_MS,
  w: 7 * DAY_MS,
};

const RELATIVE = /^now(?:\s*-\s*(\d+(?:\.\d+)?)\s*([smhdw]))?$/;

export function resolveTime(input: TimeInput, now: Date = new Date()): Date | null {
  if (typeof input === "object" && input !== null) {
    const d = new Date(input.absoluteDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const m = RELATIVE.exec(trimmed);
  if (m) {
    if (!m[1]) return new Date(now.getTime());
    return new Date(now.getTime() - Number(m[1]) * UNIT_MS[m[2]]);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const DEFAULT_TIMEFRAME: TimeframeInput = { from: "now-7d", to: "now" };

export function resolveTimeframe(
  value: TimeframeInput | null | undefined,
  now: Date = new Date(),
): ResolvedTimeframe {
  const from = value ? resolveTime(value.from, now) : null;
  const to = value ? resolveTime(value.to, now) : null;
  if (!from || !to || to.getTime() <= from.getTime()) {
    return value === DEFAULT_TIMEFRAME ? fallback(now) : resolveTimeframe(DEFAULT_TIMEFRAME, now);
  }
  return {
    start: from.toISOString(),
    end: to.toISOString(),
    days: (to.getTime() - from.getTime()) / DAY_MS,
  };
}

function fallback(now: Date): ResolvedTimeframe {
  return { start: new Date(now.getTime() - 7 * DAY_MS).toISOString(), end: now.toISOString(), days: 7 };
}

/** The last `hours` of a timeframe (or the whole timeframe if it is shorter). */
export function clampToLastHours(tf: ResolvedTimeframe, hours: number): ResolvedTimeframe {
  if (tf.days * 24 <= hours) return tf;
  const end = new Date(tf.end);
  return {
    start: new Date(end.getTime() - hours * 3_600_000).toISOString(),
    end: tf.end,
    days: hours / 24,
  };
}
