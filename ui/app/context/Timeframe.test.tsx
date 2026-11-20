import React from "react";
import { act, renderHook } from "@testing-library/react";
import { TimeframeProvider, useTimeframe } from "./Timeframe";
import { DEFAULT_TIMEFRAME } from "../shared/timeframe";

const wrap =
  (initial?: React.ComponentProps<typeof TimeframeProvider>["initial"]) =>
  ({ children }: { children: React.ReactNode }) => <TimeframeProvider initial={initial}>{children}</TimeframeProvider>;

describe("TimeframeProvider", () => {
  it("defaults to the last 7 days", () => {
    const { result } = renderHook(() => useTimeframe(), { wrapper: wrap() });
    expect(result.current.value).toEqual(DEFAULT_TIMEFRAME);
    expect(result.current.days).toBeCloseTo(7);
    expect(new Date(result.current.end).getTime()).toBeGreaterThan(new Date(result.current.start).getTime());
  });

  it("resolves an absolute initial timeframe", () => {
    const initial = { from: "2026-11-01T00:00:00Z", to: "2026-11-03T00:00:00Z" };
    const { result } = renderHook(() => useTimeframe(), { wrapper: wrap(initial) });
    expect(result.current.start).toBe("2026-11-01T00:00:00.000Z");
    expect(result.current.end).toBe("2026-11-03T00:00:00.000Z");
    expect(result.current.days).toBe(2);
  });

  it("resolves a new value from the selector", () => {
    const { result } = renderHook(() => useTimeframe(), { wrapper: wrap() });
    const next = {
      from: { absoluteDate: "2026-11-10T00:00:00.000Z", value: "now-1d", type: "expression" as const },
      to: { absoluteDate: "2026-11-11T00:00:00.000Z", value: "now", type: "expression" as const },
    };
    act(() => result.current.setValue(next));
    expect(result.current.value).toBe(next);
    expect(result.current.start).toBe("2026-11-10T00:00:00.000Z");
    expect(result.current.days).toBe(1);
  });

  it("falls back to the default when the selector is cleared", () => {
    const { result } = renderHook(() => useTimeframe(), {
      wrapper: wrap({ from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z" }),
    });
    act(() => result.current.setValue(null));
    expect(result.current.value).toEqual(DEFAULT_TIMEFRAME);
    expect(result.current.days).toBeCloseTo(7);
  });

  it("keeps the same resolved times across re-renders", () => {
    const { result, rerender } = renderHook(() => useTimeframe(), { wrapper: wrap() });
    const { start, end } = result.current;
    rerender();
    expect(result.current.start).toBe(start);
    expect(result.current.end).toBe(end);
  });

  it("throws outside the provider", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useTimeframe())).toThrow("useTimeframe must be used inside TimeframeProvider");
    jest.restoreAllMocks();
  });
});
