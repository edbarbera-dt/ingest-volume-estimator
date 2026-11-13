const finite = (n: number) => typeof n === "number" && Number.isFinite(n);

/** Average volume per day over a timeframe of `days` days. */
export function perDay(volume: number, days: number): number {
  if (!finite(volume) || !finite(days) || days <= 0) return 0;
  return volume / days;
}

/** POC volume per day per driver unit (e.g. GiB/day per host). Null when the driver count is unusable. */
export function ratePerUnit(volumePerDay: number, driverCount: number): number | null {
  if (!finite(volumePerDay) || !finite(driverCount) || driverCount <= 0) return null;
  return volumePerDay / driverCount;
}

/** Projected production volume per day. */
export function projectDaily(
  rate: number | null,
  prodCount: number,
  multiplier = 1,
): number | null {
  if (rate === null || !finite(rate)) return null;
  if (!finite(prodCount) || prodCount < 0) return null;
  if (!finite(multiplier) || multiplier < 0) return null;
  return rate * prodCount * multiplier;
}

export function projectMonthly(daily: number | null, days = 30): number | null {
  if (daily === null || !finite(daily)) return null;
  return daily * days;
}
