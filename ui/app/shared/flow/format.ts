export type FlowMode = "bytes" | "records";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const small = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const medium = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatRecordsRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0 rec/s";
  if (rate < 0.01) return "<0.01 rec/s";
  if (rate >= 1000) return `${compact.format(rate)} rec/s`;
  return `${(rate < 1 ? small : medium).format(rate)} rec/s`;
}

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

/** Estimated bytes per second, always prefixed with "~". */
export function formatBytesRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond)) return "–";
  let v = Math.max(0, bytesPerSecond);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `~${small.format(v)} ${UNITS[i]}/s`;
}

/** Edge / node label for the current mode. Bytes mode falls back to rec/s when no size is known. */
export function edgeLabel(x: { rate: number; bytesRate: number | null }, mode: FlowMode): string {
  return mode === "bytes" && x.bytesRate !== null ? formatBytesRate(x.bytesRate) : formatRecordsRate(x.rate);
}
