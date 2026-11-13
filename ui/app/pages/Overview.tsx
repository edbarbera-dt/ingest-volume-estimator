import React, { useMemo, useState } from "react";
import { DonutChart, TimeseriesChart } from "@dynatrace/strato-components/charts";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, List, Paragraph } from "@dynatrace/strato-components/typography";
import { AppShell } from "../components/AppShell";
import { EstimateChip } from "../components/EstimateChip";
import { QueryState } from "../components/QueryState";
import { SignalCard } from "../components/SignalCard";
import { useTimeframe } from "../context/Timeframe";
import { useBaselines } from "../hooks/useBaselines";
import { useBuckets } from "../hooks/useBuckets";
import { useIngestTotals, useRetainTotals } from "../hooks/useIngestTotals";
import { useIngestTrend } from "../hooks/useIngestTrend";
import { useRateCard } from "../hooks/useRateCard";
import { changeFromBaseline } from "../shared/baselines";
import {
  bucketRows,
  costShare,
  signalSummaries,
  trendToTimeseries,
  type BucketTableRow,
  type TrendMode,
} from "../shared/overview";
import { SIGNALS, SIGNAL_META } from "../shared/signals";
import { formatCurrency, formatVolume } from "../shared/units";

const BILLING_SCOPES = ["storage:system:read"];

export const KnownGaps = () => (
  <MessageContainer variant="neutral">
    <MessageContainer.Title>About these numbers</MessageContainer.Title>
    <MessageContainer.Description>
      <List>
        <span>Volumes come from billing usage events (15-minute granularity). Metrics usage arrives about 4 hours late.</span>
        <span>Logs and traces billing is split by bucket only; use Signals for a finer breakdown.</span>
        <span>
          Costs use the rate card in Settings. Full-Stack hosts include a trace and custom-metric allowance, so actual
          trace and metric cost can be lower.
        </span>
      </List>
    </MessageContainer.Description>
  </MessageContainer>
);

