import { useCallback, useMemo, useState } from "react";
import { INGEST_TOTALS } from "../queries/billing";
import { FLOW_BUCKET_RECORDS, FLOW_QUERIES } from "../queries/flow";
import { FLOW_WINDOWS, type FlowWindow } from "../shared/flow/rates";
import { useTimeframedDql } from "./useTimeframedDql";

const identity = (r: unknown) => r;

function windowTimeframe(seconds: number, now: number) {
  return { start: new Date(now - seconds * 1000).toISOString(), end: new Date(now).toISOString() };
}

export interface FlowMetrics {
  sources: unknown;
  routing: unknown;
  out: unknown;
  /** 24h billing + pipelines_out, for average record sizes. */
  billing24h: unknown;
  out24h: unknown;
}

/** The three OpenPipeline metrics over `now − window`, plus 24h data for the bytes estimate. */
export function useFlowMetrics(window: FlowWindow) {
  const [now, setNow] = useState(() => Date.now());
  const tf = useMemo(() => windowTimeframe(FLOW_WINDOWS[window].seconds, now), [window, now]);
  const day = useMemo(() => windowTimeframe(86_400, now), [now]);
  const q = FLOW_QUERIES[window];

  const sources = useTimeframedDql(q.sources, tf, identity);
  const routing = useTimeframedDql(q.routing, tf, identity);
  const out = useTimeframedDql(q.out, tf, identity);
  const out24h = useTimeframedDql(FLOW_BUCKET_RECORDS, day, identity);
  const billing24h = useTimeframedDql(INGEST_TOTALS, day, identity);

  const all = [sources, routing, out, out24h, billing24h];
  const ready = routing.data !== undefined && out.data !== undefined;
  const data: FlowMetrics | undefined = ready
    ? {
        sources: sources.data ?? [],
        routing: routing.data,
        out: out.data,
        out24h: out24h.data ?? [],
        billing24h: billing24h.data ?? [],
      }
    : undefined;

  const refresh = useCallback(() => setNow(Date.now()), []);
  return {
    data,
    timeframe: tf,
    isLoading: routing.isLoading || out.isLoading,
    /** Routing/out are required; the others only degrade the view. */
    error: routing.error ?? out.error,
    bytesError: out24h.error ?? billing24h.error,
    isRefreshing: all.some((x) => x.isLoading),
    refetch: refresh,
  };
}
