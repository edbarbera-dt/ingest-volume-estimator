import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { FormField, Label, NumberInputV2 as NumberInput, TextInput } from "@dynatrace/strato-components/forms";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Paragraph, Strong, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { DeleteIcon, DownloadIcon, DuplicateIcon, PlusIcon } from "@dynatrace/strato-icons";
import { AppShell } from "../components/AppShell";
import { EstimateChip } from "../components/EstimateChip";
import { QueryState } from "../components/QueryState";
import { useTimeframe } from "../context/Timeframe";
import { useAutoSave } from "../hooks/useAutoSave";
import { useDrivers } from "../hooks/useDrivers";
import { useExtrapolationInputs } from "../hooks/useExtrapolationInputs";
import { useIngestTotals } from "../hooks/useIngestTotals";
import { useRateCard } from "../hooks/useRateCard";
import {
  buildProjection,
  effectiveDrivers,
  projectionCsv,
  type DriverRate,
  type SignalRow,
} from "../shared/extrapolationTable";
import { newUnit, newUnitId, type CostUnit, type ExtrapolationInputs } from "../shared/inputs";
import { DRIVERS, DRIVER_LABELS, SIGNALS, SIGNAL_META, type Driver, type Signal } from "../shared/signals";
import { formatCurrency, formatNumber, formatVolume } from "../shared/units";

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const singular = (d: Driver) => DRIVER_LABELS[d].toLowerCase().replace(/s$/, "");

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: Colors.Text.Neutral.Disabled }}>{children}</span>
);

const pctChange = (from: number, to: number) => {
  if (from <= 0) return "";
  const p = ((to - from) / from) * 100;
  return ` (${p >= 0 ? "+" : ""}${p.toFixed(0)}%)`;
};

