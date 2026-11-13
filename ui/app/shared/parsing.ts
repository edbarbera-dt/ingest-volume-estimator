/** Small helpers for reading untrusted stored JSON. */

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isNonNegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Accepts a JSON string or an already-parsed value; returns undefined for invalid JSON. */
export function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export const nonNegativeOr = (v: unknown, fallback: number): number =>
  isNonNegative(v) ? v : fallback;
