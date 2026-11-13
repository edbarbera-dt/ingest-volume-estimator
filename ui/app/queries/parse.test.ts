import ingestTotals from "./__fixtures__/INGEST_TOTALS.json";
import ingestTrend from "./__fixtures__/INGEST_TREND.json";
import hostDrivers from "./__fixtures__/HOST_DRIVERS.json";
import retainTotals from "./__fixtures__/RETAIN_TOTALS.json";
import entityDrivers from "./__fixtures__/ENTITY_DRIVERS.json";
import buckets from "./__fixtures__/BUCKETS.json";
import tracesByService from "./__fixtures__/BREAKDOWN_traces-service.json";
import logsBySource from "./__fixtures__/BREAKDOWN_logs-source.json";
import {
  parseIngestTotals,
  totalsBySignal,
  parseTrend,
  parseHostDrivers,
  parseEntityDrivers,
  parseRetainTotals,
  parseBuckets,
  bucketSignal,
  parseBreakdown,
} from "./parse";
import { GIB } from "../shared/units";

describe("parseIngestTotals (rkj7350h fixture)", () => {
  const rows = parseIngestTotals(ingestTotals);

  it("maps event.type to signal and converts volume to the signal unit", () => {
    const logs = rows.find((r) => r.signal === "logs");
    expect(logs).toMatchObject({ bucket: "default_logs", bytes: 5295355750 });
    expect(logs?.volume).toBeCloseTo(5295355750 / GIB);
    const metrics = rows.find((r) => r.signal === "metrics");
    expect(metrics?.volume).toBe(2198476);
    expect(rows.find((r) => r.signal === "traces")?.spans).toBe(40137505);
  });

  it("drops non-volume and malformed records", () => {
    expect(
      parseIngestTotals([
        { "event.type": "Log Management & Analytics - Query", bytes: 1 },
        { "event.type": 5 },
        null,
      ] as unknown[]),
    ).toEqual([]);
  });

  it("tolerates undefined input", () => {
    expect(parseIngestTotals(undefined)).toEqual([]);
  });
});

describe("totalsBySignal", () => {
  it("sums buckets per signal and fills missing signals with 0", () => {
    const t = totalsBySignal([
      { signal: "logs", bucket: "a", bytes: GIB, dataPoints: 0, spans: 0, volume: 1 },
      { signal: "logs", bucket: "b", bytes: GIB, dataPoints: 0, spans: 0, volume: 1 },
    ]);
    expect(t.logs.volume).toBe(2);
    expect(t.logs.bytes).toBe(2 * GIB);
    expect(t.metrics.volume).toBe(0);
  });
});

describe("parseTrend", () => {
  const series = parseTrend(ingestTrend);
  it("builds one daily series per signal in the signal unit", () => {
    const events = series.find((s) => s.signal === "events");
    expect(events?.intervalMs).toBe(86_400_000);
    expect(events?.start.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(events?.values).toHaveLength(8);
    expect(events?.values[0]).toBeCloseTo(44535 / GIB);
    const metrics = series.find((s) => s.signal === "metrics");
    expect(metrics?.values.every((v) => v >= 0)).toBe(true);
  });
  it("treats null points as 0", () => {
    const [s] = parseTrend([
      {
        timeframe: { start: "2026-11-06T00:00:00Z", end: "2026-11-08T00:00:00Z" },
        interval: "86400000000000",
        bytes: [null, GIB],
        dp: [0, 0],
        "event.type": "Traces - Ingest & Process",
      },
    ]);
    expect(s.values).toEqual([0, 1]);
  });
});

describe("drivers", () => {
  it("parses host drivers", () => {
    expect(parseHostDrivers(hostDrivers)).toEqual({ hosts: 3, gibHours: 8468.5 });
  });
  it("returns zero host drivers when there is no host billing", () => {
    expect(parseHostDrivers([])).toEqual({ hosts: 0, gibHours: 0 });
  });
  it("maps smartscape types to drivers, 0 for missing types", () => {
    expect(parseEntityDrivers(entityDrivers)).toEqual({
      hosts: 3,
      services: 11,
      pods: 0,
      clusters: 0,
      containers: 15,
    });
  });
});

describe("parseRetainTotals", () => {
  it("keeps signal retain rows and converts to GiB", () => {
    const rows = parseRetainTotals(retainTotals);
    expect(rows.map((r) => r.signal).sort()).toEqual(["events", "logs"]);
    expect(rows.find((r) => r.signal === "logs")?.storedGiB).toBeCloseTo(
      597631973923.238 / GIB,
    );
  });
});

describe("parseBuckets", () => {
  it("parses retention and table", () => {
    const rows = parseBuckets(buckets);
    const logs = rows.find((b) => b.name === "default_logs");
    expect(logs).toMatchObject({ table: "logs", retentionDays: 35, signal: "logs" });
    expect(rows.find((b) => b.name === "default_bizevents")?.signal).toBe("events");
  });
  it.each([
    ["logs", "logs"],
    ["spans", "traces"],
    ["metrics", "metrics"],
    ["events", "events"],
    ["bizevents", "events"],
    ["files", null],
  ])("bucketSignal(%s) = %s", (table, signal) => {
    expect(bucketSignal(table)).toBe(signal);
  });
});

describe("parseBreakdown", () => {
  it("sorts by value and computes shares of the total", () => {
    const rows = parseBreakdown(tracesByService);
    expect(rows[0].key).toBe("order-service");
    const total = rows.reduce((a, r) => a + r.value, 0);
    expect(rows[0].share).toBeCloseTo(3575904 / total);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1);
    expect(rows[0].records).toBeNull();
  });
  it("keeps record counts when present", () => {
    expect(parseBreakdown(logsBySource)[0].records).toBeGreaterThan(0);
  });
  it("gives 0 shares when the total is 0", () => {
    expect(parseBreakdown([{ key: "a", value: "0" }])[0].share).toBe(0);
  });
});
