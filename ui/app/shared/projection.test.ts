import { projectSignal, projectTotal } from "./projection";
import { LIST_PRICES } from "./rateCard";

describe("projectSignal", () => {
  it("projects volume and cost for a GiB signal", () => {
    // 7 GiB/day over 7 hosts = 1 GiB/host/day; 100 prod hosts × 1.0 = 100 GiB/day
    const r = projectSignal({
      signal: "logs",
      pocVolumePerDay: 7,
      pocDriverCount: 7,
      prodCount: 100,
      multiplier: 1,
      retentionDays: 35,
      card: LIST_PRICES,
    });
    expect(r.disabled).toBe(false);
    expect(r.ratePerUnit).toBe(1);
    expect(r.prodPerDay).toBe(100);
    expect(r.prodPerMonth).toBe(3000);
    expect(r.ingestCost).toBeCloseTo(3000 * 0.2);
    // 100 GiB/day × 35 days stored × 0.0007 × 30
    expect(r.retainCost).toBeCloseTo(100 * 35 * 0.0007 * 30);
    expect(r.totalCost).toBeCloseTo(r.ingestCost + r.retainCost);
  });

  it("prices metrics per 100k data points without retain cost", () => {
    const r = projectSignal({
      signal: "metrics",
      pocVolumePerDay: 300_000,
      pocDriverCount: 3,
      prodCount: 30,
      multiplier: 1,
      retentionDays: 462,
      card: LIST_PRICES,
    });
    expect(r.prodPerMonth).toBe(90_000_000);
    expect(r.ingestCost).toBeCloseTo(900 * 0.15);
    expect(r.retainCost).toBe(0);
  });

  it("is disabled with null figures when the driver count is 0", () => {
    const r = projectSignal({
      signal: "traces",
      pocVolumePerDay: 8,
      pocDriverCount: 0,
      prodCount: 10,
      multiplier: 1,
      retentionDays: 10,
      card: LIST_PRICES,
    });
    expect(r.disabled).toBe(true);
    expect(r.ratePerUnit).toBeNull();
    expect(r.totalCost).toBe(0);
  });
});

describe("projectTotal", () => {
  it("sums cost over enabled rows", () => {
    const t = projectTotal([
      { ingestCost: 1, retainCost: 2, totalCost: 3, disabled: false },
      { ingestCost: 10, retainCost: 0, totalCost: 10, disabled: true },
    ]);
    expect(t).toEqual({ ingestCost: 1, retainCost: 2, totalCost: 3 });
  });
});
