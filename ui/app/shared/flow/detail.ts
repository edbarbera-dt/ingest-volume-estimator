import { parseIngestTotals } from "../../queries/parse";
import type { FlowMode } from "./format";
import type { FlowGraph, FlowNode } from "./types";

/** The node's throughput per interval, as rec/s or (when known) ~bytes/s. */
export function nodeTimeseries(g: FlowGraph, node: FlowNode, mode: FlowMode) {
  const secs = g.intervalMs / 1000 || 60;
  const perRecord = mode === "bytes" && node.bytesRate !== null && node.rate > 0 ? node.bytesRate / node.rate : 1;
  return {
    name: node.label,
    datapoints: node.series.map((v, i) => ({
      start: new Date(g.start.getTime() + i * g.intervalMs),
      end: new Date(g.start.getTime() + (i + 1) * g.intervalMs),
      value: (v / secs) * perRecord,
    })),
  };
}

export function billedBytesByBucket(billing: unknown): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of parseIngestTotals(billing)) m.set(r.bucket, (m.get(r.bucket) ?? 0) + r.bytes);
  return m;
}

/** Settings value → "a.b.c: value" rows for a compact summary. */
export function flattenConfig(value: Record<string, unknown>, prefix = ""): { key: string; value: string }[] {
  return Object.entries(value).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) return flattenConfig(v as Record<string, unknown>, key);
    if (v === null || v === undefined) return [{ key, value: "–" }];
    return [{ key, value: typeof v === "string" ? v : JSON.stringify(v) }];
  });
}
