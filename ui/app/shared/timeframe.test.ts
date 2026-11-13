import { resolveTime, resolveTimeframe, clampToLastHours } from "./timeframe";

const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("resolveTime", () => {
  it.each([
    ["now", "2026-11-13T12:00:00.000Z"],
    ["now-7d", "2026-11-06T12:00:00.000Z"],
    ["now-24h", "2026-11-12T12:00:00.000Z"],
    ["now-30m", "2026-11-13T11:30:00.000Z"],
    ["now-2w", "2026-10-30T12:00:00.000Z"],
    ["2026-11-01T00:00:00Z", "2026-11-01T00:00:00.000Z"],
  ])("%s → %s", (expr, iso) => {
    expect(resolveTime(expr, NOW)?.toISOString()).toBe(iso);
  });
  it("returns null for garbage", () => {
    expect(resolveTime("yesterday-ish", NOW)).toBeNull();
  });
  it("uses absoluteDate of a TimeValue", () => {
    expect(
      resolveTime({ absoluteDate: "2026-11-10T00:00:00.000Z", value: "now-3d", type: "expression" }, NOW)?.toISOString(),
    ).toBe("2026-11-10T00:00:00.000Z");
  });
});

describe("resolveTimeframe", () => {
  it("resolves a relative timeframe and counts days", () => {
    expect(resolveTimeframe({ from: "now-7d", to: "now" }, NOW)).toEqual({
      start: "2026-11-06T12:00:00.000Z",
      end: "2026-11-13T12:00:00.000Z",
      days: 7,
    });
  });
  it("falls back to the last 7 days for null or inverted input", () => {
    const fallback = resolveTimeframe(null, NOW);
    expect(fallback.days).toBe(7);
    expect(resolveTimeframe({ from: "now", to: "now-1d" }, NOW)).toEqual(fallback);
  });
});

describe("clampToLastHours", () => {
  it("limits a timeframe to its last N hours", () => {
    const tf = resolveTimeframe({ from: "now-7d", to: "now" }, NOW);
    expect(clampToLastHours(tf, 24)).toEqual({
      start: "2026-11-12T12:00:00.000Z",
      end: "2026-11-13T12:00:00.000Z",
      days: 1,
    });
  });
  it("leaves shorter timeframes alone", () => {
    const tf = resolveTimeframe({ from: "now-2h", to: "now" }, NOW);
    expect(clampToLastHours(tf, 24)).toEqual(tf);
  });
});
