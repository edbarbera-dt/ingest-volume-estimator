import logsRouting from "./__fixtures__/settings-logs-routing.json";
import logsPipelines from "./__fixtures__/settings-logs-pipelines.json";
import metricsSources from "./__fixtures__/settings-metrics-ingest-sources.json";
import { parseTopology, emptyTopology, pipelineProcessors, routesForPipeline } from "./topology";

describe("parseTopology (rkj7350h logs)", () => {
  const t = parseTopology([{ configuration: "logs", routing: logsRouting, pipelines: logsPipelines, ingestSources: [], forwarding: [] }]);

  it("maps a route description to its pipeline", () => {
    const r = t.routes.get("logs|Credit Card Order Logs");
    expect(r?.pipelineKey).toMatch(/^pipe:logs:/);
    expect(t.pipelines.get(r!.pipelineKey)?.name).toBe("EasyTrade Credit Card Pipeline");
    expect(r?.matcher).toContain("frontendreverseproxy");
  });

  it("keeps pipeline custom ids and bucket assignments", () => {
    const p = [...t.pipelines.values()].find((x) => x.name === "AstroShop PaymentService");
    expect(p?.customId).toBe("pipeline_AstroShop_PaymentService_7673");
    expect(p?.buckets).toEqual(["observe_and_troubleshoot_apps_95_days", "log_management_analytics_7_days"]);
    expect(t.byCustomId.get("logs|pipeline_AstroShop_PaymentService_7673")).toBe(p?.key);
  });

  it("lists processors by stage", () => {
    const p = [...t.pipelines.values()].find((x) => x.name === "AstroShop PaymentService")!;
    const procs = pipelineProcessors(p);
    expect(procs.some((x) => x.stage === "storage" && x.type === "bucketAssignment")).toBe(true);
    expect(procs.every((x) => typeof x.enabled === "boolean")).toBe(true);
  });

  it("tolerates garbage", () => {
    const g = parseTopology([{ configuration: "logs", routing: [{ value: 5 }], pipelines: [null], ingestSources: "x", forwarding: undefined }] as never);
    expect(g.pipelines.size).toBe(0);
    expect(emptyTopology().routes.size).toBe(0);
  });

  it("parses static ingest-source routing", () => {
    const m = parseTopology([{ configuration: "metrics", routing: [], pipelines: [], ingestSources: metricsSources, forwarding: [] }]);
    expect(m.ingestSources[0]).toMatchObject({ name: "SSL Certificate Monitor Source", source: "com.dynatrace.custom.python-certificate-monitor" });
  });

  it("parses forwarding targets", () => {
    const f = parseTopology([{ configuration: "logs", routing: [], pipelines: [], ingestSources: [], forwarding: [{ objectId: "fw1", summary: "Splunk", value: { displayName: "Splunk", endpoint: "https://x" } }] }]);
    expect(f.forwarding).toEqual([{ key: "fwd:logs:fw1", configuration: "logs", name: "Splunk", summary: { displayName: "Splunk", endpoint: "https://x" } }]);
  });
});

