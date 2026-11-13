import type { ExtrapolationInputs } from "./inputs";
import { projectSignal, projectTotal, type ProjectionRow } from "./projection";
import type { CurrencyCode, RateCard } from "./rateCard";
import { DRIVERS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "./signals";

export interface ProjectionTableRow extends ProjectionRow {
  driver: Driver;
  pocDriverCount: number;
  prodCount: number;
}

export interface Projection {
  rows: ProjectionTableRow[];
  total: { ingestCost: number; retainCost: number; totalCost: number };
}

/** Detected POC counts with manual overrides applied. */
export function effectiveDrivers(
  detected: Record<Driver, number>,
  overrides: Partial<Record<Driver, number>>,
): Record<Driver, number> {
  return Object.fromEntries(DRIVERS.map((d) => [d, overrides[d] ?? detected[d]])) as Record<Driver, number>;
}

export function buildProjection(
  inputs: ExtrapolationInputs,
  detected: Record<Driver, number>,
  pocPerDay: Record<Signal, number>,
  card: RateCard,
): Projection {
  const poc = effectiveDrivers(detected, inputs.pocOverrides);
  const rows = SIGNALS.map((signal) => {
    const driver = inputs.drivers[signal];
    const row = projectSignal({
      signal,
      pocVolumePerDay: pocPerDay[signal],
      pocDriverCount: poc[driver],
      prodCount: inputs.prodCounts[driver],
      multiplier: inputs.multiplier,
      retentionDays: inputs.retentionDays[signal],
      card,
    });
    return { ...row, driver, pocDriverCount: poc[driver], prodCount: inputs.prodCounts[driver] };
  });
  return { rows, total: projectTotal(rows) };
}

const cell = (v: string | number | null): string => {
  if (v === null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function projectionCsv(p: Projection, currency: CurrencyCode): string {
  const header = [
    "signal",
    "unit",
    "driver",
    "poc_per_day",
    "poc_driver_count",
    "rate_per_unit",
    "prod_driver_count",
    "prod_per_day",
    "prod_per_month",
    `ingest_cost_month_${currency}`,
    `retain_cost_month_${currency}`,
    `total_cost_month_${currency}`,
  ];
  const lines = p.rows.map((r) =>
    [
      SIGNAL_META[r.signal].label,
      SIGNAL_META[r.signal].unit,
      r.driver,
      r.pocPerDay,
      r.pocDriverCount,
      r.ratePerUnit,
      r.prodCount,
      r.prodPerDay,
      r.prodPerMonth,
      r.disabled ? null : r.ingestCost,
      r.disabled ? null : r.retainCost,
      r.disabled ? null : r.totalCost,
    ]
      .map(cell)
      .join(","),
  );
  const total = ["Total", "", "", null, null, null, null, null, null, p.total.ingestCost, p.total.retainCost, p.total.totalCost]
    .map(cell)
    .join(",");
  return [header.join(","), ...lines, total].join("\n") + "\n";
}
