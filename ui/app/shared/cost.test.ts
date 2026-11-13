import { ingestCost, retainCost, totalCost } from "./cost";

describe("ingestCost", () => {
  it("multiplies volume by unit price", () => {
    expect(ingestCost(100, 0.2)).toBeCloseTo(20);
  });
  it("returns 0 for invalid input", () => {
    expect(ingestCost(NaN, 0.2)).toBe(0);
    expect(ingestCost(100, NaN)).toBe(0);
    expect(ingestCost(-1, 0.2)).toBe(0);
    expect(ingestCost(100, -0.2)).toBe(0);
  });
});

describe("retainCost", () => {
  // steady state: daily volume kept for retentionDays, the first includedDays are free.
  it("charges stored GiB beyond included days for a 30-day month", () => {
    // 10 GiB/day * (35 - 10) days stored = 250 GiB * 0.0007 * 30 days
    expect(retainCost(10, 35, 10, 0.0007)).toBeCloseTo(5.25);
  });
  it("is 0 when retention is at or below included days", () => {
    expect(retainCost(10, 10, 10, 0.0007)).toBe(0);
    expect(retainCost(10, 5, 10, 0.0007)).toBe(0);
  });
  it("is 0 when the price is null (not applicable)", () => {
    expect(retainCost(10, 35, 0, null)).toBe(0);
  });
  it("accepts a custom number of days in the month", () => {
    expect(retainCost(1, 2, 0, 1, 31)).toBe(62);
  });
  it("returns 0 for NaN or negative input", () => {
    expect(retainCost(NaN, 35, 0, 1)).toBe(0);
    expect(retainCost(10, NaN, 0, 1)).toBe(0);
    expect(retainCost(-10, 35, 0, 1)).toBe(0);
    expect(retainCost(10, 35, NaN, 1)).toBeCloseTo(10 * 35 * 30);
  });
});

describe("totalCost", () => {
  it("adds ingest and retain cost", () => {
    expect(totalCost({ ingest: 20, retain: 5.25 })).toBeCloseTo(25.25);
  });
  it("ignores NaN parts", () => {
    expect(totalCost({ ingest: NaN, retain: 5 })).toBe(5);
  });
});
