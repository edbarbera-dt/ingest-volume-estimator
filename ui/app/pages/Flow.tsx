import React, { useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Tab, Tabs } from "@dynatrace/strato-components/navigation";
import { Paragraph, Text } from "@dynatrace/strato-components/typography";
import { RefreshIcon } from "@dynatrace/strato-icons";
import { AppShell } from "../components/AppShell";
import { QueryState } from "../components/QueryState";
import { FlowCanvas } from "../components/flow/FlowCanvas";
import { NodeSheet } from "../components/flow/NodeSheet";
import { useBuckets } from "../hooks/useBuckets";
import { useDrivers } from "../hooks/useDrivers";
import { useFlowGraph } from "../hooks/useFlowGraph";
import type { FlowMode } from "../shared/flow/format";
import { FLOW_WINDOWS, type FlowWindow } from "../shared/flow/rates";
import type { FlowGraph } from "../shared/flow/types";
import { SIGNAL_META, signalColor, type Signal } from "../shared/signals";
import { formatNumber } from "../shared/units";

const TAB_LABEL: Record<Signal, string> = { logs: "LOGS", metrics: "METRICS", traces: "TRACES", events: "EVENTS" };
const TAB_ORDER: Signal[] = ["logs", "metrics", "traces", "events"];

export function nodeBadges(
  graph: FlowGraph,
  hosts: number | undefined,
  retention: Map<string, number>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind === "source" && n.sourceType === "oneagent" && hosts) out.set(n.id, `${formatNumber(hosts)} hosts`);
    if (n.kind === "destination" && n.bucket && retention.has(n.bucket)) out.set(n.id, `${retention.get(n.bucket)} d`);
  }
  return out;
}

const FlowView = ({ signal, window, mode }: { signal: Signal; window: FlowWindow; mode: FlowMode }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const flow = useFlowGraph(signal, window);
  const drivers = useDrivers();
  const buckets = useBuckets();
  const retention = useMemo(
    () => new Map((buckets.data ?? []).map((b) => [b.name, b.retentionDays])),
    [buckets.data],
  );
  const badges = useMemo(
    () => (flow.graph ? nodeBadges(flow.graph, drivers.data?.counts.hosts, retention) : new Map<string, string>()),
    [flow.graph, drivers.data, retention],
  );
  const effectiveMode: FlowMode = signal === "metrics" ? "records" : mode;

  return (
    <Flex flexDirection="column" gap={12} paddingTop={12}>
      {flow.missingSettingsScope && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>You'll need some additional permissions to show pipeline names</MessageContainer.Title>
          <MessageContainer.Description>
            Missing permission: settings:objects:read. The flow is drawn from metrics only, with raw route and pipeline ids.
          </MessageContainer.Description>
        </MessageContainer>
      )}
      {signal === "metrics" && (
        <Paragraph>Metrics are billed by data points, so this tab always shows records per second.</Paragraph>
      )}
      <QueryState
        isLoading={flow.isLoading}
        error={flow.error}
        onRetry={flow.refetch}
        scopes={["storage:metrics:read"]}
        isEmpty={!!flow.graph && flow.graph.nodes.length === 0}
        emptyTitle={`No ${SIGNAL_META[signal].label.toLowerCase()} traffic in this window.`}
        emptyDetails="OpenPipeline self-monitoring metrics can take a few minutes to arrive. Try a longer window."
      >
        {flow.graph && (
          <FlowCanvas
            graph={flow.graph}
            mode={effectiveMode}
            color={signalColor(signal)}
            badges={badges}
            onSelect={setSelected}
          />
        )}
      </QueryState>
      {selected && flow.graph && (
        <NodeSheet
          graph={flow.graph}
          nodeId={selected}
          topology={flow.topology}
          window={window}
          mode={effectiveMode}
          color={signalColor(signal)}
          billing24h={flow.data?.billing24h}
          retention={retention}
          onClose={() => setSelected(null)}
        />
      )}
    </Flex>
  );
};

export const Flow = () => {
  const [tab, setTab] = useState(0);
  const [window, setWindow] = useState<FlowWindow>("1h");
  const [mode, setMode] = useState<FlowMode>("bytes");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AppShell
      title="Flow"
      subtitle="OpenPipeline: sources → pipelines → destinations"
      showTimeframe={false}
      actions={
        <Flex gap={8} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup name="flow-window" value={window} onChange={(v: string) => setWindow(v in FLOW_WINDOWS ? (v as FlowWindow) : "1h")}>
            <ToggleButtonGroup.Item value="5m">5m</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="1h">1h</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="24h">24h</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
          <ToggleButtonGroup name="flow-mode" value={mode} onChange={(v: string) => setMode(v === "records" ? "records" : "bytes")}>
            <ToggleButtonGroup.Item value="bytes">~GiB/s</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="records">records/s</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
          <Button aria-label="Refresh" onClick={() => setRefreshKey((k) => k + 1)}>
            <Button.Prefix>
              <RefreshIcon />
            </Button.Prefix>
            Refresh
          </Button>
        </Flex>
      }
    >
      <Surface elevation="raised">
        <Flex flexDirection="column" padding={16} gap={8}>
          <Tabs selectedIndex={tab} onChange={setTab}>
            {TAB_ORDER.map((s, i) => (
              <Tab key={s} title={TAB_LABEL[s]}>
                {i === tab ? (
                  <FlowView
                    key={`${s}-${refreshKey}`}
                    signal={s}
                    window={window}
                    mode={mode}
                  />
                ) : null}
              </Tab>
            ))}
          </Tabs>
          <Text>
            {FLOW_WINDOWS[window].label}. Rates are records in the window ÷ window seconds. Values with "~" are
            estimates: records/s × the destination bucket's average billed bytes per record over the last 24 hours.
            Dashed paths split one bucket's output across several pipelines by their inflow share.
          </Text>
        </Flex>
      </Surface>
    </AppShell>
  );
};

