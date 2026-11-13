import logsRouting from "./__fixtures__/settings-logs-routing.json";
import logsPipelines from "./__fixtures__/settings-logs-pipelines.json";
import metricsSources from "./__fixtures__/settings-metrics-ingest-sources.json";
import { parseTopology, emptyTopology, pipelineProcessors } from "./topology";

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
