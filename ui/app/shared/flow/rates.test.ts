import { FLOW_WINDOWS, ratePerSecond, sumSeries, addSeries, scaleSeries } from "./rates";

describe("rates", () => {
  it("defines the three windows in seconds", () => {
    expect(FLOW_WINDOWS["5m"].seconds).toBe(300);
    expect(FLOW_WINDOWS["1h"].seconds).toBe(3600);
    expect(FLOW_WINDOWS["24h"].seconds).toBe(86400);
  });
  it("sums series treating null and NaN as 0", () => {
    expect(sumSeries([1, null, 2, Number.NaN, "3"])).toBe(6);
    expect(sumSeries(undefined)).toBe(0);
    expect(sumSeries(42)).toBe(42);
  });
  it("divides by window seconds", () => {
    expect(ratePerSecond(3600, 3600)).toBe(1);
    expect(ratePerSecond(10, 0)).toBe(0);
    expect(ratePerSecond(Number.NaN, 60)).toBe(0);
  });
  it("adds and scales aligned series", () => {
    expect(addSeries([1, 2], [3, 4, 5])).toEqual([4, 6, 5]);
    expect(scaleSeries([2, 4], 0.5)).toEqual([1, 2]);
  });
});
