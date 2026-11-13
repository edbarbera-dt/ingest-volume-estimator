import type { BucketRow, IngestRow, RetainRow, SignalTotal, TrendSeries } from "../queries/parse";
import { ingestCost } from "./cost";
import { perDay } from "./extrapolate";
import { ingestPricePerUnit, type RateCard } from "./rateCard";
import { SIGNALS, SIGNAL_META, signalColor, type Signal } from "./signals";

export interface SignalSummary {
  /** Ingested volume over the timeframe, in the signal unit. */
  volume: number;
  perDay: number;
  ingestCost: number;
  /** Stored volume × timeframe days × retain price (Retain events are billable stored bytes). */
  retainCost: number;
  cost: number;
}

function storedCost(storedGiB: number, days: number, card: RateCard, signal: Signal): number {
  const price = card.rates[signal].retainPricePerGiBDay;
  return price === null ? 0 : storedGiB * days * price;
}

export function signalSummaries(
  totals: Record<Signal, SignalTotal>,
  retain: RetainRow[],
  days: number,
  card: RateCard,
): Record<Signal, SignalSummary> {
  return Object.fromEntries(
    SIGNALS.map((s) => {
      const volume = totals[s].volume;
      const ingest = ingestCost(volume, ingestPricePerUnit(card, s));
      const stored = retain.filter((r) => r.signal === s).reduce((a, r) => a + r.storedGiB, 0);
      const retainCost = storedCost(stored, days, card, s);
      return [s, { volume, perDay: perDay(volume, days), ingestCost: ingest, retainCost, cost: ingest + retainCost }];
    }),
  ) as Record<Signal, SignalSummary>;
}

export interface BucketTableRow {
  bucket: string;
  displayName: string;
  signal: Signal;
  volume: number;
  retentionDays: number | null;
  storedGiB: number | null;
  cost: number;
}

export function bucketRows(
  rows: IngestRow[],
  buckets: BucketRow[],
  retain: RetainRow[],
  days: number,
  card: RateCard,
): BucketTableRow[] {
  return rows
    .map((r) => {
      const meta = buckets.find((b) => b.name === r.bucket);
      const stored = retain.find((x) => x.bucket === r.bucket && x.signal === r.signal);
      const ingest = ingestCost(r.volume, ingestPricePerUnit(card, r.signal));
      const retainCost = stored ? storedCost(stored.storedGiB, days, card, r.signal) : 0;
      return {
        bucket: r.bucket,
        displayName: meta?.displayName ?? r.bucket,
        signal: r.signal,
        volume: r.volume,
        retentionDays: meta ? meta.retentionDays : null,
        storedGiB: stored ? stored.storedGiB : null,
        cost: ingest + retainCost,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export type TrendMode = "volume" | "cost";

export interface SignalTimeseries {
  signal: Signal;
  color: string;
  timeseries: {
    name: string;
    unit?: string;
    datapoints: { start: Date; end: Date; value: number }[];
  };
}

/** Volume mode charts GiB signals only (metrics are data points); cost mode charts all four. */
export function trendToTimeseries(series: TrendSeries[], mode: TrendMode, card: RateCard): SignalTimeseries[] {
  return SIGNALS.flatMap((signal) => {
    if (mode === "volume" && SIGNAL_META[signal].unit !== "GiB") return [];
    const s = series.find((x) => x.signal === signal);
    if (!s) return [];
    const price = mode === "cost" ? ingestPricePerUnit(card, signal) : 1;
    return [
      {
        signal,
        color: signalColor(signal),
        timeseries: {
          name: SIGNAL_META[signal].label,
          datapoints: s.values.map((v, i) => ({
            start: new Date(s.start.getTime() + i * s.intervalMs),
            end: new Date(s.start.getTime() + (i + 1) * s.intervalMs),
            value: v * price,
          })),
        },
      },
    ];
  });
}

export function costShare(summaries: Record<Signal, SignalSummary>) {
  return SIGNALS.filter((s) => summaries[s].cost > 0).map((s) => ({
    category: SIGNAL_META[s].label,
    value: summaries[s].cost,
    color: signalColor(s),
  }));
}
