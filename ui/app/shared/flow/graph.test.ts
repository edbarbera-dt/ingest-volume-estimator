import routing1h from "./__fixtures__/routing-1h.json";
import out1h from "./__fixtures__/out-1h.json";
import sources1h from "./__fixtures__/sources-1h.json";
import billing24h from "./__fixtures__/billing-24h.json";
import out24h from "./__fixtures__/out-24h.json";
import logsRouting from "./__fixtures__/settings-logs-routing.json";
import logsPipelines from "./__fixtures__/settings-logs-pipelines.json";
import { buildFlowGraph } from "./graph";
import { parseTopology, emptyTopology } from "./topology";
import { avgRecordSizes } from "./bytesEstimate";

const topology = parseTopology([{ configuration: "logs", routing: logsRouting, pipelines: logsPipelines, ingestSources: [], forwarding: [] }]);
const sizes = avgRecordSizes(billing24h, out24h);
const base = { sources: sources1h, routing: routing1h, out: out1h, topology, recordSizes: sizes, windowSeconds: 3600 };

const series = (vals: number[]) => ({
  timeframe: { start: "2026-11-13T14:00:00Z", end: "2026-11-13T14:03:00Z" },
  interval: "60000000000",
  r: vals,
});

describe("buildFlowGraph (rkj7350h logs, 1h)", () => {
  const g = buildFlowGraph({ ...base, signal: "logs" });

  it("builds source → default pipeline → bucket", () => {
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["src:logs:oneagent", "pipe:logs:default", "dest:default_logs"]),
    );
    const e1 = g.edges.find((e) => e.from === "src:logs:oneagent" && e.to === "pipe:logs:default");
    expect(e1?.records).toBe(53214);
    expect(e1?.rate).toBeCloseTo(53214 / 3600);
    expect(e1?.routeName).toBe("default");
    const e2 = g.edges.find((e) => e.from === "pipe:logs:default" && e.to === "dest:default_logs");
    expect(e2?.records).toBe(53214);
    expect(e2?.estimatedSplit).toBe(false);
  });

  it("estimates bytes/s from the bucket's average record size", () => {
    const e2 = g.edges.find((e) => e.to === "dest:default_logs")!;
    expect(e2.bytesRate).toBeCloseTo((53214 / 3600) * (736666253 / 3907743));
    const e1 = g.edges.find((e) => e.from === "src:logs:oneagent")!;
    expect(e1.bytesRate).toBeCloseTo(e2.bytesRate!);
  });

  it("labels sources and keeps per-minute series", () => {
    const src = g.nodes.find((n) => n.id === "src:logs:oneagent")!;
    expect(src).toMatchObject({ kind: "source", label: "OneAgent", sourceType: "oneagent" });
    expect(src.series.length).toBe(60);
    expect(g.intervalMs).toBe(60_000);
  });

  it("adds configured pipelines without traffic as zero nodes", () => {
    const idle = g.nodes.find((n) => n.label === "EasyTrade Credit Card Pipeline");
    expect(idle).toMatchObject({ kind: "pipeline", rate: 0 });
  });

  it("only includes the tab's configurations", () => {
    expect(g.nodes.some((n) => n.configuration !== "logs")).toBe(false);
  });
});

describe("buildFlowGraph (events tab)", () => {
  const g = buildFlowGraph({ ...base, signal: "events", topology: emptyTopology() });
  it("combines events, bizevents and system.events but not smartscape.events", () => {
    const cfgs = new Set(g.nodes.map((n) => n.configuration));
    expect(cfgs).toEqual(new Set(["bizevents", "events", "system.events"]));
  });
  it("labels API endpoints and builtin routes", () => {
    expect(g.nodes.find((n) => n.id === "src:bizevents:/api/v2/bizevents/ingest")).toMatchObject({ sourceType: "api", label: "/api/v2/bizevents/ingest" });
    expect(g.nodes.find((n) => n.id === "pipe:events:route:Agent Registry")?.label).toBe("Agent Registry");
  });
  it("has no bytes estimate for unbilled buckets", () => {
    expect(g.edges.find((e) => e.to === "dest:default_fleet_events")?.bytesRate).toBeNull();
  });
});

