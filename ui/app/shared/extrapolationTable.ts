import { ingestCost, retainCost } from "./cost";
import type { Attribution, CostUnit, ExtrapolationInputs } from "./inputs";
import { ingestPricePerUnit, type CurrencyCode, type RateCard } from "./rateCard";
import { DRIVERS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "./signals";

const DAYS_IN_MONTH = 30;
const finite = (n: number) => typeof n === "number" && Number.isFinite(n);

export interface MonthlyCost {
  ingestCost: number;
  retainCost: number;
  totalCost: number;
}

const ZERO: MonthlyCost = { ingestCost: 0, retainCost: 0, totalCost: 0 };

const add = (a: MonthlyCost, b: MonthlyCost): MonthlyCost => ({
  ingestCost: a.ingestCost + b.ingestCost,
  retainCost: a.retainCost + b.retainCost,
  totalCost: a.totalCost + b.totalCost,
});

/** Monthly cost of a steady `daily` volume of one signal. Linear in `daily`. */
export function monthlyCost(signal: Signal, daily: number, retentionDays: number, card: RateCard): MonthlyCost {
  if (!finite(daily) || daily <= 0) return ZERO;
  const rates = card.rates[signal];
  const ingest = ingestCost(daily * DAYS_IN_MONTH, ingestPricePerUnit(card, signal));
  const retain =
    SIGNAL_META[signal].unit === "GiB"
      ? retainCost(daily, retentionDays, rates.includedRetentionDays, rates.retainPricePerGiBDay, DAYS_IN_MONTH)
      : 0;
  return { ingestCost: ingest, retainCost: retain, totalCost: ingest + retain };
}

/** Detected driver counts with manual overrides applied. */
export function effectiveDrivers(
  detected: Record<Driver, number>,
  overrides: Partial<Record<Driver, number>>,
): Record<Driver, number> {
  return Object.fromEntries(DRIVERS.map((d) => [d, overrides[d] ?? detected[d]])) as Record<Driver, number>;
}

/** Attribution weights as fractions that sum to 1, or all 0 when nothing is attributed. */
export function normaliseAttribution(a: Attribution): Record<Driver, number> {
  const sum = DRIVERS.reduce((acc, d) => acc + (finite(a[d] ?? 0) ? Math.max(0, a[d] ?? 0) : 0), 0);
  return Object.fromEntries(
    DRIVERS.map((d) => [d, sum > 0 ? Math.max(0, a[d] ?? 0) / sum : 0]),
  ) as Record<Driver, number>;
}

/** What one driver (one host, one pod, ...) currently costs, by signal. */
export interface DriverRate {
  driver: Driver;
  currentCount: number;
  /** Volume per day caused by one driver; null when the driver count is 0 and the signal is attributed to it. */
  perDay: Record<Signal, number | null>;
  costPerSignal: Record<Signal, MonthlyCost>;
  cost: MonthlyCost;
  /** True when some signal is attributed to this driver but its current count is 0. */
  unrated: boolean;
}

export function driverRates(
  attribution: Record<Signal, Attribution>,
  current: Record<Driver, number>,
  currentPerDay: Record<Signal, number>,
  retentionDays: Record<Signal, number>,
  card: RateCard,
): DriverRate[] {
  const shares = Object.fromEntries(SIGNALS.map((s) => [s, normaliseAttribution(attribution[s])])) as Record<
    Signal,
    Record<Driver, number>
  >;
  return DRIVERS.map((driver) => {
    const count = current[driver];
    const perDay = {} as Record<Signal, number | null>;
    const costPerSignal = {} as Record<Signal, MonthlyCost>;
    let unrated = false;
    for (const s of SIGNALS) {
      const share = shares[s][driver];
      if (share <= 0) perDay[s] = 0;
      else if (!finite(count) || count <= 0) {
        perDay[s] = null;
        unrated = true;
      } else perDay[s] = (currentPerDay[s] * share) / count;
      costPerSignal[s] = monthlyCost(s, perDay[s] ?? 0, retentionDays[s], card);
    }
    const cost = SIGNALS.reduce((acc, s) => add(acc, costPerSignal[s]), ZERO);
    return { driver, currentCount: count, perDay, costPerSignal, cost, unrated };
  });
}

/** Daily volume per signal caused by `counts` drivers at `trafficFactor`. */
export function volumeFor(counts: Record<Driver, number>, trafficFactor: number, rates: DriverRate[]): Record<Signal, number> {
  const out = Object.fromEntries(SIGNALS.map((s) => [s, 0])) as Record<Signal, number>;
  const f = finite(trafficFactor) ? Math.max(0, trafficFactor) : 1;
  for (const r of rates) {
    const n = counts[r.driver];
    if (!finite(n) || n <= 0) continue;
    for (const s of SIGNALS) out[s] += (r.perDay[s] ?? 0) * n * f;
  }
  return out;
}

const costOfVolume = (perDay: Record<Signal, number>, retentionDays: Record<Signal, number>, card: RateCard) =>
  SIGNALS.reduce((acc, s) => add(acc, monthlyCost(s, perDay[s], retentionDays[s], card)), ZERO);

export interface UnitRow {
  unit: CostUnit;
  /** Monthly cost of one unit. */
  unitCost: MonthlyCost;
  /** Monthly cost of `quantity` units. */
  subtotal: MonthlyCost;
}

export interface SignalRow {
  signal: Signal;
  currentPerDay: number;
  currentCost: MonthlyCost;
  prodPerDay: number;
  prodPerMonth: number;
  cost: MonthlyCost;
}

export interface Projection {
  current: Record<Driver, number>;
  rates: DriverRate[];
  /** Signals attributed to no driver: they are left out of every unit. */
  unattributed: Signal[];
  units: UnitRow[];
  /** Total drivers across all units (quantity × count). */
  projectedCounts: Record<Driver, number>;
  rows: SignalRow[];
  currentTotal: MonthlyCost;
  total: MonthlyCost;
}

export function buildProjection(
  inputs: ExtrapolationInputs,
  detected: Record<Driver, number>,
  currentPerDay: Record<Signal, number>,
  card: RateCard,
): Projection {
  const current = effectiveDrivers(detected, inputs.driverOverrides);
  const rates = driverRates(inputs.attribution, current, currentPerDay, inputs.retentionDays, card);

  const prodPerDay = Object.fromEntries(SIGNALS.map((s) => [s, 0])) as Record<Signal, number>;
  const projectedCounts = Object.fromEntries(DRIVERS.map((d) => [d, 0])) as Record<Driver, number>;
  const units = inputs.units.map((unit) => {
    const perUnit = volumeFor(unit.counts, unit.trafficFactor, rates);
    const q = finite(unit.quantity) ? Math.max(0, unit.quantity) : 0;
    for (const s of SIGNALS) prodPerDay[s] += perUnit[s] * q;
    for (const d of DRIVERS) projectedCounts[d] += (unit.counts[d] || 0) * q;
    const unitCost = costOfVolume(perUnit, inputs.retentionDays, card);
    const subtotal = { ingestCost: unitCost.ingestCost * q, retainCost: unitCost.retainCost * q, totalCost: unitCost.totalCost * q };
    return { unit, unitCost, subtotal };
  });

  const rows = SIGNALS.map((signal) => ({
    signal,
    currentPerDay: currentPerDay[signal],
    currentCost: monthlyCost(signal, currentPerDay[signal], inputs.retentionDays[signal], card),
    prodPerDay: prodPerDay[signal],
    prodPerMonth: prodPerDay[signal] * DAYS_IN_MONTH,
    cost: monthlyCost(signal, prodPerDay[signal], inputs.retentionDays[signal], card),
  }));

  return {
    current,
    rates,
    unattributed: SIGNALS.filter((s) => DRIVERS.every((d) => normaliseAttribution(inputs.attribution[s])[d] === 0)),
    units,
    projectedCounts,
    rows,
    currentTotal: rows.reduce((acc, r) => add(acc, r.currentCost), ZERO),
    total: rows.reduce((acc, r) => add(acc, r.cost), ZERO),
  };
}

const cell = (v: string | number | null): string => {
  if (v === null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (vs: (string | number | null)[]) => vs.map(cell).join(",");

export function projectionCsv(p: Projection, currency: CurrencyCode): string {
  const c = (name: string) => `${name}_${currency}`;
  const signals = [
    line(["signal", "unit", "current_per_day", c("current_cost_month"), "prod_per_day", "prod_per_month", c("ingest_cost_month"), c("retain_cost_month"), c("total_cost_month")]),
    ...p.rows.map((r) =>
      line([SIGNAL_META[r.signal].label, SIGNAL_META[r.signal].unit, r.currentPerDay, r.currentCost.totalCost, r.prodPerDay, r.prodPerMonth, r.cost.ingestCost, r.cost.retainCost, r.cost.totalCost]),
    ),
    line(["Total", "", null, p.currentTotal.totalCost, null, null, p.total.ingestCost, p.total.retainCost, p.total.totalCost]),
  ];
  const units = [
    line(["cost_unit", "quantity", "traffic_factor", ...DRIVERS, c("cost_per_unit_month"), c("subtotal_month")]),
    ...p.units.map((u) =>
      line([u.unit.name, u.unit.quantity, u.unit.trafficFactor, ...DRIVERS.map((d) => u.unit.counts[d]), u.unitCost.totalCost, u.subtotal.totalCost]),
    ),
  ];
  const drivers = [
    line(["driver", "current_count", ...SIGNALS.map((s) => c(`${s}_cost_month_per_driver`)), c("total_cost_month_per_driver")]),
    ...p.rates.map((r) =>
      line([r.driver, r.currentCount, ...SIGNALS.map((s) => (r.perDay[s] === null ? null : r.costPerSignal[s].totalCost)), r.unrated ? null : r.cost.totalCost]),
    ),
  ];
  return [...signals, "", ...units, "", ...drivers].join("\n") + "\n";
}
