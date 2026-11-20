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
import type { FlowGraph } from "./types";

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

describe("layoutFlow edge cases", () => {
  const g = (edges: FlowGraph["edges"], extraNodes: FlowGraph["nodes"] = []): FlowGraph => ({
    nodes: [
      { id: "s", kind: "source", label: "s", configuration: "logs", records: 0, rate: 0, bytesRate: null, series: [] },
      { id: "p", kind: "pipeline", label: "p", configuration: "logs", records: 0, rate: 0, bytesRate: null, series: [] },
      { id: "d", kind: "destination", label: "d", configuration: "logs", records: 0, rate: 0, bytesRate: null, series: [] },
      ...extraNodes,
    ],
    edges,
    windowSeconds: 60,
    start: new Date(0),
    intervalMs: 60000,
  });
  const e = (from: string, to: string, rate: number, bytesRate: number | null) => ({
    id: `${from}->${to}`, from, to, configuration: "logs", records: rate * 60, rate, bytesRate, estimatedSplit: false, series: [],
  });

  it("uses the minimum stroke when bytes are unknown or traffic is 0", () => {
    const l = layoutFlow(g([e("s", "p", 5, null), e("p", "d", 0, 0)]), { width: 900, mode: "bytes" });
    expect(l.edges.map((x) => x.width)).toEqual([1.5, 1.5]);
    expect(l.edges.map((x) => x.value)).toEqual([0, 0]);
  });

  it("scales by records/s in records mode even without bytes", () => {
    const l = layoutFlow(g([e("s", "p", 4, null), e("p", "d", 1, null)]), { width: 900, mode: "records" });
    const [a, b] = l.edges;
    expect(a.width).toBe(14);
    expect(b.width).toBeCloseTo(1.5 + 12.5 * Math.sqrt(1 / 4));
  });

  it("drops edges whose ends are not in the graph", () => {
    const l = layoutFlow(g([e("s", "p", 1, 1), e("ghost", "p", 1, 1), e("p", "nowhere", 1, 1)]), { width: 900, mode: "bytes" });
    expect(l.edges.map((x) => x.id)).toEqual(["s->p"]);
  });

  it("spreads several edges across a card's side", () => {
    const d2 = { id: "d2", kind: "destination" as const, label: "d2", configuration: "logs", records: 0, rate: 0, bytesRate: null, series: [] };
    const l = layoutFlow(g([e("s", "p", 1, 1), e("p", "d", 1, 1), e("p", "d2", 1, 1)], [d2]), { width: 900, mode: "bytes", nodeHeight: 80 });
    const starts = l.edges.filter((x) => x.from === "p").map((x) => Number(/^M [\d.]+ ([\d.]+)/.exec(x.path)?.[1]));
    const p = l.nodes.find((n) => n.id === "p")!;
    expect(starts.sort((a, b) => a - b)).toEqual([p.y + 20, p.y + 60]);
  });

  it("honours custom sizes and never goes negative on a narrow canvas", () => {
    const l = layoutFlow(g([e("s", "p", 1, 1)]), { width: 100, mode: "bytes", nodeWidth: 200, nodeHeight: 40, gap: 4, padding: 2 });
    expect(l.nodes.every((n) => n.x >= 2 && n.w === 200 && n.h === 40)).toBe(true);
  });
});