export const Overview = () => {
  const tf = useTimeframe();
  const totals = useIngestTotals();
  const retain = useRetainTotals();
  const trend = useIngestTrend();
  const buckets = useBuckets();
  const { card } = useRateCard();
  const { active } = useBaselines();
  const [mode, setMode] = useState<TrendMode>("volume");

  const summaries = useMemo(
    () => (totals.data ? signalSummaries(totals.data.bySignal, retain.data ?? [], tf.days, card) : undefined),
    [totals.data, retain.data, tf.days, card],
  );
  const isEmpty = !!summaries && SIGNALS.every((s) => summaries[s].volume === 0);

  const series = useMemo(
    () => (trend.data ? trendToTimeseries(trend.data, mode, card) : []),
    [trend.data, mode, card],
  );
  const slices = useMemo(() => (summaries ? costShare(summaries) : []), [summaries]);
  const tableRows = useMemo(
    () =>
      totals.data ? bucketRows(totals.data.rows, buckets.data ?? [], retain.data ?? [], tf.days, card) : [],
    [totals.data, buckets.data, retain.data, tf.days, card],
  );

  const columns = useMemo<DataTableColumnDef<BucketTableRow>[]>(
    () => [
      { id: "displayName", header: "Bucket", accessor: "displayName" },
      { id: "bucket", header: "Name", accessor: "bucket" },
      { id: "signal", header: "Signal", accessor: (r) => SIGNAL_META[r.signal].label },
      {
        id: "volume",
        header: "Ingested",
        accessor: "volume",
        alignment: "right",
        cell: ({ value, rowData }) => (
          <DataTable.DefaultCell>{formatVolume(value as number, SIGNAL_META[rowData.signal].unit)}</DataTable.DefaultCell>
        ),
      },
      {
        id: "retentionDays",
        header: "Retention (days)",
        accessor: (r) => r.retentionDays ?? "–",
        alignment: "right",
      },
      {
        id: "storedGiB",
        header: "Stored (avg)",
        accessor: "storedGiB",
        alignment: "right",
        cell: ({ value }) => (
          <DataTable.DefaultCell>{value === null ? "–" : formatVolume(value as number, "GiB")}</DataTable.DefaultCell>
        ),
      },
      {
        id: "cost",
        header: `Est. cost (${card.currency})`,
        accessor: "cost",
        alignment: "right",
        cell: ({ value }) => <DataTable.DefaultCell>{formatCurrency(value as number, card.currency)}</DataTable.DefaultCell>,
      },
    ],
    [card.currency],
  );

  const totalCost = summaries ? SIGNALS.reduce((a, s) => a + summaries[s].cost, 0) : 0;

  return (
    <AppShell
      title="Overview"
      subtitle={summaries ? `Estimated cost for this timeframe: ${formatCurrency(totalCost, card.currency)}` : undefined}
      actions={<EstimateChip />}
    >
      <QueryState
        isLoading={totals.isLoading}
        error={totals.error}
        onRetry={totals.refetch}
        scopes={BILLING_SCOPES}
        isEmpty={isEmpty}
        emptyTitle="No billing data yet"
        emptyDetails="Billing usage events arrive every 15 minutes; metrics usage can take about 4 hours. Try a longer timeframe or check back later."
      >
        {summaries && (
          <Flex flexDirection="column" gap={16}>
            <Grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={16}>
              {SIGNALS.map((s) => (
                <SignalCard
                  key={s}
                  signal={s}
                  volume={summaries[s].volume}
                  perDay={summaries[s].perDay}
                  cost={summaries[s].cost}
                  currency={card.currency}
                  change={changeFromBaseline(summaries[s].perDay, active, s)}
                  baselineLabel={active?.label}
                />
              ))}
            </Grid>

            <Grid gridTemplateColumns="repeat(auto-fit, minmax(360px, 1fr))" gap={16}>
              <Surface elevation="raised">
                <Flex flexDirection="column" gap={8} padding={16}>
                  <Flex justifyContent="space-between" alignItems="center">
                    <Heading level={5}>Daily ingest by signal</Heading>
                    <ToggleButtonGroup
                      name="trend-mode"
                      value={mode}
                      onChange={(v: string) => setMode(v === "cost" ? "cost" : "volume")}
                    >
                      <ToggleButtonGroup.Item value="volume">Volume (GiB)</ToggleButtonGroup.Item>
                      <ToggleButtonGroup.Item value="cost">Cost</ToggleButtonGroup.Item>
                    </ToggleButtonGroup>
                  </Flex>
                  {mode === "volume" && (
                    <Paragraph>Metrics are counted in data points and are shown in cost mode only.</Paragraph>
                  )}
                  <QueryState
                    isLoading={trend.isLoading}
                    error={trend.error}
                    onRetry={trend.refetch}
                    scopes={BILLING_SCOPES}
                    isEmpty={series.length === 0}
                  >
                    <TimeseriesChart variant="bar" height={280}>
                      {series.map((s) => (
                        <TimeseriesChart.Bar key={s.signal} data={s.timeseries} color={s.color} />
                      ))}
                      <TimeseriesChart.YAxis label={mode === "cost" ? card.currency : "GiB"} />
                      <TimeseriesChart.Tooltip variant="shared" />
                    </TimeseriesChart>
                  </QueryState>
                </Flex>
              </Surface>

              <Surface elevation="raised">
                <Flex flexDirection="column" gap={8} padding={16}>
                  <Heading level={5}>Cost share</Heading>
                  <QueryState isLoading={false} error={null} isEmpty={slices.length === 0} emptyTitle="No cost in this timeframe">
                    <DonutChart data={slices} labelAccessor="category" valueAccessor="value" unit={card.currency} height={280} />
                  </QueryState>
                </Flex>
              </Surface>
            </Grid>

            <Surface elevation="raised">
              <Flex flexDirection="column" gap={8} padding={16}>
                <Heading level={5}>By bucket</Heading>
                <QueryState
                  isLoading={buckets.isLoading}
                  error={buckets.error}
                  onRetry={buckets.refetch}
                  scopes={["storage:buckets:read"]}
                >
                  <DataTable data={tableRows} columns={columns} sortable fullWidth />
                </QueryState>
              </Flex>
            </Surface>

            <KnownGaps />
          </Flex>
        )}
      </QueryState>
    </AppShell>
  );
};
