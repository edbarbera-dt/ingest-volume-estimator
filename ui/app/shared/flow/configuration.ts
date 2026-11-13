import type { Signal } from "../signals";

/** OpenPipeline configurations shown on each signal tab. */
const CONFIGURATIONS: Record<Signal, readonly string[]> = {
  logs: ["logs"],
  metrics: ["metrics"],
  traces: ["spans"],
  events: ["events", "bizevents", "system.events", "security.events", "sdlc.events", "davis.events", "davis.problems"],
};

export function configurationSignal(configuration: string): Signal | null {
  for (const [signal, cfgs] of Object.entries(CONFIGURATIONS) as [Signal, readonly string[]][]) {
    if (cfgs.includes(configuration)) return signal;
  }
  return null;
}

export function configurationsFor(signal: Signal): readonly string[] {
  return CONFIGURATIONS[signal];
}
