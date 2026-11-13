import Colors from "@dynatrace/strato-design-tokens/colors";

export type Signal = "logs" | "traces" | "metrics" | "events";
export type VolumeUnit = "GiB" | "data points";
export type Driver = "hosts" | "services" | "pods" | "clusters" | "containers";
export type BillingKind = "ingest" | "retain";

export const SIGNALS: readonly Signal[] = ["logs", "traces", "metrics", "events"];

export interface SignalMeta {
  label: string;
  unit: VolumeUnit;
  /** Prefix of the BILLING_USAGE_EVENT event.type, before " - Ingest & Process" / " - Retain". */
  billingPrefix: string;
  defaultDriver: Driver;
}

export const SIGNAL_META: Record<Signal, SignalMeta> = {
  logs: {
    label: "Logs",
    unit: "GiB",
    billingPrefix: "Log Management & Analytics",
    defaultDriver: "hosts",
  },
  traces: {
    label: "Traces",
    unit: "GiB",
    billingPrefix: "Traces",
    defaultDriver: "services",
  },
  metrics: {
    label: "Metrics",
    unit: "data points",
    billingPrefix: "Metrics",
    defaultDriver: "hosts",
  },
  events: {
    label: "Events",
    unit: "GiB",
    billingPrefix: "Events",
    defaultDriver: "hosts",
  },
};

export const DRIVERS: readonly Driver[] = ["hosts", "services", "pods", "clusters", "containers"];

export const DRIVER_LABELS: Record<Driver, string> = {
  hosts: "Hosts",
  services: "Services",
  pods: "K8s pods",
  clusters: "K8s clusters",
  containers: "Containers",
};

const KIND_SUFFIX: Record<string, BillingKind> = {
  "Ingest & Process": "ingest",
  Retain: "retain",
};

/** Maps a billing event.type such as "Traces - Ingest & Process" to its signal and kind. */
export function parseBillingEventType(
  eventType: string,
): { signal: Signal; kind: BillingKind } | null {
  if (typeof eventType !== "string") return null;
  const idx = eventType.lastIndexOf(" - ");
  if (idx < 0) return null;
  const prefix = eventType.slice(0, idx);
  const kind = KIND_SUFFIX[eventType.slice(idx + 3)];
  if (!kind) return null;
  const signal = SIGNALS.find((s) => SIGNAL_META[s].billingPrefix === prefix);
  return signal ? { signal, kind } : null;
}

/** One fixed Strato categorical colour per signal, used on every screen. */
const SIGNAL_COLORS: Record<Signal, string> = {
  logs: Colors.Charts.Categorical.Color01.Default,
  traces: Colors.Charts.Categorical.Color03.Default,
  metrics: Colors.Charts.Categorical.Color08.Default,
  events: Colors.Charts.Categorical.Color06.Default,
};

export function signalColor(signal: Signal): string {
  return SIGNAL_COLORS[signal];
}
