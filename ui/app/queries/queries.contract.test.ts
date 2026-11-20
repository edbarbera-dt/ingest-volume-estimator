// Contract tests: every DQL constant is well formed, the committed tenant fixtures still carry
// the fields the parsers read, the parsers turn them into usable numbers, and
// scripts/list-queries.mjs (used by validate-queries.sh) covers every query the app runs.
import * as fs from "node:fs";
import * as path from "node:path";
import * as billing from "./billing";
import * as drivers from "./drivers";
import * as buckets from "./buckets";
import * as breakdown from "./breakdown";
import * as flow from "./flow";
import {
  parseBreakdown,
  parseBuckets,
  parseEntityDrivers,
  parseHostDrivers,
  parseIngestTotals,
  parseRetainTotals,
  parseTrend,
} from "./parse";
import { avgRecordSizes } from "../shared/flow/bytesEstimate";

const ROOT = path.resolve(__dirname, "../../..");
const QUERY_FIXTURES = path.join(__dirname, "__fixtures__");
const FLOW_FIXTURES = path.resolve(__dirname, "../shared/flow/__fixtures__");

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
const records = (file: string) => readJson(file) as Record<string, unknown>[];

const stringExports = (mod: Record<string, unknown>) =>
  Object.entries(mod).filter((e): e is [string, string] => typeof e[1] === "string");

/** Every query string the app can send, keyed by a readable name. */
const ALL_QUERIES: [string, string][] = [
  ...stringExports(billing),
  ...stringExports(drivers),
  ...stringExports(buckets),
  ...breakdown.BREAKDOWNS.map((b): [string, string] => [`BREAKDOWN_${b.id}`, b.query]),
  ...breakdown.PRIMARY_FIELD_SIGNALS.flatMap((s) =>
    [...breakdown.PRIMARY_GRAIL_FIELDS, `${breakdown.PRIMARY_TAG_PREFIX}team`].map((f): [string, string] => [
      `BREAKDOWN_${s}-primary:${f}`,
      breakdown.primaryFieldBreakdown(s, f).query,
    ]),
  ),
  ...Object.entries(flow.FLOW_QUERIES).flatMap(([w, q]): [string, string][] => [
    [`FLOW_SOURCES_${w}`, q.sources],
    [`FLOW_ROUTING_${w}`, q.routing],
    [`FLOW_OUT_${w}`, q.out],
  ]),
  ["FLOW_BUCKET_RECORDS", flow.FLOW_BUCKET_RECORDS],
];

const SOURCE_COMMANDS = /^(fetch|timeseries|smartscapeNodes|data)\b/;