describe("buildFlowGraph edge cases", () => {
  it("uses pipeline_id when present, matching custom id", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "logs",
      sources: [],
      routing: [{ ...series([1, 2, 3]), configuration: "logs", "dt.openpipeline.source": "oneagent", route_name: "AstroShop PaymentService", pipeline_id: "pipeline_AstroShop_PaymentService_7673" }],
      out: [{ ...series([1, 2, 3]), configuration: "logs", bucket_name: "observe_and_troubleshoot_apps_95_days", pipeline_id: "pipeline_AstroShop_PaymentService_7673" }],
    });
    const e = g.edges.find((x) => x.to === "dest:observe_and_troubleshoot_apps_95_days")!;
    expect(g.nodes.find((n) => n.id === e.from)?.label).toBe("AstroShop PaymentService");
    expect(e.estimatedSplit).toBe(false);
  });

  it("shows unknown pipeline ids raw", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "logs",
      topology: emptyTopology(),
      routing: [{ ...series([6]), configuration: "logs", "dt.openpipeline.source": "oneagent", route_name: "x", pipeline_id: "pipeline_mystery_1" }],
      out: [{ ...series([6]), configuration: "logs", bucket_name: "default_logs", pipeline_id: "pipeline_mystery_1" }],
      sources: [],
    });
    expect(g.nodes.find((n) => n.kind === "pipeline")?.label).toBe("pipeline_mystery_1");
  });

  it("splits bucket output across several pipelines by inflow and marks it estimated", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "logs",
      topology: emptyTopology(),
      sources: [],
      routing: [
        { ...series([30]), configuration: "logs", "dt.openpipeline.source": "oneagent", route_name: "a" },
        { ...series([10]), configuration: "logs", "dt.openpipeline.source": "oneagent", route_name: "b" },
      ],
      out: [{ ...series([40]), configuration: "logs", bucket_name: "default_logs" }],
    });
    const toBucket = g.edges.filter((e) => e.to === "dest:default_logs");
    expect(toBucket.map((e) => e.records).sort((x, y) => x - y)).toEqual([10, 30]);
    expect(toBucket.every((e) => e.estimatedSplit)).toBe(true);
  });

  it("labels <NoBucket> as not stored", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "logs",
      topology: emptyTopology(),
      sources: [],
      routing: [{ ...series([5]), configuration: "logs", "dt.openpipeline.source": "oneagent", route_name: "default" }],
      out: [{ ...series([5]), configuration: "logs", bucket_name: "<NoBucket>" }],
    });
    expect(g.nodes.find((n) => n.id === "dest:<NoBucket>")?.label).toBe("Not stored (no bucket)");
  });

  it("treats nil values and missing dimensions safely", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "metrics",
      topology: emptyTopology(),
      sources: [],
      routing: [{ ...series([null as unknown as number, 4]), configuration: "metrics", route_name: "default" }],
      out: [{ ...series([4]), configuration: "metrics", bucket_name: "default_metrics" }],
    });
    const src = g.nodes.find((n) => n.kind === "source")!;
    expect(src).toMatchObject({ label: "Unknown source", sourceType: "unknown", records: 4 });
    expect(g.edges.find((e) => e.to === "dest:default_metrics")?.bytesRate).toBeNull();
  });

  it("keeps zero-traffic edges and nodes at 0", () => {
    const g = buildFlowGraph({
      ...base,
      signal: "traces",
      topology: emptyTopology(),
      sources: [],
      routing: [{ ...series([0, 0]), configuration: "spans", "dt.openpipeline.source": "oneagent", route_name: "default" }],
      out: [{ ...series([0, 0]), configuration: "spans", bucket_name: "default_spans" }],
    });
    expect(g.nodes.every((n) => n.rate === 0)).toBe(true);
    expect(g.edges.length).toBe(2);
  });

  it("adds forwarding targets as configured-only destinations", () => {
    const t = parseTopology([{ configuration: "logs", routing: [], pipelines: [], ingestSources: [], forwarding: [{ objectId: "fw1", summary: "Splunk", value: {} }] }]);
    const g = buildFlowGraph({ ...base, signal: "logs", topology: t });
    expect(g.nodes.find((n) => n.id === "fwd:logs:fw1")).toMatchObject({ kind: "destination", configuredOnly: true, label: "Splunk" });
  });
});
