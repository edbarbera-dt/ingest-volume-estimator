import React from "react";
import { INGEST_TOTALS, INGEST_TREND, HOST_DRIVERS, RETAIN_TOTALS } from "../app/queries/billing";
import { ENTITY_DRIVERS } from "../app/queries/drivers";
import { BUCKETS } from "../app/queries/buckets";
import ingestTotals from "../app/queries/__fixtures__/INGEST_TOTALS.json";
import ingestTrend from "../app/queries/__fixtures__/INGEST_TREND.json";
import hostDrivers from "../app/queries/__fixtures__/HOST_DRIVERS.json";
import retainTotals from "../app/queries/__fixtures__/RETAIN_TOTALS.json";
import entityDrivers from "../app/queries/__fixtures__/ENTITY_DRIVERS.json";
import buckets from "../app/queries/__fixtures__/BUCKETS.json";

export const FIXTURES: Record<string, unknown[]> = {
  [INGEST_TOTALS]: ingestTotals,
  [INGEST_TREND]: ingestTrend,
  [HOST_DRIVERS]: hostDrivers,
  [RETAIN_TOTALS]: retainTotals,
  [ENTITY_DRIVERS]: entityDrivers,
  [BUCKETS]: buckets,
};

export type DqlMode = "data" | "loading" | "error" | "empty" | "forbidden";

/** Builds a useDql mock that answers each query constant from the rkj7350h fixtures. */
export function dqlMock(mode: DqlMode | ((query: string) => DqlMode)) {
  return (params: { query: string }, options?: { enabled?: boolean }) => {
    const m = typeof mode === "function" ? mode(params.query) : mode;
    const base = { forceRefetch: jest.fn(), isLoading: false, error: null, data: undefined };
    if (options?.enabled === false) return base;
    if (m === "loading") return { ...base, isLoading: true };
    if (m === "error") return { ...base, error: new Error("Query budget exceeded") };
    if (m === "forbidden") return { ...base, error: new Error("Forbidden") };
    if (m === "empty") return { ...base, data: { records: [], types: [] } };
    return { ...base, data: { records: FIXTURES[params.query] ?? [], types: [] } };
  };
}

/** Lightweight stand-ins: Strato charts need canvas/layout APIs jsdom doesn't have. */
export const chartsMock = () => {
  const Stub = ({ children, "data-testid": id }: { children?: React.ReactNode; "data-testid"?: string }) => (
    <div data-testid={id}>{children}</div>
  );
  const SingleValue = ({ data, label, children }: { data: string; label?: string; children?: React.ReactNode }) => (
    <div>
      <span>{label}</span>
      <span>{data}</span>
      {children}
    </div>
  );
  SingleValue.Trend = ({ label }: { label?: string }) => <span>{label}</span>;
  const TimeseriesChart = (p: { children?: React.ReactNode }) => <Stub data-testid="timeseries">{p.children}</Stub>;
  TimeseriesChart.Bar = () => null;
  TimeseriesChart.Area = () => null;
  TimeseriesChart.YAxis = () => null;
  TimeseriesChart.Tooltip = () => null;
  const DonutChart = (p: { data: { category: string }[] }) => (
    <div data-testid="donut">{p.data.map((d) => d.category).join(",")}</div>
  );
  const CategoricalBarChart = (p: { data: { category: string }[] }) => (
    <div data-testid="bars">{p.data.map((d) => d.category).join(",")}</div>
  );
  return { SingleValue, TimeseriesChart, DonutChart, CategoricalBarChart };
};

/**
 * Strato's Select virtualises its option list, so jsdom renders no options. This swaps it for a
 * native <select> (role "combobox") with the same value/onChange contract; other form components stay real.
 */
export const formsWithNativeSelect = () => {
  const actual = jest.requireActual<typeof import("@dynatrace/strato-components/forms")>("@dynatrace/strato-components/forms");
  const Select = ({
    value,
    onChange,
    children,
  }: {
    value?: string | null;
    onChange?: (v: string | null) => void;
    children?: React.ReactNode;
  }) => (
    <select value={value ?? ""} onChange={(e) => onChange?.(e.target.value)}>
      {children}
    </select>
  );
  Select.Content = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  Select.Option = ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  );
  return { ...actual, Select };
};

/** The AppEngine web runtime that supplies user preferences isn't available in jsdom. */
export const userPreferencesMock = () => ({
  getLanguage: () => "en",
  getRegionalFormat: () => "en",
  getTheme: () => "light",
  getTimezone: () => "UTC",
});
