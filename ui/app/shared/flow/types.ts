export type FlowNodeKind = "source" | "pipeline" | "destination";
export type SourceType = "oneagent" | "api" | "extension" | "rum" | "internal" | "unknown" | "other";

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  label: string;
  configuration: string;
  /** Records over the window. */
  records: number;
  /** Records per second. */
  rate: number;
  /** Estimated bytes per second, null when no record size is known. */
  bytesRate: number | null;
  /** Records per interval, aligned with FlowGraph.start / intervalMs. */
  series: number[];
  sourceType?: SourceType;
  /** Raw source / pipeline id / bucket name behind the label. */
  raw?: string;
  /** Pipeline node: key into Topology.pipelines when known. */
  pipelineKey?: string;
  builtin?: boolean;
  bucket?: string;
  /** Configured in settings but there is no metric data for it (forwarding targets). */
  configuredOnly?: boolean;
  isOther?: boolean;
  collapsed?: string[];
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  configuration: string;
  routeName?: string;
  records: number;
  rate: number;
  bytesRate: number | null;
  /** True when pipeline → bucket records were split across pipelines by inflow share. */
  estimatedSplit: boolean;
  series: number[];
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  windowSeconds: number;
  start: Date;
  intervalMs: number;
}
