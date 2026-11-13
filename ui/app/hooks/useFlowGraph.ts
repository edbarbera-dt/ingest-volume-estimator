import { useMemo } from "react";
import { avgRecordSizes } from "../shared/flow/bytesEstimate";
import { buildFlowGraph } from "../shared/flow/graph";
import { FLOW_WINDOWS, type FlowWindow } from "../shared/flow/rates";
import type { Signal } from "../shared/signals";
import { useFlowMetrics } from "./useFlowMetrics";
import { useFlowTopology } from "./useFlowTopology";

export function useFlowGraph(signal: Signal, window: FlowWindow) {
  const metrics = useFlowMetrics(window);
  const topo = useFlowTopology(signal);
  const sizes = useMemo(
    () => (metrics.data ? avgRecordSizes(metrics.data.billing24h, metrics.data.out24h) : new Map<string, number>()),
    [metrics.data],
  );
  const graph = useMemo(
    () =>
      metrics.data
        ? buildFlowGraph({
            signal,
            sources: metrics.data.sources,
            routing: metrics.data.routing,
            out: metrics.data.out,
            topology: topo.topology,
            recordSizes: sizes,
            windowSeconds: FLOW_WINDOWS[window].seconds,
          })
        : undefined,
    [metrics.data, signal, topo.topology, sizes, window],
  );
  return { ...metrics, graph, topology: topo.topology, missingSettingsScope: topo.missingScope, topologyLoading: topo.isLoading };
}
