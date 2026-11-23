import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { useBaselines } from "./useBaselines";
import { useRateCard } from "./useRateCard";
import { useDrivers } from "./useDrivers";
import { useExtrapolationInputs } from "./useExtrapolationInputs";
import { useTimeframedDql } from "./useTimeframedDql";
import { usePersistedState } from "./usePersistedState";
import { TimeframeProvider } from "../context/Timeframe";
import { HOST_DRIVERS } from "../queries/billing";
import { ENTITY_DRIVERS } from "../queries/drivers";
import { defaultInputs } from "../shared/inputs";
import { LIST_PRICES, listPricesFor } from "../shared/rateCard";
import type { Baseline } from "../shared/baselines";
import { dqlMock } from "../../test/mocks";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));

const mockUseDql = useDql as jest.Mock;
const mockUseAppState = useAppState as jest.Mock;
const mockUseSetAppState = useSetAppState as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => <TimeframeProvider>{children}</TimeframeProvider>;

const stored = (value: unknown) => ({ data: { value: JSON.stringify(value) }, isError: false, isLoading: false });

const baseline = (id: string, label = id): Baseline => ({
  id,
  label,
  createdAt: "2026-11-13T00:00:00.000Z",
  timeframe: { start: "2026-11-06T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", days: 7 },
  volumePerDay: { logs: 1, traces: 2, metrics: 3, events: 4 },
  drivers: { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 },
});

let execute: jest.Mock;

/** Body of the n-th setAppState call, parsed. */
const savedBody = (n = 0): unknown => JSON.parse((execute.mock.calls[n] as [{ body: { value: string } }])[0].body.value);

beforeEach(() => {
  jest.clearAllMocks();
  execute = jest.fn().mockResolvedValue(undefined);
  mockUseSetAppState.mockReturnValue({ execute, isLoading: false, error: undefined });
  mockUseAppState.mockReturnValue({ data: undefined, isError: false, isLoading: false });
});

