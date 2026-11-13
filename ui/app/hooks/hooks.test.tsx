import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { useRateCard } from "./useRateCard";
import { useBreakdown } from "./useBreakdown";
import { useIngestTotals } from "./useIngestTotals";
import { TimeframeProvider } from "../context/Timeframe";
import { LIST_PRICES } from "../shared/rateCard";
import { BREAKDOWNS } from "../queries/breakdown";
import ingestTotals from "../queries/__fixtures__/INGEST_TOTALS.json";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));

const mockUseDql = useDql as jest.Mock;
const mockUseAppState = useAppState as jest.Mock;
const mockUseSetAppState = useSetAppState as jest.Mock;

const dqlResult = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  error: null,
  forceRefetch: jest.fn(),
  ...over,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TimeframeProvider>{children}</TimeframeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSetAppState.mockReturnValue({ execute: jest.fn().mockResolvedValue(undefined), isLoading: false, error: undefined });
});

describe("useRateCard", () => {
  it("uses list prices when nothing is stored (NotFound is not an error)", () => {
    const err = Object.assign(new Error("Not found"), { name: "NotFound" });
    mockUseAppState.mockReturnValue({ data: undefined, isError: true, error: err, errorDetails: { code: 404 }, isLoading: false });
    const { result } = renderHook(() => useRateCard());
    expect(result.current.card).toEqual(LIST_PRICES);
    expect(result.current.isListPrice).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("falls back to list prices for corrupt state", () => {
    mockUseAppState.mockReturnValue({ data: { value: "{broken" }, isError: false, isLoading: false });
    const { result } = renderHook(() => useRateCard());
    expect(result.current.card).toEqual(LIST_PRICES);
  });

  it("reports other load errors", () => {
    mockUseAppState.mockReturnValue({ data: undefined, isError: true, error: new Error("Forbidden"), errorDetails: { code: 403 }, isLoading: false });
    const { result } = renderHook(() => useRateCard());
    expect(result.current.error?.message).toBe("Forbidden");
  });

  it("saves JSON and shows the saved value immediately", async () => {
    mockUseAppState.mockReturnValue({ data: undefined, isError: false, isLoading: false });
    const execute = jest.fn().mockResolvedValue(undefined);
    mockUseSetAppState.mockReturnValue({ execute, isLoading: false, error: undefined });
    const { result } = renderHook(() => useRateCard());
    const edited = { ...LIST_PRICES, rates: { ...LIST_PRICES.rates, logs: { ...LIST_PRICES.rates.logs, ingestPrice: 0.1 } } };
    await act(() => result.current.save(edited));
    expect(execute).toHaveBeenCalledWith({ key: "rate-card", body: { value: JSON.stringify(edited) } });
    expect(result.current.isListPrice).toBe(false);
  });
});

describe("useIngestTotals", () => {
  it("passes the timeframe to useDql and parses records", () => {
    mockUseDql.mockReturnValue(dqlResult({ data: { records: ingestTotals } }));
    const { result } = renderHook(() => useIngestTotals(), { wrapper });
    const [params] = mockUseDql.mock.calls[0] as [{ defaultTimeframeStart: string; defaultTimeframeEnd: string }];
    expect(new Date(params.defaultTimeframeEnd).getTime() - new Date(params.defaultTimeframeStart).getTime()).toBe(7 * 86_400_000);
    expect(result.current.data?.bySignal.metrics.volume).toBe(2198476);
  });
});

describe("useBreakdown", () => {
  const tf = { start: "2026-11-12T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", days: 1 };

  it("does not run until run() is called", () => {
    mockUseDql.mockReturnValue(dqlResult());
    const { result } = renderHook(() => useBreakdown(BREAKDOWNS[0], tf));
    expect(mockUseDql.mock.calls[0][1]).toMatchObject({ enabled: false });
    expect(result.current.hasRun).toBe(false);
    act(() => result.current.run());
    const last = mockUseDql.mock.calls[mockUseDql.mock.calls.length - 1] as unknown[];
    expect(last[1]).toMatchObject({ enabled: true });
    expect(result.current.hasRun).toBe(true);
  });

  it("resets when the timeframe changes", () => {
    mockUseDql.mockReturnValue(dqlResult());
    const { result, rerender } = renderHook(({ t }) => useBreakdown(BREAKDOWNS[0], t), { initialProps: { t: tf } });
    act(() => result.current.run());
    rerender({ t: { ...tf, start: "2026-11-11T00:00:00.000Z" } });
    expect(result.current.hasRun).toBe(false);
  });
});
