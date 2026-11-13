import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { Text, TextEllipsis } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { edgeLabel, type FlowMode } from "../../shared/flow/format";
import { connectedIds } from "../../shared/flow/highlight";
import { layoutFlow } from "../../shared/flow/layout";
import type { FlowEdge, FlowGraph, FlowNode } from "../../shared/flow/types";
import { NodeIcon } from "./icons";

const HIGHLIGHT = Colors.Border.Primary.Accent;
const IDLE = Colors.Border.Neutral.Default;
const LABEL_W = 116;
const LABEL_H = 24;

function useContainerWidth(fallback = 1000) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function edgeTooltip(e: FlowEdge, mode: FlowMode): string {
  const parts = [`${edgeLabel(e, "records")}`];
  if (mode === "bytes" && e.bytesRate !== null) parts.unshift(edgeLabel(e, "bytes"));
  if (e.routeName) parts.push(`Route: ${e.routeName}`);
  if (e.estimatedSplit) parts.push("Split across pipelines by inflow share (estimate)");
  if (mode === "bytes" && e.bytesRate === null) parts.push("No record size known for this bucket; showing records/s");
  return parts.join(" · ");
}

const NodeCard = ({
  node,
  mode,
  badge,
  color,
  onSelect,
}: {
  node: FlowNode;
  mode: FlowMode;
  badge?: string;
  color: string;
  onSelect: (id: string) => void;
}) => {
  const idle = !node.configuredOnly && node.rate === 0;
  const muted = idle || node.configuredOnly;
  return (
    <Surface
      elevation="raised"
      role="button"
      tabIndex={0}
      aria-label={`${node.label}, ${node.configuredOnly ? "configured, no throughput data" : edgeLabel(node, mode)}`}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") onSelect(node.id);
      }}
      style={{
        height: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
        borderLeft: `4px solid ${muted ? IDLE : color}`,
        ...(node.configuredOnly ? { outline: `1px dashed ${IDLE}`, outlineOffset: -1 } : {}),
      }}
    >
      <Flex gap={8} padding={8} alignItems="center" style={{ height: "100%", boxSizing: "border-box" }}>
        <span style={{ color: muted ? Colors.Text.Neutral.Disabled : color, display: "flex" }}>
          <NodeIcon node={node} />
        </span>
        <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: 1 }}>
          <TextEllipsis>{node.label}</TextEllipsis>
          <Text style={{ color: muted ? Colors.Text.Neutral.Disabled : Colors.Text.Neutral.Subdued }}>
            {node.configuredOnly ? "configured, no throughput data" : idle ? "0" : edgeLabel(node, mode)}
          </Text>
        </Flex>
        {badge && (
          <Chip size="condensed" color="neutral">
            {badge}
          </Chip>
        )}
      </Flex>
    </Surface>
  );
};

export interface FlowCanvasProps {
  graph: FlowGraph;
  mode: FlowMode;
  color: string;
  badges?: Map<string, string>;
  onSelect: (nodeId: string) => void;
}

/** Sources → Pipelines → Destinations, drawn as Strato cards joined by curved, throughput-scaled paths. */
export const FlowCanvas = ({ graph, mode, color, badges, onSelect }: FlowCanvasProps) => {
  const { ref, width } = useContainerWidth();
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => layoutFlow(graph, { width, mode }), [graph, width, mode]);
  const lit = useMemo(() => connectedIds(graph, hover), [graph, hover]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const edgeById = useMemo(() => new Map(graph.edges.map((e) => [e.id, e])), [graph]);
  const animate = !prefersReducedMotion();

  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }} data-testid="flow-canvas">
      <svg width={layout.width} height={layout.height} role="img" aria-label="OpenPipeline flow from sources through pipelines to destinations">
        <g>
          {layout.edges.map((le) => {
            const e = edgeById.get(le.id) as FlowEdge;
            const dim = hover !== null && !lit.edges.has(le.id);
            return (
              <path
                key={le.id}
                d={le.path}
                fill="none"
                stroke={e.rate === 0 ? IDLE : color}
                strokeWidth={le.width}
                strokeOpacity={dim ? 0.12 : e.rate === 0 ? 0.6 : 0.45}
                strokeDasharray={e.estimatedSplit ? "6 4" : undefined}
                data-testid="flow-edge"
                data-dimmed={dim ? "true" : "false"}
              />
            );
          })}
          {hover !== null &&
            layout.edges
              .filter((le) => lit.edges.has(le.id))
              .map((le) => (
                <path
                  key={`hl-${le.id}`}
                  d={le.path}
                  fill="none"
                  stroke={HIGHLIGHT}
                  strokeWidth={Math.max(2, Math.min(le.width, 4))}
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  data-testid="flow-edge-highlight"
                  pointerEvents="none"
                >
                  {animate && <animate attributeName="stroke-dashoffset" from="28" to="0" dur="0.8s" repeatCount="indefinite" />}
                </path>
              ))}
        </g>
        <g>
          {layout.edges.map((le) => {
            const e = edgeById.get(le.id) as FlowEdge;
            if (hover !== null && !lit.edges.has(le.id)) return null;
            return (
              <foreignObject key={`lbl-${le.id}`} x={le.labelX - LABEL_W / 2} y={le.labelY - LABEL_H / 2} width={LABEL_W} height={LABEL_H}>
                <Flex justifyContent="center">
                  <Tooltip text={edgeTooltip(e, mode)}>
                    <Button size="condensed" onClick={() => onSelect(e.to)} aria-label={edgeTooltip(e, mode)}>
                      {edgeLabel(e, mode)}
                    </Button>
                  </Tooltip>
                </Flex>
              </foreignObject>
            );
          })}
        </g>
        <g>
          {layout.nodes.map((ln) => {
            const node = byId.get(ln.id) as FlowNode;
            const dim = hover !== null && !lit.nodes.has(ln.id);
            return (
              <foreignObject
                key={ln.id}
                x={ln.x}
                y={ln.y}
                width={ln.w}
                height={ln.h}
                opacity={dim ? 0.35 : 1}
                onMouseEnter={() => setHover(ln.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(ln.id)}
                onBlur={() => setHover(null)}
                data-testid={`flow-node-${node.kind}`}
              >
                <NodeCard node={node} mode={mode} badge={badges?.get(ln.id)} color={color} onSelect={onSelect} />
              </foreignObject>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
