import { addSeries } from "./rates";
import type { FlowEdge, FlowGraph, FlowNode } from "./types";

const sumNullable = (vals: (number | null)[]) =>
  vals.every((v) => v === null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0);

/** Keeps the largest `max − 1` sources and merges the rest into one "Other" node. */
export function collapseSources(g: FlowGraph, max = 15): FlowGraph {
  const sources = g.nodes.filter((n) => n.kind === "source");
  if (sources.length <= max) return g;
  const sorted = [...sources].sort((a, b) => b.rate - a.rate);
  const dropped = new Set(sorted.slice(max - 1).map((n) => n.id));
  const droppedNodes = sources.filter((n) => dropped.has(n.id));

  const other: FlowNode = {
    id: "src:other",
    kind: "source",
    label: `Other (${droppedNodes.length} sources)`,
    configuration: droppedNodes[0].configuration,
    records: droppedNodes.reduce((a, n) => a + n.records, 0),
    rate: droppedNodes.reduce((a, n) => a + n.rate, 0),
    bytesRate: sumNullable(droppedNodes.map((n) => n.bytesRate)),
    series: droppedNodes.reduce<number[]>((a, n) => addSeries(a, n.series), []),
    sourceType: "other",
    isOther: true,
    collapsed: droppedNodes.map((n) => n.id),
  };

  const merged = new Map<string, FlowEdge[]>();
  const kept: FlowEdge[] = [];
  for (const e of g.edges) {
    if (!dropped.has(e.from)) kept.push(e);
    else merged.set(e.to, [...(merged.get(e.to) ?? []), e]);
  }
  const otherEdges = [...merged.entries()].map(([to, es]): FlowEdge => ({
    id: `src:other->${to}`,
    from: "src:other",
    to,
    configuration: es[0].configuration,
    routeName: [...new Set(es.map((e) => e.routeName).filter(Boolean))].join(", ") || undefined,
    records: es.reduce((a, e) => a + e.records, 0),
    rate: es.reduce((a, e) => a + e.rate, 0),
    bytesRate: sumNullable(es.map((e) => e.bytesRate)),
    estimatedSplit: es.some((e) => e.estimatedSplit),
    series: es.reduce<number[]>((a, e) => addSeries(a, e.series), []),
  }));

  return {
    ...g,
    nodes: [...g.nodes.filter((n) => !dropped.has(n.id)), other],
    edges: [...kept, ...otherEdges],
  };
}
