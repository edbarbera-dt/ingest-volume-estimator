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

describe("collapseSources edge cases", () => {
  it("uses the default limit of 15", () => {
    const g = graphWith(15);
    expect(collapseSources(g)).toBe(g);
    expect(collapseSources(graphWith(16)).nodes.filter((n) => n.kind === "source")).toHaveLength(15);
  });

  it("keeps bytes unknown when every folded source has no bytes estimate", () => {
    const g = graphWith(4);
    const nulls: FlowGraph = {
      ...g,
      nodes: g.nodes.map((n) => ({ ...n, bytesRate: null })),
      edges: g.edges.map((e) => ({ ...e, bytesRate: null })),
    };
    const c = collapseSources(nulls, 2);
    expect(c.nodes.find((n) => n.id === "src:other")?.bytesRate).toBeNull();
    expect(c.edges.find((e) => e.from === "src:other")?.bytesRate).toBeNull();
  });

  it("merges route names and estimated flags per target and keeps one Other edge per target", () => {
    const sources = Array.from({ length: 4 }, (_, i) => node(`src:${i}`, "source", i + 1));
    const g: FlowGraph = {
      nodes: [...sources, node("pipe:a", "pipeline", 0), node("pipe:b", "pipeline", 0)],
      edges: [
        { ...edge("src:0", "pipe:a", 1), routeName: "r1" },
        { ...edge("src:1", "pipe:a", 2), routeName: "r1", estimatedSplit: true },
        { ...edge("src:1", "pipe:b", 2), routeName: "r2" },
        edge("src:3", "pipe:a", 4),
      ],
      windowSeconds: 10,
      start: new Date(0),
      intervalMs: 1000,
    };
    const c = collapseSources(g, 2);
    const other = c.edges.filter((e) => e.from === "src:other");
    expect(other.map((e) => e.to).sort()).toEqual(["pipe:a", "pipe:b"]);
    expect(other.find((e) => e.to === "pipe:a")).toMatchObject({ routeName: "r1", estimatedSplit: true, rate: 3 });
    expect(other.find((e) => e.to === "pipe:b")).toMatchObject({ routeName: "r2", estimatedSplit: false });
    expect(c.edges.find((e) => e.from === "src:3")).toBeDefined();
  });

  it("leaves routeName undefined when no folded edge has one", () => {
    const c = collapseSources(graphWith(4), 2);
    expect(c.edges.find((e) => e.from === "src:other")?.routeName).toBeUndefined();
  });
});
