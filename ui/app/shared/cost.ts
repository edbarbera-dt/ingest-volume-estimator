const valid = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Ingest & Process cost: volume (in the price's unit) × unit price. */
export function ingestCost(volume: number, pricePerUnit: number): number {
  if (!valid(volume) || !valid(pricePerUnit)) return 0;
  return volume * pricePerUnit;
}

/**
 * Monthly Retain cost at steady state. With `dailyVolume` GiB arriving per day and kept for
 * `retentionDays`, the stored volume beyond the included days is dailyVolume × (retention − included)
 * GiB, billed per GiB-day for every day of the month.
 */
export function retainCost(
  dailyVolume: number,
  retentionDays: number,
  includedDays: number,
  pricePerGiBDay: number | null,
  daysInMonth = 30,
): number {
  if (!valid(dailyVolume) || !valid(retentionDays) || !valid(pricePerGiBDay)) return 0;
  const included = valid(includedDays) ? includedDays : 0;
  const billableDays = Math.max(0, retentionDays - included);
  return dailyVolume * billableDays * pricePerGiBDay * daysInMonth;
}

export function totalCost(parts: { ingest: number; retain: number }): number {
  return (valid(parts.ingest) ? parts.ingest : 0) + (valid(parts.retain) ? parts.retain : 0);
}
