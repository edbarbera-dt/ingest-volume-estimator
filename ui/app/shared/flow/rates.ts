import { toNumber } from "../units";

export type FlowWindow = "5m" | "1h" | "24h";

export const FLOW_WINDOWS: Record<FlowWindow, { seconds: number; interval: string; label: string }> = {
  "5m": { seconds: 300, interval: "1m", label: "Last 5 minutes" },
  "1h": { seconds: 3600, interval: "1m", label: "Last hour" },
  "24h": { seconds: 86400, interval: "15m", label: "Last 24 hours" },
};

/** Sum of a DQL timeseries array (or a scalar). Nulls, NaN and junk count as 0. */
export function sumSeries(values: unknown): number {
  if (Array.isArray(values)) return values.reduce<number>((a, v) => a + toNumber(v), 0);
  return toNumber(values);
}

export function toSeries(values: unknown): number[] {
  return Array.isArray(values) ? values.map(toNumber) : [];
}

export function ratePerSecond(sum: number, windowSeconds: number): number {
  if (!Number.isFinite(sum) || !Number.isFinite(windowSeconds) || windowSeconds <= 0) return 0;
  return sum / windowSeconds;
}

export function addSeries(a: number[], b: number[]): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

export function scaleSeries(a: number[], factor: number): number[] {
  return a.map((v) => v * factor);
}
