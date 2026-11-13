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
import { layoutFlow, COLUMN_OF } from "./layout";

const topology = parseTopology([{ configuration: "logs", routing: logsRouting, pipelines: logsPipelines, ingestSources: [], forwarding: [] }]);
const sizes = avgRecordSizes(billing24h, out24h);
const graph = (signal: "logs" | "events") =>
  buildFlowGraph({ signal, sources: sources1h, routing: routing1h, out: out1h, topology: signal === "logs" ? topology : emptyTopology(), recordSizes: sizes, windowSeconds: 3600 });

const round = (o: unknown): unknown =>
  JSON.parse(JSON.stringify(o, (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));

describe("layoutFlow", () => {
  it("puts sources, pipelines and destinations in three columns", () => {
    const l = layoutFlow(graph("logs"), { width: 1000, mode: "bytes" });
    const xs = (kind: string) => new Set(l.nodes.filter((n) => n.kind === kind).map((n) => n.x));
    expect(xs("source").size).toBe(1);
    expect(xs("pipeline").size).toBe(1);
    expect(xs("destination").size).toBe(1);
    expect([...xs("source")][0]).toBeLessThan([...xs("pipeline")][0]);
    expect([...xs("pipeline")][0]).toBeLessThan([...xs("destination")][0]);
    expect(COLUMN_OF.destination).toBe(2);
  });

  it("does not overlap cards in a column", () => {
    const l = layoutFlow(graph("logs"), { width: 1000, mode: "bytes" });
    const pipes = l.nodes.filter((n) => n.kind === "pipeline").sort((a, b) => a.y - b.y);
    for (let i = 1; i < pipes.length; i++) expect(pipes[i].y).toBeGreaterThanOrEqual(pipes[i - 1].y + pipes[i - 1].h);
    expect(l.height).toBeGreaterThanOrEqual(pipes[pipes.length - 1].y + pipes[pipes.length - 1].h);
  });

  it("draws curved paths with width scaled to throughput", () => {
    const l = layoutFlow(graph("events"), { width: 1000, mode: "records" });
    for (const e of l.edges) expect(e.path).toMatch(/^M [\d.]+ [\d.]+ C /);
    const widths = l.edges.map((e) => e.width);
    expect(Math.max(...widths)).toBeLessThanOrEqual(14);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1.5);
    const biggest = l.edges.reduce((a, b) => (b.value > a.value ? b : a));
    expect(biggest.width).toBe(14);
  });

  it("is stable (snapshot)", () => {
    expect(round(layoutFlow(graph("logs"), { width: 1000, mode: "bytes" }))).toMatchSnapshot();
  });

  it("handles an empty graph", () => {
    const l = layoutFlow({ nodes: [], edges: [], windowSeconds: 60, start: new Date(0), intervalMs: 60000 }, { width: 800, mode: "bytes" });
    expect(l.nodes).toEqual([]);
    expect(l.height).toBeGreaterThan(0);
  });
});
