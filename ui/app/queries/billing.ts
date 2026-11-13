// Tier 1: billing usage events. These files must stay import-free so
// scripts/validate-queries.sh can load them with Node's type stripping.
// Timeframes are not embedded; hooks pass defaultTimeframeStart/End.

const INGEST_FILTER = `fetch dt.system.events
| filter event.kind == "BILLING_USAGE_EVENT" and endsWith(event.type, "Ingest & Process")
| fieldsAdd bytes = coalesce(toDouble(billed_bytes), toDouble(ingested_bytes), 0.0),
            dp = coalesce(toDouble(data_points), 0.0),
            spans = coalesce(toDouble(ingested_spans), 0.0)`;

/** Q1: ingest totals per billing event.type and bucket. */
export const INGEST_TOTALS = `${INGEST_FILTER}
| summarize {bytes = sum(bytes), dp = sum(dp), spans = sum(spans)}, by:{event.type, usage.bucket}`;

/** Q2: daily ingest trend per billing event.type (bucketed by usage.start, not arrival time). */
export const INGEST_TREND = `${INGEST_FILTER}
| fieldsAdd ts = toTimestamp(usage.start)
| makeTimeseries {bytes = sum(bytes), dp = sum(dp)}, by:{event.type}, interval:1d, time:ts`;

/** Q3: host drivers from host-hour billing. */
export const HOST_DRIVERS = `fetch dt.system.events
| filter event.kind == "BILLING_USAGE_EVENT"
  and in(event.type, {"Full-Stack Monitoring", "Infrastructure Monitoring"})
| summarize {gibh = sum(toDouble(billed_gibibyte_hours)), hosts = countDistinct(dt.smartscape.host)}, by:{event.type}`;

/** Retain: average stored bytes per bucket (Retain events are hourly snapshots). */
export const RETAIN_TOTALS = `fetch dt.system.events
| filter event.kind == "BILLING_USAGE_EVENT" and endsWith(event.type, " - Retain")
| summarize {avg_bytes = avg(toDouble(billed_bytes))}, by:{event.type, usage.bucket}`;

export const BILLING_QUERIES = {
  INGEST_TOTALS,
  INGEST_TREND,
  HOST_DRIVERS,
  RETAIN_TOTALS,
};