export const Extrapolate = () => {
  const tf = useTimeframe();
  const totals = useIngestTotals();
  const drivers = useDrivers();
  const stored = useExtrapolationInputs();
  const { card } = useRateCard();
  const [draft, setDraft] = useState<ExtrapolationInputs | null>(null);

  // Initialise once: saved inputs, or a single unit that mirrors the current environment.
  useEffect(() => {
    if (draft || stored.isLoading || !drivers.data) return;
    const v = stored.value;
    setDraft(
      v.units.length > 0
        ? v
        : {
            ...v,
            units: [
              newUnit({ name: "Current environment", counts: effectiveDrivers(drivers.data.counts, v.driverOverrides) }),
            ],
          },
    );
  }, [draft, stored.isLoading, stored.value, drivers.data]);

  useAutoSave(draft, stored.save);

  const currentPerDay = useMemo(() => {
    const out = {} as Record<Signal, number>;
    for (const s of SIGNALS) out[s] = totals.data && tf.days > 0 ? totals.data.bySignal[s].volume / tf.days : 0;
    return out;
  }, [totals.data, tf.days]);

  const projection = useMemo(
    () => (draft && drivers.data ? buildProjection(draft, drivers.data.counts, currentPerDay, card) : null),
    [draft, drivers.data, currentPerDay, card],
  );

  const update = (fn: (d: ExtrapolationInputs) => ExtrapolationInputs) => setDraft((d) => (d ? fn(d) : d));
  const updateUnit = (id: string, fn: (u: CostUnit) => CostUnit) =>
    update((x) => ({ ...x, units: x.units.map((u) => (u.id === id ? fn(u) : u)) }));

  const rateColumns = useMemo<DataTableColumnDef<DriverRate>[]>(
    () => [
      { id: "driver", header: "Driver", accessor: (r) => `1 ${singular(r.driver)}` },
      { id: "count", header: "Current count", accessor: "currentCount", alignment: "right" },
      ...SIGNALS.map<DataTableColumnDef<DriverRate>>((s) => ({
        id: s,
        header: SIGNAL_META[s].label,
        accessor: (r) => r.costPerSignal[s].totalCost,
        alignment: "right",
        cell: ({ rowData: r }) => (
          <DataTable.DefaultCell>
            {r.perDay[s] === null ? (
              <Muted>Set count</Muted>
            ) : r.perDay[s] === 0 ? (
              <Muted>–</Muted>
            ) : (
              <span title={`${formatVolume(r.perDay[s] ?? 0, SIGNAL_META[s].unit)} / day`}>
                {formatCurrency(r.costPerSignal[s].totalCost, card.currency)}
              </span>
            )}
          </DataTable.DefaultCell>
        ),
      })),
      {
        id: "total",
        header: `Cost / month (${card.currency})`,
        accessor: (r) => r.cost.totalCost,
        alignment: "right",
        cell: ({ rowData: r }) => (
          <DataTable.DefaultCell>
            <Strong>{formatCurrency(r.cost.totalCost, card.currency)}</Strong>
          </DataTable.DefaultCell>
        ),
      },
    ],
    [card.currency],
  );

  const signalColumns = useMemo<DataTableColumnDef<SignalRow>[]>(() => {
    const unit = (r: SignalRow) => SIGNAL_META[r.signal].unit;
    return [
      { id: "signal", header: "Signal", accessor: (r) => SIGNAL_META[r.signal].label },
      {
        id: "currentPerDay",
        header: "Current / day",
        accessor: "currentPerDay",
        alignment: "right",
        cell: ({ rowData: r }) => <DataTable.DefaultCell>{formatVolume(r.currentPerDay, unit(r))}</DataTable.DefaultCell>,
      },
      {
        id: "currentCost",
        header: "Current / month",
        accessor: (r) => r.currentCost.totalCost,
        alignment: "right",
        cell: ({ rowData: r }) => (
          <DataTable.DefaultCell>{formatCurrency(r.currentCost.totalCost, card.currency)}</DataTable.DefaultCell>
        ),
      },
      {
        id: "prodPerDay",
        header: "Projected / day",
        accessor: "prodPerDay",
        alignment: "right",
        cell: ({ rowData: r }) => <DataTable.DefaultCell>{formatVolume(r.prodPerDay, unit(r))}</DataTable.DefaultCell>,
      },
      {
        id: "prodPerMonth",
        header: "Projected / month",
        accessor: "prodPerMonth",
        alignment: "right",
        cell: ({ rowData: r }) => <DataTable.DefaultCell>{formatVolume(r.prodPerMonth, unit(r))}</DataTable.DefaultCell>,
      },
      {
        id: "cost",
        header: `Projected cost / month (${card.currency})`,
        accessor: (r) => r.cost.totalCost,
        alignment: "right",
        cell: ({ rowData: r }) => (
          <DataTable.DefaultCell>
            {formatCurrency(r.cost.totalCost, card.currency)}
            {pctChange(r.currentCost.totalCost, r.cost.totalCost)}
          </DataTable.DefaultCell>
        ),
      },
    ];
  }, [card.currency]);

  const unratedDrivers = projection?.rates.filter((r) => r.unrated).map((r) => DRIVER_LABELS[r.driver].toLowerCase()) ?? [];

  return (
    <AppShell
      title="Extrapolate"
      subtitle="Turn current spend into cost per host, pod or cluster, then scale units of them up or down"
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
            <Grid gridTemplateColumns="minmax(260px, 1fr) minmax(0, 3fr)" gap={16}>
              <Surface elevation="raised">
                <Flex flexDirection="column" gap={12} padding={16}>
                  <Heading level={5}>1. Current drivers</Heading>
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
                        aria-label={`Current ${DRIVER_LABELS[d]}`}
                        min={0}
                        value={draft.driverOverrides[d] ?? drivers.data?.counts[d] ?? 0}
                        onChange={(v) =>
                          update((x) => {
                            const driverOverrides = { ...x.driverOverrides };
                            if (v === null || v === drivers.data?.counts[d]) delete driverOverrides[d];
                            else driverOverrides[d] = Math.max(0, v);
                            return { ...x, driverOverrides };
                          })
                        }
                      />
                    </FormField>
                  ))}
                </Flex>
              </Surface>

              <Surface elevation="raised">
                <Flex flexDirection="column" gap={12} padding={16}>
                  <Heading level={5}>2. What drives each signal</Heading>
                  <Paragraph>
                    Split each signal&apos;s current volume across the drivers that produce it, in percent. For example,
                    logs 60% hosts and 40% pods spreads 40% of today&apos;s log volume across current pods, so each
                    extra pod adds that per-pod share. Weights are normalised, so they need not add up to 100.
                  </Paragraph>
                  <Grid gridTemplateColumns={`100px repeat(${DRIVERS.length}, minmax(70px, 1fr)) minmax(90px, 1fr)`} gap={8} alignItems="end">
                    <span />
                    {DRIVERS.map((d) => (
                      <Text key={d} textStyle="small-emphasized">
                        {DRIVER_LABELS[d]} %
                      </Text>
                    ))}
                    <Text textStyle="small-emphasized">Retention days</Text>
                    {SIGNALS.map((s) => (
                      <React.Fragment key={s}>
                        <Text>{SIGNAL_META[s].label}</Text>
                        {DRIVERS.map((d) => (
                          <NumberInput
                            key={d}
                            aria-label={`${SIGNAL_META[s].label} % from ${DRIVER_LABELS[d]}`}
                            min={0}
                            value={draft.attribution[s][d] ?? 0}
                            onChange={(v) =>
                              update((x) => {
                                const a = { ...x.attribution[s] };
                                if (!v || v <= 0) delete a[d];
                                else a[d] = v;
                                return { ...x, attribution: { ...x.attribution, [s]: a } };
                              })
                            }
                          />
                        ))}
                        {SIGNAL_META[s].unit === "GiB" ? (
                          <NumberInput
                            aria-label={`${SIGNAL_META[s].label} retention days`}
                            min={0}
                            value={draft.retentionDays[s]}
                            onChange={(v) =>
                              update((x) => ({ ...x, retentionDays: { ...x.retentionDays, [s]: Math.max(0, v ?? 0) } }))
                            }
                          />
                        ) : (
                          <Muted>Included</Muted>
                        )}
                      </React.Fragment>
                    ))}
                  </Grid>
                </Flex>
              </Surface>
            </Grid>

            {(unratedDrivers.length > 0 || projection.unattributed.length > 0) && (
              <MessageContainer variant="warning">
                <MessageContainer.Description>
                  {unratedDrivers.length > 0 &&
                    `Some volume is attributed to ${unratedDrivers.join(", ")}, but the current count is 0, so no per-unit cost can be derived. Set the current count or change the split. `}
                  {projection.unattributed.length > 0 &&
                    `${projection.unattributed.map((s) => SIGNAL_META[s].label).join(", ")} ${projection.unattributed.length === 1 ? "is" : "are"} attributed to no driver and left out of the projection.`}
                </MessageContainer.Description>
              </MessageContainer>
            )}

            <Surface elevation="raised">
              <Flex flexDirection="column" gap={8} padding={16}>
                <Heading level={5}>3. Cost per driver</Heading>
                <Paragraph>
                  What one of each driver costs per month today, from the last {formatNumber(tf.days)} days of ingest. Hover
                  a value for its volume per day.
                </Paragraph>
                <DataTable data={projection.rates} columns={rateColumns} fullWidth />
              </Flex>
            </Surface>

            <Surface elevation="raised">
              <Flex flexDirection="column" gap={12} padding={16}>
                <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
                  <Heading level={5}>4. Cost units</Heading>
                  <Flex gap={8}>
                    <Button
                      onClick={() =>
                        update((x) => ({
                          ...x,
                          units: [...x.units, newUnit({ name: "Current environment", counts: { ...projection.current } })],
                        }))
                      }
                    >
                      <Button.Prefix>
                        <PlusIcon />
                      </Button.Prefix>
                      Add current environment
                    </Button>
                    <Button
                      variant="accent"
                      color="primary"
                      onClick={() => update((x) => ({ ...x, units: [...x.units, newUnit({ name: `Unit ${x.units.length + 1}` })] }))}
                    >
                      <Button.Prefix>
                        <PlusIcon />
                      </Button.Prefix>
                      Add unit
                    </Button>
                  </Flex>
                </Flex>
                <Paragraph>
                  A unit is a bundle of drivers you can scale, such as one production cluster with its hosts and pods. Set
                  how many units you plan to run and a traffic factor if they will be busier than today (1.3 = 30% more).
                </Paragraph>
                {projection.units.length === 0 && <Text>No units yet. Add one to project a cost.</Text>}
                {projection.units.map(({ unit, unitCost, subtotal }) => (
                  <Surface key={unit.id} elevation="flat">
                    <Flex flexDirection="column" gap={8} padding={12}>
                      <Flex gap={8} alignItems="flex-end" flexWrap="wrap">
                        <FormField>
                          <Label>Name</Label>
                          <TextInput
                            aria-label="Unit name"
                            value={unit.name}
                            onChange={(v) => updateUnit(unit.id, (u) => ({ ...u, name: v }))}
                          />
                        </FormField>
                        <FormField>
                          <Label>Quantity</Label>
                          <NumberInput
                            aria-label={`${unit.name} quantity`}
                            min={0}
                            value={unit.quantity}
                            onChange={(v) => updateUnit(unit.id, (u) => ({ ...u, quantity: Math.max(0, v ?? 0) }))}
                          />
                        </FormField>
                        <FormField>
                          <Label>Traffic factor</Label>
                          <NumberInput
                            aria-label={`${unit.name} traffic factor`}
                            min={0}
                            step={0.1}
                            value={unit.trafficFactor}
                            onChange={(v) => updateUnit(unit.id, (u) => ({ ...u, trafficFactor: Math.max(0, v ?? 1) }))}
                          />
                        </FormField>
                        <Flex flexDirection="column" gap={2} style={{ marginLeft: "auto", textAlign: "right" }}>
                          <Text>{formatCurrency(unitCost.totalCost, card.currency)} per unit / month</Text>
                          <Strong>
                            {formatCurrency(subtotal.totalCost, card.currency)} / month for {formatNumber(unit.quantity)}
                          </Strong>
                        </Flex>
                        <Button
                          aria-label={`Duplicate ${unit.name}`}
                          onClick={() =>
                            update((x) => {
                              const i = x.units.findIndex((u) => u.id === unit.id);
                              const copy = { ...unit, counts: { ...unit.counts }, id: newUnitId(), name: `${unit.name} (copy)` };
                              return { ...x, units: [...x.units.slice(0, i + 1), copy, ...x.units.slice(i + 1)] };
                            })
                          }
                        >
                          <Button.Prefix>
                            <DuplicateIcon />
                          </Button.Prefix>
                        </Button>
                        <Button
                          aria-label={`Remove ${unit.name}`}
                          color="critical"
                          onClick={() => update((x) => ({ ...x, units: x.units.filter((u) => u.id !== unit.id) }))}
                        >
                          <Button.Prefix>
                            <DeleteIcon />
                          </Button.Prefix>
                        </Button>
                      </Flex>
                      <Grid gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))" gap={8}>
                        {DRIVERS.map((d) => (
                          <FormField key={d}>
                            <Label>{DRIVER_LABELS[d]} per unit</Label>
                            <NumberInput
                              aria-label={`${unit.name} ${DRIVER_LABELS[d]}`}
                              min={0}
                              value={unit.counts[d]}
                              onChange={(v) =>
                                updateUnit(unit.id, (u) => ({ ...u, counts: { ...u.counts, [d]: Math.max(0, v ?? 0) } }))
                              }
                            />
                          </FormField>
                        ))}
                      </Grid>
                    </Flex>
                  </Surface>
                ))}
                {stored.saveError && <Text>Could not save inputs: {stored.saveError.message}</Text>}
              </Flex>
            </Surface>

            <Surface elevation="raised">
              <Flex flexDirection="column" gap={8} padding={16}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Heading level={5}>
                    Projected monthly cost: {formatCurrency(projection.total.totalCost, card.currency)}
                  </Heading>
                  <Button
                    onClick={() => downloadCsv(projectionCsv(projection, card.currency), "ingest-volume-projection.csv")}
                  >
                    <Button.Prefix>
                      <DownloadIcon />
                    </Button.Prefix>
                    Export CSV
                  </Button>
                </Flex>
                <Text>
                  Current: {formatCurrency(projection.currentTotal.totalCost, card.currency)} / month
                  {pctChange(projection.currentTotal.totalCost, projection.total.totalCost)}. Projected drivers:{" "}
                  {DRIVERS.filter((d) => projection.projectedCounts[d] > 0)
                    .map((d) => `${formatNumber(projection.projectedCounts[d])} ${DRIVER_LABELS[d].toLowerCase()}`)
                    .join(", ") || "none"}
                  .
                </Text>
                <DataTable data={projection.rows} columns={signalColumns} fullWidth />
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
