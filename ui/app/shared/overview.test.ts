import { signalSummaries, bucketRows, trendToTimeseries, costShare } from "./overview";
import { LIST_PRICES } from "./rateCard";
import { GIB } from "./units";
import type { IngestRow, BucketRow, RetainRow, TrendSeries } from "../queries/parse";
import { totalsBySignal } from "../queries/parse";

const rows: IngestRow[] = [
  { signal: "logs", bucket: "default_logs", bytes: 7 * GIB, dataPoints: 0, spans: 0, volume: 7 },
  { signal: "metrics", bucket: "default_metrics", bytes: 0, dataPoints: 700_000, spans: 0, volume: 700_000 },
];
const retain: RetainRow[] = [{ signal: "logs", bucket: "default_logs", storedGiB: 100 }];

describe("signalSummaries", () => {
  const s = signalSummaries(totalsBySignal(rows), retain, 7, LIST_PRICES);
  it("computes volume, per-day volume and costs per signal", () => {
    expect(s.logs.volume).toBe(7);
    expect(s.logs.perDay).toBe(1);
    expect(s.logs.ingestCost).toBeCloseTo(7 * 0.2);
    // 100 GiB stored for 7 days at 0.0007/GiB-day
    expect(s.logs.retainCost).toBeCloseTo(100 * 7 * 0.0007);
    expect(s.logs.cost).toBeCloseTo(s.logs.ingestCost + s.logs.retainCost);
    expect(s.metrics.ingestCost).toBeCloseTo(7 * 0.15);
    expect(s.metrics.retainCost).toBe(0);
  });
  it("is zero for signals without data", () => {
    expect(s.events).toMatchObject({ volume: 0, perDay: 0, cost: 0 });
  });
});

describe("bucketRows", () => {
  const buckets: BucketRow[] = [
    { name: "default_logs", displayName: "Logs", table: "logs", signal: "logs", retentionDays: 35, estimatedBytes: 0, records: 0 },
  ];
  it("joins ingest rows with retention and stored volume", () => {
    const out = bucketRows(rows, buckets, retain, 7, LIST_PRICES);
    const logs = out.find((r) => r.bucket === "default_logs");
    expect(logs).toMatchObject({ displayName: "Logs", retentionDays: 35, storedGiB: 100, signal: "logs" });
    expect(logs?.cost).toBeCloseTo(7 * 0.2 + 100 * 7 * 0.0007);
    const metrics = out.find((r) => r.bucket === "default_metrics");
    expect(metrics?.retentionDays).toBeNull();
    expect(metrics?.storedGiB).toBeNull();
  });
  it("sorts by cost, highest first", () => {
    const out = bucketRows(rows, [], [], 7, LIST_PRICES);
    expect(out[0].cost).toBeGreaterThanOrEqual(out[1].cost);
  });
});

describe("trendToTimeseries", () => {
  const series: TrendSeries[] = [
    { signal: "logs", start: new Date("2026-11-06T00:00:00Z"), end: new Date("2026-11-08T00:00:00Z"), intervalMs: 86_400_000, values: [1, 2] },
    { signal: "metrics", start: new Date("2026-11-06T00:00:00Z"), end: new Date("2026-11-08T00:00:00Z"), intervalMs: 86_400_000, values: [100_000, 200_000] },
  ];
  it("builds GiB series without metrics in volume mode", () => {
    const ts = trendToTimeseries(series, "volume", LIST_PRICES);
    expect(ts.map((t) => t.signal)).toEqual(["logs"]);
    expect(ts[0].timeseries.datapoints[1]).toEqual({
      start: new Date("2026-11-07T00:00:00Z"),
      end: new Date("2026-11-08T00:00:00Z"),
      value: 2,
    });
    expect(ts[0].timeseries.name).toBe("Logs");
  });
  it("builds cost series including metrics in cost mode", () => {
    const ts = trendToTimeseries(series, "cost", LIST_PRICES);
    expect(ts.map((t) => t.signal)).toEqual(["logs", "metrics"]);
    expect(ts[1].timeseries.datapoints[0].value).toBeCloseTo(0.15);
  });
});

describe("costShare", () => {
  it("returns non-zero slices with signal colours", () => {
    const s = signalSummaries(totalsBySignal(rows), retain, 7, LIST_PRICES);
    const slices = costShare(s);
    expect(slices.map((x) => x.category)).toEqual(["Logs", "Metrics"]);
    slices.forEach((x) => expect(typeof x.color).toBe("string"));
  });
});
