import { DRIVERS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "./signals";
import { isNonNegative, isObject, nonNegativeOr, parseJson } from "./parsing";

/** Share of a signal's volume (in percent, normalised by their sum) caused by each driver. */
export type Attribution = Partial<Record<Driver, number>>;

/** A user-defined bundle of drivers that can be scaled up and down, e.g. "Production cluster". */
export interface CostUnit {
  id: string;
  name: string;
  /** Driver counts in one unit. */
  counts: Record<Driver, number>;
  /** How many of these units the projection includes. */
  quantity: number;
  /** Traffic relative to the current environment (1.3 = 30% more telemetry per driver). */
  trafficFactor: number;
}

export interface ExtrapolationInputs {
  version: 2;
  /** Which drivers cause each signal's volume, as percent weights. */
  attribution: Record<Signal, Attribution>;
  /** Manual current driver counts that replace detected ones. */
  driverOverrides: Partial<Record<Driver, number>>;
  units: CostUnit[];
  retentionDays: Record<Signal, number>;
}

const DEFAULT_RETENTION: Record<Signal, number> = { logs: 35, traces: 10, metrics: 462, events: 35 };

export const zeroCounts = (): Record<Driver, number> =>
  Object.fromEntries(DRIVERS.map((d) => [d, 0])) as Record<Driver, number>;

export const newUnitId = (): string => `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newUnit(p: Partial<CostUnit> = {}): CostUnit {
  return { id: newUnitId(), name: "New unit", counts: zeroCounts(), quantity: 1, trafficFactor: 1, ...p };
}

export function defaultAttribution(): Record<Signal, Attribution> {
  return Object.fromEntries(SIGNALS.map((s) => [s, { [SIGNAL_META[s].defaultDriver]: 100 }])) as Record<
    Signal,
    Attribution
  >;
}

export function defaultInputs(): ExtrapolationInputs {
  return {
    version: 2,
    attribution: defaultAttribution(),
    driverOverrides: {},
    units: [],
    retentionDays: { ...DEFAULT_RETENTION },
  };
}

const isDriver = (v: unknown): v is Driver => typeof v === "string" && (DRIVERS as readonly string[]).includes(v);

const parseCounts = (raw: unknown): Record<Driver, number> => {
  const o = isObject(raw) ? raw : {};
  return Object.fromEntries(DRIVERS.map((d) => [d, nonNegativeOr(o[d], 0)])) as Record<Driver, number>;
};

function parseAttribution(raw: unknown, fallback: Attribution): Attribution {
  if (!isObject(raw)) return fallback;
  const out: Attribution = {};
  for (const d of DRIVERS) if (isNonNegative(raw[d]) && raw[d] > 0) out[d] = raw[d];
  return out;
}

function parseUnit(raw: unknown, i: number): CostUnit | null {
  if (!isObject(raw)) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `u-${i}`,
    name: typeof raw.name === "string" ? raw.name : `Unit ${i + 1}`,
    counts: parseCounts(raw.counts),
    quantity: nonNegativeOr(raw.quantity, 1),
    trafficFactor: nonNegativeOr(raw.trafficFactor, 1),
  };
}

/**
 * Reads stored inputs. Version 1 inputs (one driver per signal, production counts and a global
 * multiplier) become a 100% attribution per signal and, if production counts were entered, one unit.
 */
export function parseInputs(raw: unknown): ExtrapolationInputs {
  const d = defaultInputs();
  const v = parseJson(raw);
  if (!isObject(v)) return d;

  // Inputs saved by app versions before 1.0.0 use the key "pocOverrides".
  const overrides = isObject(v.driverOverrides) ? v.driverOverrides : isObject(v.pocOverrides) ? v.pocOverrides : {};
  const driverOverrides: Partial<Record<Driver, number>> = {};
  for (const k of DRIVERS) {
    const o = overrides[k];
    if (isNonNegative(o)) driverOverrides[k] = o;
  }
  const retention = isObject(v.retentionDays) ? v.retentionDays : {};
  const retentionDays = Object.fromEntries(
    SIGNALS.map((s) => [s, nonNegativeOr(retention[s], d.retentionDays[s])]),
  ) as Record<Signal, number>;

  if (v.version === 2) {
    const attr = isObject(v.attribution) ? v.attribution : {};
    const units = Array.isArray(v.units) ? v.units.map(parseUnit).filter((u): u is CostUnit => u !== null) : [];
    return {
      version: 2,
      attribution: Object.fromEntries(
        SIGNALS.map((s) => [s, parseAttribution(attr[s], d.attribution[s])]),
      ) as Record<Signal, Attribution>,
      driverOverrides,
      units,
      retentionDays,
    };
  }

  // Version 1.
  const drivers = isObject(v.drivers) ? v.drivers : {};
  const attribution = Object.fromEntries(
    SIGNALS.map((s) => [s, { [isDriver(drivers[s]) ? drivers[s] : SIGNAL_META[s].defaultDriver]: 100 }]),
  ) as Record<Signal, Attribution>;
  const prodCounts = parseCounts(v.prodCounts);
  const units = DRIVERS.some((k) => prodCounts[k] > 0)
    ? [{ id: "u-production", name: "Production", counts: prodCounts, quantity: 1, trafficFactor: nonNegativeOr(v.multiplier, 1) }]
    : [];
  return { version: 2, attribution, driverOverrides, units, retentionDays };
}
