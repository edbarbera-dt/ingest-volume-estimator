import type { FlowGraph } from "./types";

/** Nodes and edges on any path through `nodeId`: everything upstream and downstream of it. */
export function connectedIds(g: FlowGraph, nodeId: string | null): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!nodeId) return { nodes, edges };
  nodes.add(nodeId);
  const walk = (start: string, dir: "down" | "up") => {
    const queue = [start];
    const seen = new Set([start]);
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const e of g.edges) {
        const [here, next] = dir === "down" ? [e.from, e.to] : [e.to, e.from];
        if (here !== cur) continue;
        edges.add(e.id);
        nodes.add(next);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  };
  walk(nodeId, "down");
  walk(nodeId, "up");
  return { nodes, edges };
}
