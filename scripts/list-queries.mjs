// Prints every DQL constant as one JSON line: {name, tier, fields, query}.
// Used by validate-queries.sh. Needs Node >= 23.6 (type stripping).
const dir = new URL("../ui/app/queries/", import.meta.url);
const load = (f) => import(new URL(f, dir).href);

const billing = await load("billing.ts");
const drivers = await load("drivers.ts");
const buckets = await load("buckets.ts");
const breakdown = await load("breakdown.ts");
const flow = await load("flow.ts");

const out = [
  { name: "INGEST_TOTALS", tier: "billing", fields: ["event.type", "bytes", "dp", "spans"], query: billing.INGEST_TOTALS },
  { name: "INGEST_TREND", tier: "billing", fields: ["event.type", "bytes", "dp"], query: billing.INGEST_TREND },
  { name: "HOST_DRIVERS", tier: "billing", fields: ["event.type", "gibh", "hosts"], query: billing.HOST_DRIVERS },
  { name: "RETAIN_TOTALS", tier: "billing", fields: ["event.type", "avg_bytes"], query: billing.RETAIN_TOTALS },
  { name: "ENTITY_DRIVERS", tier: "billing", fields: ["type", "n"], query: drivers.ENTITY_DRIVERS },
  { name: "BUCKETS", tier: "billing", fields: ["name", "retention_days"], query: buckets.BUCKETS },
  ...Object.entries(flow.FLOW_QUERIES).flatMap(([w, q]) => [
    { name: `FLOW_SOURCES_${w}`, tier: "flow", hours: w === "24h" ? 24 : 1, fields: ["configuration", "r"], query: q.sources },
    { name: `FLOW_ROUTING_${w}`, tier: "flow", hours: w === "24h" ? 24 : 1, fields: ["configuration", "r"], query: q.routing },
    { name: `FLOW_OUT_${w}`, tier: "flow", hours: w === "24h" ? 24 : 1, fields: ["configuration", "bucket_name", "r"], query: q.out },
  ]),
  { name: "FLOW_BUCKET_RECORDS", tier: "flow", hours: 24, fields: ["bucket_name", "r"], query: flow.FLOW_BUCKET_RECORDS },
  ...breakdown.BREAKDOWNS.map((b) => ({ name: `BREAKDOWN_${b.id}`, tier: "breakdown", fields: ["key", "value"], query: b.query })),
];
for (const q of out) console.log(JSON.stringify(q));