describe("DQL constants", () => {
  it("finds every query", () => {
    expect(ALL_QUERIES.length).toBeGreaterThanOrEqual(24);
  });

  it.each(ALL_QUERIES)("%s starts with a source command and has no unresolved placeholders", (_name, query) => {
    expect(query.trim().length).toBeGreaterThan(0);
    expect(query.trimStart()).toMatch(SOURCE_COMMANDS);
    expect(query).not.toMatch(/\$\{|undefined|null\b|NaN|\[object Object\]/);
  });

  it.each(ALL_QUERIES)("%s has balanced brackets and quotes", (_name, query) => {
    const count = (c: string) => query.split(c).length - 1;
    expect(count("{")).toBe(count("}"));
    expect(count("(")).toBe(count(")"));
    expect(count('"') % 2).toBe(0);
  });

  it.each(ALL_QUERIES)("%s does not embed a timeframe (hooks pass it)", (_name, query) => {
    expect(query).not.toMatch(/\bfrom:\s*now|\btimeframe:/);
  });

  it("has unique breakdown ids and only known signals and sources", () => {
    const ids = breakdown.BREAKDOWNS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of breakdown.BREAKDOWNS) {
      expect(["logs", "traces", "metrics", "events"]).toContain(b.signal);
      expect(b.source === "billing").toBe(b.query.includes("fetch dt.system.events"));
    }
  });

  it("caps every breakdown result", () => {
    for (const b of breakdown.BREAKDOWNS) expect(b.query).toMatch(/\| limit \d+/);
  });

  it("builds primary-field breakdowns with a quoted field, a raw source and a cap", () => {
    for (const s of breakdown.PRIMARY_FIELD_SIGNALS) {
      const def = breakdown.primaryFieldBreakdown(s, "primary_tags.cost-center");
      expect(def.id).toBe(`${s}-primary:primary_tags.cost-center`);
      expect(def.signal).toBe(s);
      expect(def.source).toBe("raw");
      expect(def.query).toContain('coalesce(`primary_tags.cost-center`, "(none)")');
      expect(def.query).toMatch(/\| limit \d+/);
    }
  });

  it.each(["", "a`b", "x | fetch logs", "primary_tags.", ".team", 'a"b', "a b"])(
    "rejects the unsafe field name %p",
    (f) => {
      expect(breakdown.isValidFieldName(f)).toBe(false);
      expect(() => breakdown.primaryFieldBreakdown("logs", f)).toThrow(/Invalid field name/);
    },
  );

  it("lists every primary Grail field once", () => {
    expect(new Set(breakdown.PRIMARY_GRAIL_FIELDS).size).toBe(breakdown.PRIMARY_GRAIL_FIELDS.length);
    for (const f of breakdown.PRIMARY_GRAIL_FIELDS) expect(breakdown.isValidFieldName(f)).toBe(true);
  });

  it("uses a different interval per flow window", () => {
    expect(flow.FLOW_QUERIES["5m"].sources).toContain("interval: 1m");
    expect(flow.FLOW_QUERIES["24h"].sources).toContain("interval: 15m");
  });

  it("lists every exported breakdown query in BREAKDOWNS", () => {
    const listed = new Set(breakdown.BREAKDOWNS.map((b) => b.query));
    for (const [name, q] of stringExports(breakdown).filter(([, v]) => SOURCE_COMMANDS.test(v))) {
      expect({ name, listed: listed.has(q) }).toEqual({ name, listed: true });
    }
  });

  it("keeps the query modules import-free so Node can load them for validate-queries.sh", () => {
    for (const f of ["billing.ts", "drivers.ts", "buckets.ts", "breakdown.ts", "flow.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, f), "utf8");
      expect({ f, imports: /^\s*import\s/m.test(src) }).toEqual({ f, imports: false });
    }
  });
});

describe("scripts/list-queries.mjs", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts/list-queries.mjs"), "utf8");

  it.each([
    ...stringExports(billing).map(([n]) => ["billing", n]),
    ...stringExports(drivers).map(([n]) => ["drivers", n]),
    ...stringExports(buckets).map(([n]) => ["buckets", n]),
    ["flow", "FLOW_BUCKET_RECORDS"],
  ])("validates %s.%s", (mod, name) => {
    expect(script).toContain(`${mod}.${name}`);
    expect(script).toContain(`name: "${name}"`);
  });

  it("validates every breakdown and every flow window", () => {
    expect(script).toContain("breakdown.BREAKDOWNS.map");
    expect(script).toContain("Object.entries(flow.FLOW_QUERIES)");
    for (const kind of ["sources", "routing", "out"]) expect(script).toContain(`query: q.${kind}`);
    expect(script).toContain("breakdown.PRIMARY_FIELD_SIGNALS.map");
  });
});

