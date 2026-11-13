import billing24h from "./__fixtures__/billing-24h.json";
import { billedBytesByBucket, nodeTimeseries, flattenConfig } from "./detail";
import type { FlowGraph, FlowNode } from "./types";

const node: FlowNode = {
  id: "dest:b", kind: "destination", label: "b", configuration: "logs",
  records: 120, rate: 1, bytesRate: 200, series: [60, 60],
};
const graph = { nodes: [node], edges: [], windowSeconds: 120, start: new Date("2026-11-13T14:00:00Z"), intervalMs: 60_000 } as FlowGraph;

describe("nodeTimeseries", () => {
  it("turns records per interval into rec/s datapoints", () => {
    const ts = nodeTimeseries(graph, node, "records");
    expect(ts.name).toBe("b");
    expect(ts.datapoints).toEqual([
      { start: new Date("2026-11-13T14:00:00Z"), end: new Date("2026-11-13T14:01:00Z"), value: 1 },
      { start: new Date("2026-11-13T14:01:00Z"), end: new Date("2026-11-13T14:02:00Z"), value: 1 },
    ]);
  });
  it("scales to ~bytes/s with the node's bytes per record", () => {
    expect(nodeTimeseries(graph, node, "bytes").datapoints[0].value).toBe(200);
  });
  it("falls back to rec/s without a bytes estimate", () => {
    expect(nodeTimeseries(graph, { ...node, bytesRate: null }, "bytes").datapoints[0].value).toBe(1);
  });
});

describe("billedBytesByBucket", () => {
  it("sums billed bytes per bucket", () => {
    expect(billedBytesByBucket(billing24h).get("default_logs")).toBe(736666253);
  });
});

describe("flattenConfig", () => {
  it("flattens nested settings values into dotted rows", () => {
    expect(flattenConfig({ a: 1, b: { c: "x", d: [1, 2] }, e: null })).toEqual([
      { key: "a", value: "1" },
      { key: "b.c", value: "x" },
      { key: "b.d", value: "[1,2]" },
      { key: "e", value: "–" },
    ]);
  });
});
