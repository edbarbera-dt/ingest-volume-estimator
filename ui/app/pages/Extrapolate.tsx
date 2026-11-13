import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { FormField, Label, NumberInputV2 as NumberInput, Select } from "@dynatrace/strato-components/forms";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { DownloadIcon } from "@dynatrace/strato-icons";
import { AppShell } from "../components/AppShell";
import { EstimateChip } from "../components/EstimateChip";
import { QueryState } from "../components/QueryState";
import { useTimeframe } from "../context/Timeframe";
import { useAutoSave } from "../hooks/useAutoSave";
import { useDrivers } from "../hooks/useDrivers";
import { useExtrapolationInputs } from "../hooks/useExtrapolationInputs";
import { useIngestTotals } from "../hooks/useIngestTotals";
import { useRateCard } from "../hooks/useRateCard";
import { buildProjection, effectiveDrivers, projectionCsv, type ProjectionTableRow } from "../shared/extrapolationTable";
import type { ExtrapolationInputs } from "../shared/inputs";
import { DRIVERS, DRIVER_LABELS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "../shared/signals";
import { formatCurrency, formatNumber, formatVolume } from "../shared/units";

const usedDrivers = (inputs: ExtrapolationInputs): Driver[] =>
  DRIVERS.filter((d) => SIGNALS.some((s) => inputs.drivers[s] === d));

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Muted = ({ children, disabled }: { children: React.ReactNode; disabled: boolean }) => (
  <DataTable.DefaultCell>
    <span style={{ color: disabled ? Colors.Text.Neutral.Disabled : undefined }}>{children}</span>
  </DataTable.DefaultCell>
);

export const Extrapolate = () => {
  const tf = useTimeframe();
  const totals = useIngestTotals();
  const drivers = useDrivers();
  const stored = useExtrapolationInputs();
  const { card } = useRateCard();
  const [draft, setDraft] = useState<ExtrapolationInputs | null>(null);

  // Initialise once: saved inputs, or production counts prefilled with the POC counts.
  useEffect(() => {
    if (draft || stored.isLoading || !drivers.data) return;
    const v = stored.value;
    const empty = DRIVERS.every((d) => v.prodCounts[d] === 0);
    setDraft(empty ? { ...v, prodCounts: effectiveDrivers(drivers.data.counts, v.pocOverrides) } : v);
  }, [draft, stored.isLoading, stored.value, drivers.data]);

  useAutoSave(draft, stored.save);

  const pocPerDay = useMemo(() => {
    const out = {} as Record<Signal, number>;
    for (const s of SIGNALS) out[s] = totals.data && tf.days > 0 ? totals.data.bySignal[s].volume / tf.days : 0;
    return out;
  }, [totals.data, tf.days]);

  const projection = useMemo(
    () => (draft && drivers.data ? buildProjection(draft, drivers.data.counts, pocPerDay, card) : null),
    [draft, drivers.data, pocPerDay, card],
  );

  const columns = useMemo<DataTableColumnDef<ProjectionTableRow>[]>(() => {
    const unit = (r: ProjectionTableRow) => SIGNAL_META[r.signal].unit;
    return [
      { id: "signal", header: "Signal", accessor: (r) => SIGNAL_META[r.signal].label },
      {
        id: "pocPerDay",
        header: "POC / day",
        accessor: "pocPerDay",
        alignment: "right",
        cell: ({ rowData: r }) => <Muted disabled={r.disabled}>{formatVolume(r.pocPerDay, unit(r))}</Muted>,
      },
      {
        id: "rate",
        header: "Rate per unit / day",
        accessor: "ratePerUnit",
        alignment: "right",
        cell: ({ rowData: r }) => (
          <Muted disabled={r.disabled}>
            {r.ratePerUnit === null
              ? `No ${DRIVER_LABELS[r.driver].toLowerCase()} detected: set the driver count manually`
              : `${formatVolume(r.ratePerUnit, unit(r))} per ${DRIVER_LABELS[r.driver].toLowerCase().replace(/s$/, "")}`}
          </Muted>
        ),
      },
      {
        id: "prodPerDay",
        header: "Production / day",
        accessor: "prodPerDay",
        alignment: "right",
        cell: ({ rowData: r }) => <Muted disabled={r.disabled}>{formatVolume(r.prodPerDay, unit(r))}</Muted>,
      },
      {
        id: "prodPerMonth",
        header: "Production / month",
        accessor: "prodPerMonth",
        alignment: "right",
        cell: ({ rowData: r }) => <Muted disabled={r.disabled}>{formatVolume(r.prodPerMonth, unit(r))}</Muted>,
      },
      {
        id: "cost",
        header: `Cost / month (${card.currency})`,
        accessor: "totalCost",
        alignment: "right",
        cell: ({ rowData: r }) => (
          <Muted disabled={r.disabled}>{r.disabled ? "–" : formatCurrency(r.totalCost, card.currency)}</Muted>
        ),
      },
    ];
  }, [card.currency]);

  const update = (fn: (d: ExtrapolationInputs) => ExtrapolationInputs) => setDraft((d) => (d ? fn(d) : d));

  return (
    <AppShell
      title="Extrapolate"
      subtitle="Scale POC ingest to production with per-unit drivers"
      actions={<EstimateChip />}
    >
      <QueryState
        isLoading={totals.isLoading || drivers.isLoading || (!draft && !totals.error && !drivers.error)}
        error={totals.error ?? drivers.error}
        onRetry={() => {
          totals.refetch();
          drivers.refetch();
        }}
        scopes={["storage:system:read", "storage:smartscape:read"]}
      >
        {draft && drivers.data && projection && (
          <Flex flexDirection="column" gap={16}>
            <Grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap={16}>
              <Surface elevation="raised">
                <Flex flexDirection="column" gap={12} padding={16}>
                  <Heading level={5}>POC drivers</Heading>
                  <Paragraph>
                    Detected from Smartscape and host billing ({formatNumber(drivers.data.billing.hosts)} billed hosts).
                    Override a count if detection is wrong or missing.
                  </Paragraph>
                  {DRIVERS.map((d) => (
                    <FormField key={d}>
                      <Label>
                        {DRIVER_LABELS[d]} (detected {formatNumber(drivers.data?.counts[d] ?? 0)})
                      </Label>
                      <NumberInput
                        aria-label={`POC ${DRIVER_LABELS[d]}`}
                        min={0}
                        value={draft.pocOverrides[d] ?? drivers.data?.counts[d] ?? 0}
                        onChange={(v) =>
                          update((x) => {
                            const pocOverrides = { ...x.pocOverrides };
                            if (v === null || v === drivers.data?.counts[d]) delete pocOverrides[d];
                            else pocOverrides[d] = Math.max(0, v);
                            return { ...x, pocOverrides };
                          })
                        }
                      />
                    </FormField>
                  ))}
                </Flex>
              </Surface>

              <Surface elevation="raised">
                <Flex flexDirection="column" gap={12} padding={16}>
                  <Heading level={5}>Signals</Heading>
                  {SIGNALS.map((s) => (
                    <Flex key={s} gap={8} alignItems="flex-end">
                      <FormField>
                        <Label>{SIGNAL_META[s].label} scales with</Label>
                        <Select
                          value={draft.drivers[s]}
                          onChange={(v) => v && update((x) => ({ ...x, drivers: { ...x.drivers, [s]: v } }))}
                        >
                          <Select.Content>
                            {DRIVERS.map((d) => (
                              <Select.Option key={d} value={d}>
                                {DRIVER_LABELS[d]}
                              </Select.Option>
                            ))}
                          </Select.Content>
                        </Select>
                      </FormField>
                      {SIGNAL_META[s].unit === "GiB" && (
                        <FormField>
                          <Label>Retention days</Label>
                          <NumberInput
                            aria-label={`${SIGNAL_META[s].label} retention days`}
                            min={0}
                            value={draft.retentionDays[s]}
                            onChange={(v) =>
                              update((x) => ({ ...x, retentionDays: { ...x.retentionDays, [s]: Math.max(0, v ?? 0) } }))
                            }
                          />
                        </FormField>
                      )}
                    </Flex>
                  ))}
                </Flex>
              </Surface>

              <Surface elevation="raised">
                <Flex flexDirection="column" gap={12} padding={16}>
                  <Heading level={5}>Production</Heading>
                  {usedDrivers(draft).map((d) => (
                    <FormField key={d}>
                      <Label>Production {DRIVER_LABELS[d].toLowerCase()}</Label>
                      <NumberInput
                        aria-label={`Production ${DRIVER_LABELS[d]}`}
                        min={0}
                        value={draft.prodCounts[d]}
                        onChange={(v) =>
                          update((x) => ({ ...x, prodCounts: { ...x.prodCounts, [d]: Math.max(0, v ?? 0) } }))
                        }
                      />
                    </FormField>
                  ))}
                  <FormField>
                    <Label>Multiplier (e.g. 1.3 for higher production traffic)</Label>
                    <NumberInput
                      aria-label="Multiplier"
                      min={0}
                      step={0.1}
                      value={draft.multiplier}
                      onChange={(v) => update((x) => ({ ...x, multiplier: Math.max(0, v ?? 1) }))}
                    />
                  </FormField>
                  {stored.saveError && <Text>Could not save inputs: {stored.saveError.message}</Text>}
                </Flex>
              </Surface>
            </Grid>

            {projection.rows.some((r) => r.disabled) && (
              <MessageContainer variant="warning">
                <MessageContainer.Description>
                  Some signals have a driver count of 0 in the POC, so no per-unit rate can be derived. Set the POC
                  driver count manually or pick another driver.
                </MessageContainer.Description>
              </MessageContainer>
            )}

            <Surface elevation="raised">
              <Flex flexDirection="column" gap={8} padding={16}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Heading level={5}>
                    Projected monthly cost: {formatCurrency(projection.total.totalCost, card.currency)}
                  </Heading>
                  <Button
                    onClick={() =>
                      downloadCsv(projectionCsv(projection, card.currency), "ingest-volume-projection.csv")
                    }
                  >
                    <Button.Prefix>
                      <DownloadIcon />
                    </Button.Prefix>
                    Export CSV
                  </Button>
                </Flex>
                <DataTable data={projection.rows} columns={columns} fullWidth />
                <Text>
                  Ingest {formatCurrency(projection.total.ingestCost, card.currency)} + retain{" "}
                  {formatCurrency(projection.total.retainCost, card.currency)} per 30-day month. Retain assumes steady
                  state: daily volume × (retention − included days).
                </Text>
              </Flex>
            </Surface>
          </Flex>
        )}
      </QueryState>
    </AppShell>
  );
};
