// Tier 3: top contributors. Import-free (see billing.ts).
// Every breakdown returns rows of {key, value} and optionally {records}.
// Raw-table breakdowns scan data and default to the last 24h.

export type BreakdownSignal = "logs" | "traces" | "metrics" | "events";

export interface BreakdownDef {
  id: string;
  signal: BreakdownSignal;
  label: string;
  /** What `value` measures. */
  measure: "content bytes" | "spans" | "data points" | "billed bytes" | "series" | "events";
  /** "raw" scans the signal's table; "billing" reads dt.system.events only. */
  source: "raw" | "billing";
  query: string;
}

const TOP = `| sort value desc
| limit 1000`;

const logsBy = (field: string) => `fetch logs
| summarize {value = sum(stringLength(content)), records = count()}, by:{key = coalesce(${field}, "(none)")}
${TOP}`;

export const LOGS_BY_SOURCE = logsBy("log.source");
export const LOGS_BY_NAMESPACE = logsBy("k8s.namespace.name");
export const LOGS_BY_HOST = logsBy("host.name");

export const SPANS_BY_SERVICE = `fetch spans
| summarize {value = count()}, by:{key = coalesce(service.name, "(none)")}
${TOP}`;

export const METRICS_BY_MONITORING_SOURCE = `fetch dt.system.events
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Metrics - Ingest & Process"
| summarize {value = sum(toDouble(data_points))}, by:{key = coalesce(monitoring_source, "(none)")}
${TOP}`;

export const METRICS_BY_KEY = `fetch metric.series
| summarize {value = count()}, by:{key = metric.key}
${TOP}`;

export const EVENTS_BY_BILLING_CATEGORY = `fetch dt.system.events
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Events - Ingest & Process"
| summarize {value = sum(toDouble(billed_bytes))}, by:{key = coalesce(event.billing.category, "(none)")}
${TOP}`;

export const EVENTS_BY_PROVIDER = `fetch events
| summarize {value = count()}, by:{key = coalesce(event.provider, "(none)")}
${TOP}`;

export const BREAKDOWNS: readonly BreakdownDef[] = [
  { id: "logs-source", signal: "logs", label: "Log source", measure: "content bytes", source: "raw", query: LOGS_BY_SOURCE },
  { id: "logs-namespace", signal: "logs", label: "K8s namespace", measure: "content bytes", source: "raw", query: LOGS_BY_NAMESPACE },
  { id: "logs-host", signal: "logs", label: "Host", measure: "content bytes", source: "raw", query: LOGS_BY_HOST },
  { id: "traces-service", signal: "traces", label: "Service", measure: "spans", source: "raw", query: SPANS_BY_SERVICE },
  { id: "metrics-source", signal: "metrics", label: "Monitoring source", measure: "data points", source: "billing", query: METRICS_BY_MONITORING_SOURCE },
  { id: "metrics-key", signal: "metrics", label: "Metric key", measure: "series", source: "raw", query: METRICS_BY_KEY },
  { id: "events-category", signal: "events", label: "Billing category", measure: "billed bytes", source: "billing", query: EVENTS_BY_BILLING_CATEGORY },
  { id: "events-provider", signal: "events", label: "Event provider", measure: "events", source: "raw", query: EVENTS_BY_PROVIDER },
];

export const BREAKDOWN_QUERIES = Object.fromEntries(BREAKDOWNS.map((b) => [b.id, b.query]));
