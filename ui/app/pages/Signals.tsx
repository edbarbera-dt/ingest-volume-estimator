import React, { useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { CategoricalBarChart } from "@dynatrace/strato-components/charts";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { FormField, Label, Select, Switch } from "@dynatrace/strato-components/forms";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Tab, Tabs } from "@dynatrace/strato-components/navigation";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { AppShell } from "../components/AppShell";
import { QueryState } from "../components/QueryState";
import { useTimeframe } from "../context/Timeframe";
import { useBreakdown } from "../hooks/useBreakdown";
import { useIngestTotals } from "../hooks/useIngestTotals";
import { useRateCard } from "../hooks/useRateCard";
import { BREAKDOWNS, type BreakdownDef } from "../queries/breakdown";
import type { BreakdownRow } from "../queries/parse";
import { scanEstimate, topWithShare } from "../shared/scanCost";
import { SIGNALS, SIGNAL_META, signalColor, type Signal } from "../shared/signals";
import { clampToLastHours } from "../shared/timeframe";
import { GIB, formatCurrency, formatNumber, formatPercent, formatVolume } from "../shared/units";

const RAW_SCOPE: Record<Signal, string> = {
  logs: "storage:logs:read",
  traces: "storage:spans:read",
  metrics: "storage:metrics:read",
  events: "storage:events:read",
};

const BYTE_MEASURES = new Set(["content bytes", "billed bytes"]);

function formatMeasure(def: BreakdownDef, value: number): string {
  return BYTE_MEASURES.has(def.measure) ? formatVolume(value / GIB, "GiB") : formatNumber(value);
}

const ResultView = ({ def, rows }: { def: BreakdownDef; rows: BreakdownRow[] }) => {
  const top = useMemo(() => topWithShare(rows, 10), [rows]);
  const bars = useMemo(
    () =>
      rows.slice(0, 10).map((r) => ({
        category: r.key,
        value: BYTE_MEASURES.has(def.measure) ? r.value / GIB : r.value,
        unit: BYTE_MEASURES.has(def.measure) ? "GiB" : def.measure,
      })),
    [rows, def.measure],
  );
  const columns = useMemo<DataTableColumnDef<BreakdownRow>[]>(
    () => [
      { id: "key", header: def.label, accessor: "key" },
      {
        id: "value",
        header: def.measure[0].toUpperCase() + def.measure.slice(1),
        accessor: "value",
        alignment: "right",
        cell: ({ value }) => <DataTable.DefaultCell>{formatMeasure(def, value as number)}</DataTable.DefaultCell>,
      },
      ...(rows.some((r) => r.records !== null)
        ? [
            {
              id: "records",
              header: "Records",
              accessor: "records",
              alignment: "right",
              cell: ({ value }: { value: unknown }) => (
                <DataTable.DefaultCell>{value === null ? "–" : formatNumber(value as number)}</DataTable.DefaultCell>
              ),
            } satisfies DataTableColumnDef<BreakdownRow>,
          ]
        : []),
      {
        id: "share",
        header: "Share",
        accessor: "share",
        alignment: "right",
        cell: ({ value }) => <DataTable.DefaultCell>{formatPercent(value as number)}</DataTable.DefaultCell>,
      },
    ],
    [def, rows],
  );
  return (
    <Flex flexDirection="column" gap={16}>
      <div data-testid="breakdown-chart">
        <CategoricalBarChart data={bars} colorPalette={[signalColor(def.signal)]} layout="horizontal" height={320}>
          <CategoricalBarChart.ValueAxis label={BYTE_MEASURES.has(def.measure) ? "GiB" : def.measure} />
        </CategoricalBarChart>
      </div>
      <DataTable data={top} columns={columns} sortable fullWidth />
    </Flex>
  );
};

const SignalBreakdown = ({ signal, billedGiBPerDay }: { signal: Signal; billedGiBPerDay: number }) => {
  const tf = useTimeframe();
  const { card } = useRateCard();
  const defs = useMemo(() => BREAKDOWNS.filter((b) => b.signal === signal), [signal]);
  const [defId, setDefId] = useState(defs[0].id);
  const [fullTimeframe, setFullTimeframe] = useState(false);
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const window = useMemo(() => (fullTimeframe ? tf : clampToLastHours(tf, 24)), [fullTimeframe, tf]);
  const scan = scanEstimate(def, billedGiBPerDay, window.days, card.currency);
  const breakdown = useBreakdown(def, window);
  const scopes = def.source === "billing" ? ["storage:system:read"] : [RAW_SCOPE[signal]];

  return (
    <Flex flexDirection="column" gap={16} paddingTop={16}>
      <Flex gap={16} alignItems="flex-end" flexWrap="wrap">
        <FormField>
          <Label>Break down by</Label>
          <Select value={def.id} onChange={(v) => v && setDefId(String(v))}>
            <Select.Content>
              {defs.map((d) => (
                <Select.Option key={d.id} value={d.id}>
                  {d.label}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </FormField>
        <Switch value={fullTimeframe} onChange={setFullTimeframe}>
          Use the full timeframe (default: last 24 hours)
        </Switch>
        <Button variant="emphasized" onClick={breakdown.run} loading={breakdown.isLoading}>
          Run breakdown
        </Button>
      </Flex>

      <Text data-testid="scan-hint">
        Scan estimate for {formatNumber(window.days * 24)} h of {SIGNAL_META[signal].label.toLowerCase()}:{" "}
        {scan.scannedGiB === null
          ? scan.note
          : `≈ ${formatVolume(scan.scannedGiB, "GiB")} scanned, ≈ ${formatCurrency(scan.cost, card.currency)}. ${scan.note}`}
      </Text>

      {def.measure === "content bytes" && (
        <MessageContainer variant="neutral">
          <MessageContainer.Description>
            Content bytes are smaller than billed bytes, because billing also counts attributes. Use the shares, not the
            absolute sizes, to compare contributors.
          </MessageContainer.Description>
        </MessageContainer>
      )}

      {breakdown.hasRun ? (
        <QueryState
          isLoading={breakdown.isLoading}
          error={breakdown.error}
          onRetry={breakdown.run}
          scopes={scopes}
          isEmpty={!!breakdown.data && breakdown.data.length === 0}
          emptyTitle={`No ${SIGNAL_META[signal].label.toLowerCase()} available.`}
        >
          {breakdown.data && <ResultView def={def} rows={breakdown.data} />}
        </QueryState>
      ) : (
        <Paragraph>Choose a dimension and select Run breakdown. Nothing is queried until then.</Paragraph>
      )}
    </Flex>
  );
};

export const Signals = () => {
  const tf = useTimeframe();
  const totals = useIngestTotals();
  return (
    <AppShell title="Signals" subtitle="Top contributors per signal (tier-3 breakdown, runs on demand)">
      <Surface elevation="raised">
        <Flex flexDirection="column" padding={16}>
          <Heading level={5}>Breakdown</Heading>
          <Tabs>
            {SIGNALS.map((s) => (
              <Tab key={s} title={SIGNAL_META[s].label}>
                <SignalBreakdown
                  signal={s}
                  billedGiBPerDay={totals.data && tf.days > 0 ? totals.data.bySignal[s].bytes / GIB / tf.days : 0}
                />
              </Tab>
            ))}
          </Tabs>
        </Flex>
      </Surface>
    </AppShell>
  );
};
