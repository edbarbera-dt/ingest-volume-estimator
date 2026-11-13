import { useMemo } from "react";
import { INGEST_TOTALS, RETAIN_TOTALS } from "../queries/billing";
import {
  parseIngestTotals,
  parseRetainTotals,
  totalsBySignal,
  type IngestRow,
  type RetainRow,
  type SignalTotal,
} from "../queries/parse";
import type { Signal } from "../shared/signals";
import { useTimeframe } from "../context/Timeframe";
import { useTimeframedDql, type QueryResult } from "./useTimeframedDql";

export interface IngestTotals {
  rows: IngestRow[];
  bySignal: Record<Signal, SignalTotal>;
}

/** Q1: ingest volume per signal and bucket over the page timeframe. */
export function useIngestTotals(): QueryResult<IngestTotals> {
  const tf = useTimeframe();
  const q = useTimeframedDql(INGEST_TOTALS, tf, parseIngestTotals);
  const data = useMemo(
    () => (q.data ? { rows: q.data, bySignal: totalsBySignal(q.data) } : undefined),
    [q.data],
  );
  return { ...q, data };
}

/** Average stored volume per bucket (Retain events). */
export function useRetainTotals(): QueryResult<RetainRow[]> {
  const tf = useTimeframe();
  return useTimeframedDql(RETAIN_TOTALS, tf, parseRetainTotals);
}
