import { sankey, type SankeyNode } from "d3-sankey";
import type { FlowMode } from "./format";
import type { FlowGraph, FlowNodeKind } from "./types";

export const COLUMN_OF: Record<FlowNodeKind, number> = { source: 0, pipeline: 1, destination: 2 };

export interface LayoutNode {
  id: string;
  kind: FlowNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  path: string;
  width: number;
  /** Value that drove the width (bytes/s or rec/s; 0 when unknown). */
  value: number;
  labelX: number;
  labelY: number;
}

export interface FlowLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  width: number;
  mode: FlowMode;
  nodeWidth?: number;
  nodeHeight?: number;
  gap?: number;
  padding?: number;
}

const MIN_STROKE = 1.5;
const MAX_STROKE = 14;

interface SNode {
  id: string;
  column: number;
}

/**
 * Positions cards in three columns. d3-sankey is used only to order nodes within a column so
 * that edges cross as little as possible; cards have a fixed size and edges are our own curves.
 */
export function layoutFlow(g: FlowGraph, o: LayoutOptions): FlowLayout {
  const w = o.nodeWidth ?? 220;
  const h = o.nodeHeight ?? 68;
  const gap = o.gap ?? 14;
  const pad = o.padding ?? 8;

  const columns: string[][] = [[], [], []];
  for (const n of g.nodes) columns[COLUMN_OF[n.kind]].push(n.id);
  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const height = pad * 2 + tallest * h + (tallest - 1) * gap;

  // Order within columns via d3-sankey.
  const order = new Map<string, number>();
  if (g.nodes.length > 0) {
    const maxRate = Math.max(0, ...g.edges.map((e) => e.rate));
    const eps = maxRate > 0 ? maxRate * 0.02 : 1;
    const index = new Map(g.nodes.map((n, i) => [n.id, i]));
    const layout = sankey<SNode, { source: number; target: number; value: number }>()
      .nodeId((d) => index.get((d as SNode).id) ?? 0)
      .nodeAlign((d) => (d as SankeyNode<SNode, object>).column)
      .nodeWidth(10)
      .nodePadding(8)
      .extent([
        [0, 0],
        [Math.max(o.width, 300), Math.max(height, 100)],
      ]);
    const result = layout({
      nodes: g.nodes.map((n) => ({ id: n.id, column: COLUMN_OF[n.kind] })),
      links: g.edges
        .filter((e) => index.has(e.from) && index.has(e.to))
        .map((e) => ({ source: index.get(e.from) as number, target: index.get(e.to) as number, value: e.rate + eps })),
    });
    for (const n of result.nodes) order.set(n.id, n.y0 ?? 0);
  }

  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const usable = Math.max(o.width - pad * 2 - w, 0);
  const pos = new Map<string, LayoutNode>();
  columns.forEach((ids, col) => {
    const sorted = [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a.localeCompare(b));
    const colHeight = sorted.length * h + Math.max(sorted.length - 1, 0) * gap;
    const top = pad + (height - pad * 2 - colHeight) / 2;
    sorted.forEach((id, i) => {
      pos.set(id, { id, kind: kindOf.get(id) as FlowNodeKind, x: pad + (usable * col) / 2, y: top + i * (h + gap), w, h });
    });
  });

  // Spread edge ports along each card's edge, ordered by the other end's position.
  const ports = new Map<string, number>();
  const assignPorts = (side: "out" | "in") => {
    for (const n of pos.values()) {
      const list = g.edges
        .filter((e) => (side === "out" ? e.from : e.to) === n.id)
        .sort((a, b) => (pos.get(side === "out" ? a.to : a.from)?.y ?? 0) - (pos.get(side === "out" ? b.to : b.from)?.y ?? 0));
      list.forEach((e, i) => {
        const span = h / 2;
        const y = list.length === 1 ? n.y + h / 2 : n.y + h / 4 + (span * i) / (list.length - 1);
        ports.set(`${side}:${e.id}`, y);
      });
    }
  };
  assignPorts("out");
  assignPorts("in");

  const metric = (e: FlowGraph["edges"][number]) => (o.mode === "bytes" ? e.bytesRate : e.rate);
  const max = Math.max(0, ...g.edges.map((e) => metric(e) ?? 0));

  const edges: LayoutEdge[] = g.edges.flatMap((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return [];
    const x1 = a.x + a.w;
    const y1 = ports.get(`out:${e.id}`) ?? a.y + a.h / 2;
    const x2 = b.x;
    const y2 = ports.get(`in:${e.id}`) ?? b.y + b.h / 2;
    const dx = (x2 - x1) / 2;
    const v = metric(e);
    const width = v === null || max === 0 || v <= 0 ? MIN_STROKE : MIN_STROKE + (MAX_STROKE - MIN_STROKE) * Math.sqrt(v / max);
    return [
      {
        id: e.id,
        from: e.from,
        to: e.to,
        path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        width,
        value: v ?? 0,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2,
      },
    ];
  });

  return { nodes: [...pos.values()], edges, width: o.width, height };
}
