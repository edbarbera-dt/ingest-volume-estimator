import { DRIVERS, SIGNALS, type Driver, type Signal } from "./signals";
import { isObject, nonNegativeOr, parseJson } from "./parsing";

export interface Baseline {
  id: string;
  label: string;
  createdAt: string;
  timeframe: { start: string; end: string; days: number };
  /** Average ingest per day in each signal's unit (GiB or data points). */
  volumePerDay: Record<Signal, number>;
  drivers: Record<Driver, number>;
}

export interface BaselineStore {
  baselines: Baseline[];
  activeId: string | null;
}

const emptyStore = (): BaselineStore => ({ baselines: [], activeId: null });

function parseBaseline(v: unknown): Baseline | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== "string" || typeof v.label !== "string") return null;
  const tf = isObject(v.timeframe) ? v.timeframe : {};
  const vol = isObject(v.volumePerDay) ? v.volumePerDay : {};
  const drv = isObject(v.drivers) ? v.drivers : {};
  return {
    id: v.id,
    label: v.label,
    createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
    timeframe: {
      start: typeof tf.start === "string" ? tf.start : "",
      end: typeof tf.end === "string" ? tf.end : "",
      days: nonNegativeOr(tf.days, 0),
    },
    volumePerDay: Object.fromEntries(SIGNALS.map((s) => [s, nonNegativeOr(vol[s], 0)])) as Record<Signal, number>,
    drivers: Object.fromEntries(DRIVERS.map((d) => [d, nonNegativeOr(drv[d], 0)])) as Record<Driver, number>,
  };
}

/** Reads the stored baseline list; corrupt entries are dropped. */
export function parseBaselineStore(raw: unknown): BaselineStore {
  const v = parseJson(raw);
  if (!isObject(v) || !Array.isArray(v.baselines)) return emptyStore();
  const baselines = v.baselines.map(parseBaseline).filter((b): b is Baseline => b !== null);
  const activeId =
    typeof v.activeId === "string" && baselines.some((b) => b.id === v.activeId) ? v.activeId : null;
  return { baselines, activeId };
}

export function addBaseline(store: BaselineStore, baseline: Baseline): BaselineStore {
  return { ...store, baselines: [baseline, ...store.baselines.filter((b) => b.id !== baseline.id)] };
}

export function removeBaseline(store: BaselineStore, id: string): BaselineStore {
  return {
    baselines: store.baselines.filter((b) => b.id !== id),
    activeId: store.activeId === id ? null : store.activeId,
  };
}

export function setActiveBaseline(store: BaselineStore, id: string | null): BaselineStore {
  if (id !== null && !store.baselines.some((b) => b.id === id)) return store;
  return { ...store, activeId: id };
}

export interface Delta {
  from: number;
  to: number;
  delta: number;
  /** Relative change, null when `from` is 0. */
  pct: number | null;
}

/** Per-day volume deltas from baseline `a` to baseline `b`. */
export function compareBaselines(a: Baseline, b: Baseline): Record<Signal, Delta> {
  return Object.fromEntries(
    SIGNALS.map((s) => {
      const from = a.volumePerDay[s];
      const to = b.volumePerDay[s];
      return [s, { from, to, delta: to - from, pct: from > 0 ? (to - from) / from : null }];
    }),
  ) as Record<Signal, Delta>;
}

export function changeFromBaseline(
  currentPerDay: number,
  baseline: Baseline | null,
  signal: Signal,
): { delta: number; pct: number | null } | null {
  if (!baseline) return null;
  const from = baseline.volumePerDay[signal];
  const delta = currentPerDay - from;
  return { delta, pct: from > 0 ? delta / from : null };
}

export function makeBaseline(p: {
  label: string;
  timeframe: { start: string; end: string; days: number };
  volumes: Record<Signal, number>;
  drivers: Record<Driver, number>;
  now?: Date;
  id?: string;
}): Baseline {
  const now = p.now ?? new Date();
  const label = p.label.trim() || `Baseline ${now.toISOString().slice(0, 10)}`;
  const days = p.timeframe.days > 0 ? p.timeframe.days : 1;
  return {
    id: p.id ?? `b-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: now.toISOString(),
    timeframe: { ...p.timeframe },
    volumePerDay: Object.fromEntries(SIGNALS.map((s) => [s, p.volumes[s] / days])) as Record<Signal, number>,
    drivers: { ...p.drivers },
  };
}
