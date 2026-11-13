// OpenPipeline self-monitoring metrics for the Flow page. Import-free (see billing.ts).
// Timeframes come from the hook (now − window .. now); only the interval is fixed per window.

export type FlowWindowId = "5m" | "1h" | "24h";

const INTERVAL: Record<FlowWindowId, string> = { "5m": "1m", "1h": "1m", "24h": "15m" };

const sources = (interval: string) =>
  `timeseries r = sum(dt.sfm.openpipeline.ingest_sources_in.records), interval: ${interval},
  by:{configuration, dt.openpipeline.source}`;

const routing = (interval: string) =>
  `timeseries r = sum(dt.sfm.openpipeline.routing.records), interval: ${interval},
  by:{configuration, dt.openpipeline.source, pipeline_id, route_name}`;

const out = (interval: string) =>
  `timeseries r = sum(dt.sfm.openpipeline.pipelines_out.records), interval: ${interval},
  by:{configuration, pipeline_id, bucket_name}`;

export const FLOW_QUERIES: Record<FlowWindowId, { sources: string; routing: string; out: string }> = {
  "5m": { sources: sources(INTERVAL["5m"]), routing: routing(INTERVAL["5m"]), out: out(INTERVAL["5m"]) },
  "1h": { sources: sources(INTERVAL["1h"]), routing: routing(INTERVAL["1h"]), out: out(INTERVAL["1h"]) },
  "24h": { sources: sources(INTERVAL["24h"]), routing: routing(INTERVAL["24h"]), out: out(INTERVAL["24h"]) },
};

/** Records per bucket over the last 24h, for the average record size (run with a 24h timeframe). */
export const FLOW_BUCKET_RECORDS = `timeseries r = sum(dt.sfm.openpipeline.pipelines_out.records, scalar: true),
  by:{configuration, bucket_name}`;
