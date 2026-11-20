import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@dynatrace/strato-components/buttons";
import { TimeseriesChart } from "@dynatrace/strato-components/charts";
import { Chip, MessageContainer } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Code, Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { billedBytesByBucket, flattenConfig, nodeTimeseries } from "../../shared/flow/detail";
import { edgeLabel, type FlowMode } from "../../shared/flow/format";
import { FLOW_WINDOWS, type FlowWindow } from "../../shared/flow/rates";
import { pipelineProcessors, routesForPipeline, type ProcessorInfo, type RouteInfo, type Topology } from "../../shared/flow/topology";
import type { FlowGraph, FlowNode } from "../../shared/flow/types";
import { formatVolume, GIB } from "../../shared/units";

const KIND_LABEL: Record<FlowNode["kind"], string> = { source: "Source", pipeline: "Pipeline", destination: "Destination" };

const processorColumns: DataTableColumnDef<ProcessorInfo>[] = [
  { id: "stage", header: "Stage", accessor: "stage" },
  { id: "type", header: "Type", accessor: "type" },
  { id: "description", header: "Description", accessor: "description" },
  { id: "enabled", header: "Enabled", accessor: (p) => (p.enabled ? "yes" : "no") },
  { id: "matcher", header: "Matcher", accessor: "matcher" },
];

const routeColumns: DataTableColumnDef<RouteInfo>[] = [
  { id: "description", header: "Route", accessor: "description" },
  { id: "enabled", header: "Enabled", accessor: (r) => (r.enabled ? "yes" : "no") },
  { id: "matcher", header: "Matcher", accessor: "matcher" },
];

export interface NodeSheetProps {
  graph: FlowGraph;
  nodeId: string;
  topology: Topology;
  window: FlowWindow;
  mode: FlowMode;
  color: string;
  billing24h: unknown;
  retention: Map<string, number>;
  onClose: () => void;
}

export const NodeSheet = ({ graph, nodeId, topology, window, mode, color, billing24h, retention, onClose }: NodeSheetProps) => {
  const navigate = useNavigate();
  const node = graph.nodes.find((n) => n.id === nodeId);
  const billed = useMemo(() => billedBytesByBucket(billing24h), [billing24h]);
  const ts = useMemo(() => (node ? nodeTimeseries(graph, node, mode) : null), [graph, node, mode]);
  if (!node || !ts) return null;

  const unit = mode === "bytes" && node.bytesRate !== null ? "~bytes/s" : "rec/s";
  const pipeline = node.pipelineKey ? topology.pipelines.get(node.pipelineKey) : undefined;
  const processors = pipeline ? pipelineProcessors(pipeline) : [];
  const routes = node.kind === "pipeline" ? routesForPipeline(topology, node.id) : [];
  const forwarding = node.configuredOnly ? topology.forwarding.find((f) => f.key === node.id) : undefined;
  const ingestSource = node.kind === "source" ? topology.ingestSources.find((s) => s.source === node.raw) : undefined;

  return (
    <Sheet title={node.label} show onDismiss={onClose} actions={<Button onClick={onClose}>Close</Button>}>
      <Flex flexDirection="column" gap={16}>
        <Flex gap={8} alignItems="center" flexWrap="wrap">
          <Chip size="condensed">{KIND_LABEL[node.kind]}</Chip>
          <Chip size="condensed">{node.configuration}</Chip>
          {node.raw && node.raw !== node.label && <Code>{node.raw}</Code>}
        </Flex>

        {!node.configuredOnly && (
          <Flex flexDirection="column" gap={4}>
            <Heading level={6}>
              Throughput, {FLOW_WINDOWS[window].label.toLowerCase()} ({edgeLabel(node, mode)} average)
            </Heading>
            <TimeseriesChart variant="area" height={200}>
              <TimeseriesChart.Area data={{ ...ts, unit }} color={color} />
              <TimeseriesChart.YAxis label={unit} />
            </TimeseriesChart>
          </Flex>
        )}

        {node.kind === "pipeline" && (
          <Flex flexDirection="column" gap={8}>
            {!pipeline && (
              <Paragraph>
                {node.builtin ? "Built-in pipeline: no custom processors." : "Pipeline not found in settings; showing the raw id."}
              </Paragraph>
            )}
            {pipeline && (
              <>
                <Heading level={6}>Processors ({processors.length})</Heading>
                <DataTable data={processors} columns={processorColumns} fullWidth />
                {pipeline.buckets.length > 0 && <Text>Bucket assignments: {pipeline.buckets.join(", ")}</Text>}
              </>
            )}
            {routes.length > 0 && (
              <>
                <Heading level={6}>Routes into this pipeline</Heading>
                <DataTable data={routes} columns={routeColumns} fullWidth />
              </>
            )}
          </Flex>
        )}

        {node.kind === "destination" && !node.configuredOnly && (
          <Flex flexDirection="column" gap={8}>
            {node.bucket ? (
              <>
                <Text>
                  Billed bytes (last 24 h):{" "}
                  {billed.has(node.bucket) ? formatVolume((billed.get(node.bucket) ?? 0) / GIB, "GiB") : "not billed by bytes"}
                </Text>
                <Text>Retention: {retention.has(node.bucket) ? `${retention.get(node.bucket)} days` : "unknown"}</Text>
                <Flex>
                  <Button onClick={() => void navigate("/")}>Open in Overview</Button>
                </Flex>
              </>
            ) : (
              <Paragraph>These records are processed but not stored in a bucket.</Paragraph>
            )}
          </Flex>
        )}

        {forwarding && (
          <Flex flexDirection="column" gap={8}>
            <MessageContainer variant="neutral">
              <MessageContainer.Description>Configured, no throughput data in the self-monitoring metrics.</MessageContainer.Description>
            </MessageContainer>
            {flattenConfig(forwarding.summary).map((r) => (
              <Text key={r.key}>
                {r.key}: {r.value}
              </Text>
            ))}
          </Flex>
        )}

        {node.isOther && node.collapsed && (
          <Paragraph>Combined sources: {node.collapsed.map((id) => id.split(":").slice(2).join(":")).join(", ")}</Paragraph>
        )}
        {ingestSource && (
          <Paragraph>
            Ingest source "{ingestSource.name}" ({ingestSource.source})
            {ingestSource.pipelineKey ? ` routes statically to ${topology.pipelines.get(ingestSource.pipelineKey)?.name ?? ingestSource.pipelineKey}` : ""}.
          </Paragraph>
        )}
      </Flex>
    </Sheet>
  );
};
