import { DRIVERS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "./signals";
import { isNonNegative, isObject, nonNegativeOr, parseJson } from "./parsing";

export interface ExtrapolationInputs {
  /** Which driver each signal scales with. */
  drivers: Record<Signal, Driver>;
  /** Manual POC driver counts that replace detected ones. */
  pocOverrides: Partial<Record<Driver, number>>;
  /** Production driver counts. 0 means "not entered yet". */
  prodCounts: Record<Driver, number>;
  multiplier: number;
  retentionDays: Record<Signal, number>;
}

const DEFAULT_RETENTION: Record<Signal, number> = { logs: 35, traces: 10, metrics: 462, events: 35 };

export function defaultInputs(): ExtrapolationInputs {
  return {
    drivers: Object.fromEntries(SIGNALS.map((s) => [s, SIGNAL_META[s].defaultDriver])) as Record<Signal, Driver>,
    pocOverrides: {},
    prodCounts: Object.fromEntries(DRIVERS.map((d) => [d, 0])) as Record<Driver, number>,
    multiplier: 1,
    retentionDays: { ...DEFAULT_RETENTION },
  };
}

const isDriver = (v: unknown): v is Driver => typeof v === "string" && (DRIVERS as readonly string[]).includes(v);

export function parseInputs(raw: unknown): ExtrapolationInputs {
  const d = defaultInputs();
  const v = parseJson(raw);
  if (!isObject(v)) return d;
  const drivers = isObject(v.drivers) ? v.drivers : {};
  const overrides = isObject(v.pocOverrides) ? v.pocOverrides : {};
  const prod = isObject(v.prodCounts) ? v.prodCounts : {};
  const retention = isObject(v.retentionDays) ? v.retentionDays : {};

  const pocOverrides: Partial<Record<Driver, number>> = {};
  for (const k of DRIVERS) {
    const o = overrides[k];
    if (isNonNegative(o)) pocOverrides[k] = o;
  }
  return {
    drivers: Object.fromEntries(
      SIGNALS.map((s) => [s, isDriver(drivers[s]) ? drivers[s] : d.drivers[s]]),
    ) as Record<Signal, Driver>,
    pocOverrides,
    prodCounts: Object.fromEntries(DRIVERS.map((k) => [k, nonNegativeOr(prod[k], d.prodCounts[k])])) as Record<Driver, number>,
    multiplier: nonNegativeOr(v.multiplier, d.multiplier),
    retentionDays: Object.fromEntries(
      SIGNALS.map((s) => [s, nonNegativeOr(retention[s], d.retentionDays[s])]),
    ) as Record<Signal, number>,
  };
}
