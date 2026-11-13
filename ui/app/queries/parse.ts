import { SIGNALS, SIGNAL_META, parseBillingEventType, type Driver, type Signal } from "../shared/signals";
import { GIB, toNumber } from "../shared/units";

type Rec = Record<string, unknown>;

const records = (input: unknown): Rec[] =>
  Array.isArray(input)
    ? input.filter((r): r is Rec => typeof r === "object" && r !== null && !Array.isArray(r))
    : [];

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Converts raw bytes / data points to the signal's display unit. */
function toUnit(signal: Signal, bytes: number, dataPoints: number): number {
  return SIGNAL_META[signal].unit === "data points" ? dataPoints : bytes / GIB;
}

export interface IngestRow {
  signal: Signal;
  bucket: string;
  bytes: number;
  dataPoints: number;
  spans: number;
  /** In the signal's unit: GiB, or data points for metrics. */
  volume: number;
}

/** Q1 records → typed rows (only Ingest & Process types for the four signals). */
export function parseIngestTotals(input: unknown): IngestRow[] {
  const rows: IngestRow[] = [];
  for (const r of records(input)) {
    const parsed = parseBillingEventType(str(r["event.type"]));
    if (!parsed || parsed.kind !== "ingest") continue;
    const bytes = toNumber(r.bytes);
    const dataPoints = toNumber(r.dp);
    rows.push({
      signal: parsed.signal,
      bucket: str(r["usage.bucket"]) || "(none)",
      bytes,
      dataPoints,
      spans: toNumber(r.spans),
      volume: toUnit(parsed.signal, bytes, dataPoints),
    });
  }
  return rows;
}

export interface SignalTotal {
  volume: number;
  bytes: number;
  dataPoints: number;
  spans: number;
}

export function emptyTotals(): Record<Signal, SignalTotal> {
  return Object.fromEntries(
    SIGNALS.map((s) => [s, { volume: 0, bytes: 0, dataPoints: 0, spans: 0 }]),
  ) as Record<Signal, SignalTotal>;
}

export function totalsBySignal(rows: IngestRow[]): Record<Signal, SignalTotal> {
  const totals = emptyTotals();
  for (const r of rows) {
    const t = totals[r.signal];
    t.volume += r.volume;
    t.bytes += r.bytes;
    t.dataPoints += r.dataPoints;
    t.spans += r.spans;
  }
  return totals;
}

export interface TrendSeries {
  signal: Signal;
  start: Date;
  end: Date;
  intervalMs: number;
  /** One value per interval, in the signal's unit. */
  values: number[];
}

const numArray = (v: unknown): number[] => (Array.isArray(v) ? v.map(toNumber) : []);

/** Q2 makeTimeseries records → one series per signal. */
export function parseTrend(input: unknown): TrendSeries[] {
  const out: TrendSeries[] = [];
  for (const r of records(input)) {
    const parsed = parseBillingEventType(str(r["event.type"]));
    if (!parsed || parsed.kind !== "ingest") continue;
    const tf = (r.timeframe ?? {}) as Rec;
    const start = new Date(str(tf.start));
    const end = new Date(str(tf.end));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const bytes = numArray(r.bytes);
    const dp = numArray(r.dp);
    const n = Math.max(bytes.length, dp.length);
    const values = Array.from({ length: n }, (_, i) =>
      toUnit(parsed.signal, bytes[i] ?? 0, dp[i] ?? 0),
    );
    out.push({
      signal: parsed.signal,
      start,
      end,
      // interval is a duration in nanoseconds, serialised as a string
      intervalMs: toNumber(r.interval) / 1e6,
      values,
    });
  }
  return out;
}

export interface HostDrivers {
  hosts: number;
  gibHours: number;
}

/** Q3 records → distinct billed hosts and memory GiB-hours. */
export function parseHostDrivers(input: unknown): HostDrivers {
  let hosts = 0;
  let gibHours = 0;
  for (const r of records(input)) {
    hosts += toNumber(r.hosts);
    gibHours += toNumber(r.gibh);
  }
  return { hosts, gibHours };
}

const SMARTSCAPE_TYPE: Record<string, Driver> = {
  HOST: "hosts",
  SERVICE: "services",
  K8S_POD: "pods",
  K8S_CLUSTER: "clusters",
  CONTAINER: "containers",
};

/** Q4 records → entity counts per driver (0 for absent types). */
export function parseEntityDrivers(input: unknown): Record<Driver, number> {
  const out: Record<Driver, number> = { hosts: 0, services: 0, pods: 0, clusters: 0, containers: 0 };
  for (const r of records(input)) {
    const driver = SMARTSCAPE_TYPE[str(r.type)];
    if (driver) out[driver] += toNumber(r.n);
  }
  return out;
}

export interface RetainRow {
  signal: Signal;
  bucket: string;
  storedGiB: number;
}

export function parseRetainTotals(input: unknown): RetainRow[] {
  const rows: RetainRow[] = [];
  for (const r of records(input)) {
    const parsed = parseBillingEventType(str(r["event.type"]));
    if (!parsed || parsed.kind !== "retain") continue;
    rows.push({
      signal: parsed.signal,
      bucket: str(r["usage.bucket"]) || "(none)",
      storedGiB: toNumber(r.avg_bytes) / GIB,
    });
  }
  return rows;
}

const TABLE_SIGNAL: Record<string, Signal> = {
  logs: "logs",
  spans: "traces",
  metrics: "metrics",
  events: "events",
  bizevents: "events",
};

export function bucketSignal(table: string): Signal | null {
  return Object.prototype.hasOwnProperty.call(TABLE_SIGNAL, table) ? TABLE_SIGNAL[table] : null;
}

export interface BucketRow {
  name: string;
  displayName: string;
  table: string;
  signal: Signal | null;
  retentionDays: number;
  estimatedBytes: number;
  records: number;
}

export function parseBuckets(input: unknown): BucketRow[] {
  return records(input).map((r) => {
    const table = str(r["dt.system.table"]);
    return {
      name: str(r.name),
      displayName: str(r.display_name) || str(r.name),
      table,
      signal: bucketSignal(table),
      retentionDays: toNumber(r.retention_days),
      estimatedBytes: toNumber(r.estimated_uncompressed_bytes),
      records: toNumber(r.records),
    };
  });
}

export interface BreakdownRow {
  key: string;
  value: number;
  records: number | null;
  /** Share of the total over all returned groups, 0..1. */
  share: number;
}

export function parseBreakdown(input: unknown): BreakdownRow[] {
  const rows = records(input).map((r) => ({
    key: str(r.key) || "(none)",
    value: toNumber(r.value),
    records: r.records === undefined || r.records === null ? null : toNumber(r.records),
  }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return rows
    .map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}