describe("usePersistedState", () => {
  it("is loading until the state arrives, but not once a value was saved locally", async () => {
    mockUseAppState.mockReturnValue({ data: undefined, isError: false, isLoading: true });
    const { result } = renderHook(() => usePersistedState("k", (raw) => (typeof raw === "string" ? raw : "default")));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.value).toBe("default");
    await act(() => result.current.save("mine"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toBe("mine");
  });

  it("exposes saving and save errors from the setter", () => {
    mockUseSetAppState.mockReturnValue({ execute, isLoading: true, error: new Error("Forbidden") });
    const { result } = renderHook(() => usePersistedState("k", () => 0));
    expect(result.current.isSaving).toBe(true);
    expect(result.current.saveError?.message).toBe("Forbidden");
  });
});

describe("useBaselines", () => {
  it("starts empty with no active baseline", () => {
    const { result } = renderHook(() => useBaselines());
    expect(result.current.baselines).toEqual([]);
    expect(result.current.active).toBeNull();
  });

  it("resolves the active baseline from the stored id", () => {
    mockUseAppState.mockReturnValue(stored({ baselines: [baseline("a"), baseline("b")], activeId: "b" }));
    const { result } = renderHook(() => useBaselines());
    expect(result.current.baselines.map((b) => b.id)).toEqual(["a", "b"]);
    expect(result.current.active?.id).toBe("b");
  });

  it("adds a baseline at the top and saves under the baselines key", async () => {
    mockUseAppState.mockReturnValue(stored({ baselines: [baseline("a")], activeId: null }));
    const { result } = renderHook(() => useBaselines());
    await act(() => result.current.add(baseline("new", "After filters")));
    expect((execute.mock.calls[0] as [{ key: string }])[0].key).toBe("baselines");
    expect(savedBody()).toMatchObject({ baselines: [{ id: "new", label: "After filters" }, { id: "a" }], activeId: null });
    expect(result.current.baselines.map((b) => b.id)).toEqual(["new", "a"]);
  });

  it("sets and clears the active baseline", async () => {
    mockUseAppState.mockReturnValue(stored({ baselines: [baseline("a")], activeId: null }));
    const { result } = renderHook(() => useBaselines());
    await act(() => result.current.setActive("a"));
    expect(result.current.active?.id).toBe("a");
    await act(() => result.current.setActive(null));
    expect(result.current.active).toBeNull();
    expect(savedBody(1)).toMatchObject({ activeId: null });
  });

  it("removing the active baseline clears the active id", async () => {
    mockUseAppState.mockReturnValue(stored({ baselines: [baseline("a"), baseline("b")], activeId: "a" }));
    const { result } = renderHook(() => useBaselines());
    await act(() => result.current.remove("a"));
    expect(savedBody()).toMatchObject({ baselines: [{ id: "b" }], activeId: null });
    expect(result.current.active).toBeNull();
  });
});

describe("useRateCard reset", () => {
  it("resets to list prices in the stored currency", async () => {
    const eur = listPricesFor("EUR");
    mockUseAppState.mockReturnValue(stored({ ...eur, rates: { ...eur.rates, logs: { ...eur.rates.logs, ingestPrice: 0.01 } } }));
    const { result } = renderHook(() => useRateCard());
    expect(result.current.isListPrice).toBe(false);
    await act(() => result.current.reset());
    expect(savedBody()).toEqual(eur);
    expect(result.current.card).toEqual(eur);
    expect(result.current.isListPrice).toBe(true);
    expect(result.current.card).not.toEqual(LIST_PRICES);
  });
});

describe("useExtrapolationInputs", () => {
  it("loads saved inputs and saves under the extrapolation-inputs key", async () => {
    mockUseAppState.mockReturnValue(stored({ ...defaultInputs(), retentionDays: { ...defaultInputs().retentionDays, logs: 90 } }));
    const { result } = renderHook(() => useExtrapolationInputs());
    expect(result.current.value.retentionDays.logs).toBe(90);
    await act(() => result.current.save({ ...result.current.value, retentionDays: { ...result.current.value.retentionDays, logs: 120 } }));
    expect((execute.mock.calls[0] as [{ key: string }])[0].key).toBe("extrapolation-inputs");
    expect(savedBody()).toMatchObject({ version: 2, retentionDays: { logs: 120 } });
  });
});

describe("useTimeframedDql", () => {
  const tf = { start: "2026-11-12T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z" };

  it("passes query, timeframe and options to useDql", () => {
    mockUseDql.mockReturnValue({ data: undefined, isLoading: true, error: null, forceRefetch: jest.fn() });
    const parse = jest.fn();
    const { result } = renderHook(() => useTimeframedDql("fetch logs", tf, parse, { enabled: false }));
    expect(mockUseDql).toHaveBeenCalledWith(
      { query: "fetch logs", defaultTimeframeStart: tf.start, defaultTimeframeEnd: tf.end },
      { enabled: false, staleTime: 300_000 },
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(parse).not.toHaveBeenCalled();
  });

  it("parses records and refetches on demand", () => {
    const forceRefetch = jest.fn().mockResolvedValue(undefined);
    mockUseDql.mockReturnValue({ data: { records: [{ n: 1 }] }, isLoading: false, error: null, forceRefetch });
    const { result } = renderHook(() => useTimeframedDql("q", tf, (r) => (r as unknown[]).length));
    expect(mockUseDql.mock.calls[0][1]).toMatchObject({ enabled: true });
    expect(result.current.records).toEqual([{ n: 1 }]);
    expect(result.current.data).toBe(1);
    result.current.refetch();
    expect(forceRefetch).toHaveBeenCalledTimes(1);
  });

  it("passes errors through", () => {
    mockUseDql.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom"), forceRefetch: jest.fn() });
    const { result } = renderHook(() => useTimeframedDql("q", tf, () => 0));
    expect(result.current.error?.message).toBe("boom");
  });
});

describe("useDrivers", () => {
  it("combines Smartscape and billed host counts", () => {
    mockUseDql.mockImplementation(dqlMock("data"));
    const { result } = renderHook(() => useDrivers(), { wrapper });
    expect(result.current.data?.counts).toMatchObject({ hosts: 3, services: 11, containers: 15 });
    expect(result.current.data?.billing.hosts).toBe(3);
  });

  it("takes the larger of Smartscape and billed hosts", () => {
    mockUseDql.mockImplementation((p: { query: string }) => ({
      isLoading: false,
      error: null,
      forceRefetch: jest.fn(),
      data: {
        records:
          p.query === HOST_DRIVERS
            ? [{ "event.type": "Full-Stack Monitoring", gibh: 1, hosts: "9" }]
            : p.query === ENTITY_DRIVERS
              ? [{ type: "HOST", n: "2" }]
              : [],
      },
    }));
    const { result } = renderHook(() => useDrivers(), { wrapper });
    expect(result.current.data?.counts.hosts).toBe(9);
  });

  it("has no data while either query is loading", () => {
    mockUseDql.mockImplementation(dqlMock((q) => (q === ENTITY_DRIVERS ? "loading" : "data")));
    const { result } = renderHook(() => useDrivers(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("reports the first error", () => {
    mockUseDql.mockImplementation(dqlMock((q) => (q === HOST_DRIVERS ? "forbidden" : "data")));
    const { result } = renderHook(() => useDrivers(), { wrapper });
    expect(result.current.error?.message).toBe("Forbidden");
  });

  it("refetches both queries", () => {
    const refetches: jest.Mock[] = [];
    mockUseDql.mockImplementation(() => {
      const forceRefetch = jest.fn().mockResolvedValue(undefined);
      refetches.push(forceRefetch);
      return { data: { records: [] }, isLoading: false, error: null, forceRefetch };
    });
    const { result } = renderHook(() => useDrivers(), { wrapper });
    const latest = refetches.slice(-2);
    result.current.refetch();
    expect(latest[0]).toHaveBeenCalledTimes(1);
    expect(latest[1]).toHaveBeenCalledTimes(1);
  });
});
