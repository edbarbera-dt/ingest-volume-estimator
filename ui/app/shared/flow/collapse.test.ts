import { collapseSources } from "./collapse";
import type { FlowGraph, FlowNode, FlowEdge } from "./types";

const node = (id: string, kind: FlowNode["kind"], rate: number): FlowNode => ({
  id, kind, label: id, configuration: "logs", records: rate * 10, rate, bytesRate: rate * 100, series: [rate * 10],
});
const edge = (from: string, to: string, rate: number): FlowEdge => ({
  id: `${from}->${to}`, from, to, configuration: "logs", records: rate * 10, rate, bytesRate: rate * 100, estimatedSplit: false, series: [rate * 10],
});

function graphWith(n: number): FlowGraph {
  const sources = Array.from({ length: n }, (_, i) => node(`src:${i}`, "source", i + 1));
  return {
    nodes: [...sources, node("pipe:p", "pipeline", 0)],
    edges: sources.map((s) => edge(s.id, "pipe:p", s.rate)),
    windowSeconds: 10,
    start: new Date(0),
    intervalMs: 1000,
  };
}

describe("collapseSources", () => {
  it("leaves 15 or fewer sources alone", () => {
    const g = graphWith(15);
    expect(collapseSources(g, 15)).toBe(g);
  });
  it("keeps the 14 largest and folds the rest into Other", () => {
    const c = collapseSources(graphWith(20), 15);
    const sources = c.nodes.filter((x) => x.kind === "source");
    expect(sources).toHaveLength(15);
    const other = sources.find((x) => x.id === "src:other")!;
    expect(other.label).toBe("Other (6 sources)");
    expect(other.isOther).toBe(true);
    expect(other.rate).toBe(1 + 2 + 3 + 4 + 5 + 6);
    expect(other.collapsed).toHaveLength(6);
    const otherEdge = c.edges.find((e) => e.from === "src:other")!;
    expect(otherEdge.rate).toBe(21);
    expect(otherEdge.bytesRate).toBe(2100);
    expect(c.edges.filter((e) => e.from === "src:0")).toHaveLength(0);
  });
});
