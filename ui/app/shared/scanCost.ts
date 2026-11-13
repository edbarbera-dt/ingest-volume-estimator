import type { BreakdownRow } from "../queries/parse";
import { CURRENCIES, type CurrencyCode } from "./rateCard";
import type { Signal } from "./signals";

/**
 * Query price for logs, traces and events, USD per GiB scanned.
 * Source: https://www.dynatrace.com/pricing/rate-card/ (read 2026-11-13).
 */
export const QUERY_PRICE_PER_GIB_SCANNED = 0.0035;

export interface ScanEstimate {
  scannedGiB: number | null;
  cost: number | null;
  note: string;
}

/**
 * Rough scan size for a tier-3 breakdown: the signal's billed GiB per day × the window.
 * Billed bytes include attributes, so this is an upper-bound estimate.
 */
export function scanEstimate(
  def: { signal: Signal; source: "raw" | "billing"; measure: string },
  billedGiBPerDay: number,
  windowDays: number,
  currency: CurrencyCode,
): ScanEstimate {
  if (def.source === "billing") {
    return { scannedGiB: null, cost: null, note: "Reads billing usage events only; negligible scan cost." };
  }
  if (def.signal === "metrics") {
    return { scannedGiB: null, cost: null, note: "Reads metric series metadata; no Grail scan cost." };
  }
  const scanned = Math.max(0, billedGiBPerDay) * Math.max(0, windowDays);
  return {
    scannedGiB: scanned,
    cost: scanned * QUERY_PRICE_PER_GIB_SCANNED * CURRENCIES[currency].perUsd,
    note: "Estimate from billed volume at the list query price; actual scan can be lower.",
  };
}

/** Top `n` rows plus one "Other (k)" row with the remainder. */
export function topWithShare(rows: BreakdownRow[], n: number): BreakdownRow[] {
  if (rows.length <= n) return rows;
  const rest = rows.slice(n);
  const other: BreakdownRow = {
    key: `Other (${rest.length})`,
    value: rest.reduce((a, r) => a + r.value, 0),
    records: rest.every((r) => r.records === null) ? null : rest.reduce((a, r) => a + (r.records ?? 0), 0),
    share: rest.reduce((a, r) => a + r.share, 0),
  };
  return [...rows.slice(0, n), other];
}
