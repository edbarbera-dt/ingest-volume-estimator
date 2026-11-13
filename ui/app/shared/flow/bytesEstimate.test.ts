import billing24h from "./__fixtures__/billing-24h.json";
import out24h from "./__fixtures__/out-24h.json";
import { avgRecordSizes, bytesRate } from "./bytesEstimate";

describe("avgRecordSizes (rkj7350h 24h)", () => {
  const sizes = avgRecordSizes(billing24h, out24h);
  it("divides billed bytes by pipelines_out records per bucket", () => {
    expect(sizes.get("default_logs")).toBeCloseTo(736666253 / 3907743);
    expect(sizes.get("default_spans")).toBeCloseTo(8702728541 / 5591127);
    expect(sizes.get("default_bizevents")).toBeCloseTo(426077 / 1472);
  });
  it("has no size for metrics (billed by data points) or unbilled buckets", () => {
    expect(sizes.has("default_metrics")).toBe(false);
    expect(sizes.has("default_fleet_events")).toBe(false);
  });
  it("has no size when the bucket had no records", () => {
    const s = avgRecordSizes(
      [{ "event.type": "Log Management & Analytics - Ingest & Process", "usage.bucket": "b", bytes: 100, dp: 0, spans: 0 }],
      [{ bucket_name: "b", configuration: "logs", r: 0 }],
    );
    expect(s.has("b")).toBe(false);
  });
});

describe("bytesRate", () => {
  it("multiplies rec/s by record size", () => {
    expect(bytesRate(2, 100)).toBe(200);
  });
  it("is null without a size", () => {
    expect(bytesRate(2, undefined)).toBeNull();
  });
});
