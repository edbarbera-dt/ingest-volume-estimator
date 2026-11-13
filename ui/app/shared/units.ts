import type { VolumeUnit } from "./signals";

export const GIB = 1024 ** 3;

const isValid = (n: number) => Number.isFinite(n) && n >= 0;

export function bytesToGiB(bytes: number): number {
  return isValid(bytes) ? bytes / GIB : 0;
}

export function gibToBytes(gib: number): number {
  return isValid(gib) ? gib * GIB : 0;
}

/** DQL returns longs as strings; coerce anything to a finite number (0 otherwise). */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const DASH = "–";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return compact.format(n);
}

const twoDigits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Formats a volume in the signal's unit. GiB values below 1 are shown as MiB/KiB. */
export function formatVolume(value: number | null | undefined, unit: VolumeUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (unit === "data points") return `${formatNumber(value)} data points`;
  const abs = Math.abs(value);
  if (abs >= 1 || abs === 0) return `${twoDigits.format(value)} GiB`;
  if (abs * 1024 >= 1) return `${twoDigits.format(value * 1024)} MiB`;
  return `${twoDigits.format(value * 1024 * 1024)} KiB`;
}

export function formatCurrency(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return DASH;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return DASH;
  return `${(ratio * 100).toFixed(1)}%`;
}