/** Mirrors the `fields` lists in scripts/list-queries.mjs. */
const FIXTURE_FIELDS: [string, string, string[]][] = [
  ["INGEST_TOTALS", path.join(QUERY_FIXTURES, "INGEST_TOTALS.json"), ["event.type", "bytes", "dp", "spans"]],
  ["INGEST_TREND", path.join(QUERY_FIXTURES, "INGEST_TREND.json"), ["event.type", "bytes", "dp", "timeframe", "interval"]],
  ["HOST_DRIVERS", path.join(QUERY_FIXTURES, "HOST_DRIVERS.json"), ["event.type", "gibh", "hosts"]],
  ["RETAIN_TOTALS", path.join(QUERY_FIXTURES, "RETAIN_TOTALS.json"), ["event.type", "avg_bytes"]],
  ["ENTITY_DRIVERS", path.join(QUERY_FIXTURES, "ENTITY_DRIVERS.json"), ["type", "n"]],
  ["BUCKETS", path.join(QUERY_FIXTURES, "BUCKETS.json"), ["name", "retention_days"]],
  ...breakdown.BREAKDOWNS.map((b): [string, string, string[]] => [
    `BREAKDOWN_${b.id}`,
    path.join(QUERY_FIXTURES, `BREAKDOWN_${b.id}.json`),
    ["key", "value"],
  ]),
  ["FLOW_SOURCES_1h", path.join(FLOW_FIXTURES, "sources-1h.json"), ["configuration", "r"]],
  ["FLOW_ROUTING_1h", path.join(FLOW_FIXTURES, "routing-1h.json"), ["configuration", "r"]],
  ["FLOW_OUT_1h", path.join(FLOW_FIXTURES, "out-1h.json"), ["configuration", "bucket_name", "r"]],
  ["FLOW_OUT_24h", path.join(FLOW_FIXTURES, "out-24h.json"), ["configuration", "bucket_name", "r"]],
];

describe("committed fixtures", () => {
  it.each(FIXTURE_FIELDS)("%s has records with the expected fields", (_name, file, fields) => {
    const rows = records(file);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) for (const f of fields) expect(Object.keys(r)).toContain(f);
  });

  it("has a fixture for every breakdown", () => {
    for (const b of breakdown.BREAKDOWNS) {
      expect(fs.existsSync(path.join(QUERY_FIXTURES, `BREAKDOWN_${b.id}.json`))).toBe(true);
    }
  });
});

const finite = (n: number) => Number.isFinite(n) && n >= 0;

describe("parsers accept the committed fixtures", () => {
  const q = (name: string) => readJson(path.join(QUERY_FIXTURES, `${name}.json`));

  it("parseIngestTotals", () => {
    const rows = parseIngestTotals(q("INGEST_TOTALS"));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect([r.bytes, r.dataPoints, r.spans, r.volume].every(finite)).toBe(true);
  });

  it("parseTrend", () => {
    const series = parseTrend(q("INGEST_TREND"));
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      expect(s.intervalMs).toBeGreaterThan(0);
      expect(s.end.getTime()).toBeGreaterThan(s.start.getTime());
      expect(s.values.length).toBeGreaterThan(0);
      expect(s.values.every(finite)).toBe(true);
    }
  });

  it("parseHostDrivers", () => {
    const d = parseHostDrivers(q("HOST_DRIVERS"));
    expect(d.hosts).toBeGreaterThan(0);
    expect(finite(d.gibHours)).toBe(true);
  });

  it("parseEntityDrivers", () => {
    const d = parseEntityDrivers(q("ENTITY_DRIVERS"));
    expect(Object.values(d).every(finite)).toBe(true);
    expect(Object.values(d).some((n) => n > 0)).toBe(true);
  });

  it("parseRetainTotals", () => {
    const rows = parseRetainTotals(q("RETAIN_TOTALS"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => finite(r.storedGiB))).toBe(true);
  });

  it("parseBuckets", () => {
    const rows = parseBuckets(q("BUCKETS"));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.name).not.toBe("");
      expect(finite(r.retentionDays)).toBe(true);
    }
    expect(rows.some((r) => r.signal !== null)).toBe(true);
  });

  it.each(breakdown.BREAKDOWNS.map((b) => [b.id]))("parseBreakdown %s", (id) => {
    const rows = parseBreakdown(q(`BREAKDOWN_${id}`));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => finite(r.value) && finite(r.share))).toBe(true);
    const shares = rows.reduce((a, r) => a + r.share, 0);
    if (rows.some((r) => r.value > 0)) expect(shares).toBeCloseTo(1);
  });

  it("avgRecordSizes reads the flow billing and output fixtures", () => {
    const sizes = avgRecordSizes(
      readJson(path.join(FLOW_FIXTURES, "billing-24h.json")),
      readJson(path.join(FLOW_FIXTURES, "out-24h.json")),
    );
    expect(sizes.size).toBeGreaterThan(0);
    for (const v of sizes.values()) expect(v).toBeGreaterThan(0);
  });
});
