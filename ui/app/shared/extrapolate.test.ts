import { perDay, ratePerUnit, projectDaily, projectMonthly } from "./extrapolate";

describe("perDay", () => {
  it("divides volume by timeframe days", () => {
    expect(perDay(70, 7)).toBe(10);
  });
  it("returns 0 for zero, negative or NaN days", () => {
    expect(perDay(70, 0)).toBe(0);
    expect(perDay(70, -1)).toBe(0);
    expect(perDay(70, NaN)).toBe(0);
    expect(perDay(NaN, 7)).toBe(0);
  });
});

describe("ratePerUnit", () => {
  it("divides daily volume by driver count", () => {
    expect(ratePerUnit(10, 4)).toBe(2.5);
  });
  it("returns null when the driver count is 0 or negative", () => {
    expect(ratePerUnit(10, 0)).toBeNull();
    expect(ratePerUnit(10, -3)).toBeNull();
  });
  it("returns null for NaN input", () => {
    expect(ratePerUnit(NaN, 4)).toBeNull();
    expect(ratePerUnit(10, NaN)).toBeNull();
  });
  it("returns 0 when there is no volume but drivers exist", () => {
    expect(ratePerUnit(0, 4)).toBe(0);
  });
});

describe("projectDaily", () => {
  it("multiplies rate by production count and multiplier", () => {
    expect(projectDaily(2.5, 100, 1.2)).toBeCloseTo(300);
  });
  it("defaults the multiplier to 1", () => {
    expect(projectDaily(2, 10)).toBe(20);
  });
  it("returns 0 for a multiplier of 0", () => {
    expect(projectDaily(2, 10, 0)).toBe(0);
  });
  it("returns null when the rate is null", () => {
    expect(projectDaily(null, 10, 1)).toBeNull();
  });
  it("returns null for negative or NaN counts and multipliers", () => {
    expect(projectDaily(2, -1, 1)).toBeNull();
    expect(projectDaily(2, 10, -1)).toBeNull();
    expect(projectDaily(2, NaN, 1)).toBeNull();
    expect(projectDaily(2, 10, NaN)).toBeNull();
  });
});

describe("projectMonthly", () => {
  it("multiplies by 30 days by default", () => {
    expect(projectMonthly(10)).toBe(300);
  });
  it("accepts a custom day count", () => {
    expect(projectMonthly(10, 31)).toBe(310);
  });
  it("passes null through", () => {
    expect(projectMonthly(null)).toBeNull();
  });
});
