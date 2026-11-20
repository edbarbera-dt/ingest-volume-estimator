import { ingestCost, retainCost, totalCost } from "./cost";
import { projectDaily, projectMonthly, ratePerUnit } from "./extrapolate";
import { ingestPricePerUnit, type RateCard } from "./rateCard";
import { SIGNAL_META, type Signal } from "./signals";

export interface ProjectionInput {
  signal: Signal;
  currentVolumePerDay: number;
  currentDriverCount: number;
  prodCount: number;
  multiplier: number;
  retentionDays: number;
  card: RateCard;
}

export interface ProjectionRow {
  signal: Signal;
  currentPerDay: number;
  ratePerUnit: number | null;
  prodPerDay: number | null;
  prodPerMonth: number | null;
  ingestCost: number;
  retainCost: number;
  totalCost: number;
  /** True when the driver count is 0, so no rate can be derived. */
  disabled: boolean;
}

export function projectSignal(p: ProjectionInput): ProjectionRow {
  const rate = ratePerUnit(p.currentVolumePerDay, p.currentDriverCount);
  const daily = projectDaily(rate, p.prodCount, p.multiplier);
  const monthly = projectMonthly(daily);
  const rates = p.card.rates[p.signal];
  const ingest = monthly === null ? 0 : ingestCost(monthly, ingestPricePerUnit(p.card, p.signal));
  const retain =
    daily === null || SIGNAL_META[p.signal].unit !== "GiB"
      ? 0
      : retainCost(daily, p.retentionDays, rates.includedRetentionDays, rates.retainPricePerGiBDay);
  return {
    signal: p.signal,
    currentPerDay: p.currentVolumePerDay,
    ratePerUnit: rate,
    prodPerDay: daily,
    prodPerMonth: monthly,
    ingestCost: ingest,
    retainCost: retain,
    totalCost: totalCost({ ingest, retain }),
    disabled: rate === null,
  };
}

export function projectTotal(
  rows: Pick<ProjectionRow, "ingestCost" | "retainCost" | "totalCost" | "disabled">[],
): { ingestCost: number; retainCost: number; totalCost: number } {
  return rows
    .filter((r) => !r.disabled)
    .reduce(
      (acc, r) => ({
        ingestCost: acc.ingestCost + r.ingestCost,
        retainCost: acc.retainCost + r.retainCost,
        totalCost: acc.totalCost + r.totalCost,
      }),
      { ingestCost: 0, retainCost: 0, totalCost: 0 },
    );
}
