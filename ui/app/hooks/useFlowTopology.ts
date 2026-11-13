import { useEffect, useState } from "react";
import { emptyTopology } from "../shared/flow/topology";
import type { Signal } from "../shared/signals";
import { fetchTopology, type TopologyResult } from "./fetchTopology";

const cache = new Map<Signal, Promise<TopologyResult>>();

/** OpenPipeline topology for a signal tab, cached per session. Falls back to an empty topology. */
export function useFlowTopology(signal: Signal) {
  const [state, setState] = useState<{ signal: Signal; result: TopologyResult } | null>(null);

  useEffect(() => {
    let alive = true;
    let p = cache.get(signal);
    if (!p) {
      p = fetchTopology(signal).catch(() => ({ topology: emptyTopology(), missingScope: false }));
      cache.set(signal, p);
    }
    void p.then((result) => {
      if (alive) setState({ signal, result });
    });
    return () => {
      alive = false;
    };
  }, [signal]);

  const current = state?.signal === signal ? state.result : null;
  return {
    topology: current?.topology ?? emptyTopology(),
    missingScope: current?.missingScope ?? false,
    isLoading: current === null,
  };
}

/** For tests. */
export function clearTopologyCache() {
  cache.clear();
}