describe("parseTopology edge cases", () => {
  const pipeline = (objectId: string, value: Record<string, unknown>, summary?: string) => ({ objectId, summary, value });

  it("names pipelines by displayName, then summary, then customId, then objectId", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        routing: [],
        pipelines: [
          pipeline("o1", { displayName: "Display", customId: "c1" }, "Summary"),
          pipeline("o2", { customId: "c2" }, "Summary 2"),
          pipeline("o3", { customId: "c3" }),
          pipeline("o4", {}),
          { objectId: "", value: { displayName: "no id" } },
          { objectId: "o5", value: "not an object" },
        ],
        ingestSources: [],
        forwarding: [],
      },
    ]);
    expect([...t.pipelines.values()].map((p) => p.name)).toEqual(["Display", "Summary 2", "c3", "o4"]);
    expect(t.byCustomId.has("logs|c1")).toBe(true);
    expect(t.byObjectId.get("logs|o4")).toBe("pipe:logs:o4");
    expect(t.pipelines.get("pipe:logs:o4")?.buckets).toEqual([]);
  });

  it("ignores storage processors without a bucket name", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        routing: [],
        pipelines: [
          pipeline("o1", {
            storage: { processors: [{ bucketAssignment: { bucketName: "b1" } }, { bucketAssignment: {} }, { type: "noStorage" }] },
          }),
        ],
        ingestSources: [],
        forwarding: [],
      },
    ]);
    expect(t.pipelines.get("pipe:logs:o1")?.buckets).toEqual(["b1"]);
  });

  it("resolves route pipeline ids by object id, custom id, default and unknown id", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        pipelines: [pipeline("obj-1", { customId: "custom-1", displayName: "P1" })],
        routing: [
          {
            value: {
              routingEntries: [
                { description: "by object", pipelineId: "obj-1", matcher: "true" },
                { description: "by custom", pipelineId: "custom-1", enabled: false },
                { description: "to default", pipelineId: "default" },
                { description: "to unknown", pipelineId: "ghost" },
                { description: "", pipelineId: "obj-1" },
              ],
            },
          },
        ],
        ingestSources: [],
        forwarding: [],
      },
    ]);
    expect(t.routes.size).toBe(4);
    expect(t.routes.get("logs|by object")).toMatchObject({ pipelineKey: "pipe:logs:obj-1", enabled: true, matcher: "true" });
    expect(t.routes.get("logs|by custom")).toMatchObject({ pipelineKey: "pipe:logs:obj-1", enabled: false, matcher: "" });
    expect(t.routes.get("logs|to default")?.pipelineKey).toBe("pipe:logs:default");
    expect(t.routes.get("logs|to unknown")?.pipelineKey).toBe("pipe:logs:id:ghost");
  });

  it("keeps configurations apart", () => {
    const t = parseTopology([
      { configuration: "logs", pipelines: [pipeline("same", { customId: "x" })], routing: [], ingestSources: [], forwarding: [] },
      { configuration: "spans", pipelines: [pipeline("same", { customId: "x" })], routing: [], ingestSources: [], forwarding: [] },
    ]);
    expect(t.byCustomId.get("logs|x")).toBe("pipe:logs:same");
    expect(t.byCustomId.get("spans|x")).toBe("pipe:spans:same");
  });

  it("reads ingest sources with and without static routing", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        routing: [],
        pipelines: [pipeline("p1", { customId: "c1" })],
        ingestSources: [
          { summary: "From summary", value: { source: "s1" } },
          { value: { displayName: "Routed", source: "s2", staticRouting: { pipelineId: "c1" } } },
          { value: "broken" },
        ],
        forwarding: [],
      },
    ]);
    expect(t.ingestSources).toEqual([
      { configuration: "logs", name: "From summary", source: "s1", pipelineKey: null },
      { configuration: "logs", name: "Routed", source: "s2", pipelineKey: "pipe:logs:p1" },
      { configuration: "logs", name: "", source: "", pipelineKey: null },
    ]);
  });

  it("names forwarding targets by summary, then displayName, then objectId, and skips ones without an id", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        routing: [],
        pipelines: [],
        ingestSources: [],
        forwarding: [{ objectId: "f1", value: { displayName: "Display" } }, { objectId: "f2" }, { summary: "no id" }],
      },
    ]);
    expect(t.forwarding.map((f) => f.name)).toEqual(["Display", "f2"]);
    expect(t.forwarding[1].summary).toEqual({});
  });
});

describe("pipelineProcessors and routesForPipeline", () => {
  it("skips stages without processors and defaults missing processor fields", () => {
    const t = parseTopology([
      {
        configuration: "logs",
        routing: [{ value: { routingEntries: [{ description: "r1", pipelineId: "p1" }, { description: "r2", pipelineId: "other" }] } }],
        pipelines: [{ objectId: "p1", value: { displayName: "P", processing: { processors: [{ id: "a", enabled: false }, {}] }, enabled: true } }],
        ingestSources: [],
        forwarding: [],
      },
    ]);
    const p = t.pipelines.get("pipe:logs:p1")!;
    expect(pipelineProcessors(p)).toEqual([
      { stage: "processing", id: "a", type: "", description: "", enabled: false, matcher: "" },
      { stage: "processing", id: "", type: "", description: "", enabled: true, matcher: "" },
    ]);
    expect(routesForPipeline(t, p.key).map((r) => r.description)).toEqual(["r1"]);
    expect(routesForPipeline(t, "pipe:logs:nothing")).toEqual([]);
  });
});
