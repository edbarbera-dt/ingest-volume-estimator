import React, { useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { CategoricalBarChart } from "@dynatrace/strato-components/charts";
import { Chip } from "@dynatrace/strato-components/content";
import { FormField, Label, Select, TextInput } from "@dynatrace/strato-components/forms";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { AppShell } from "../components/AppShell";
import { QueryState } from "../components/QueryState";
import { useTimeframe } from "../context/Timeframe";
import { useBaselines } from "../hooks/useBaselines";
import { useDrivers } from "../hooks/useDrivers";
import { useIngestTotals } from "../hooks/useIngestTotals";
import { compareBaselines, makeBaseline, type Baseline, type Delta } from "../shared/baselines";
import { SIGNALS, SIGNAL_META, type Signal } from "../shared/signals";
import { formatPercent, formatVolume } from "../shared/units";

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleString() : "–");

interface CompareRow extends Delta {
  signal: Signal;
}

const Compare = ({ baselines }: { baselines: Baseline[] }) => {
  const [fromId, setFromId] = useState<string>(baselines[baselines.length - 1].id);
  const [toId, setToId] = useState<string>(baselines[0].id);
  const from = baselines.find((b) => b.id === fromId) ?? baselines[baselines.length - 1];
  const to = baselines.find((b) => b.id === toId) ?? baselines[0];
  const deltas = useMemo(() => compareBaselines(from, to), [from, to]);
  const rows = useMemo<CompareRow[]>(() => SIGNALS.map((s) => ({ signal: s, ...deltas[s] })), [deltas]);
  const bars = useMemo(
    () =>
      rows
        .filter((r) => r.pct !== null)
        .map((r) => ({ category: SIGNAL_META[r.signal].label, value: Math.round((r.pct ?? 0) * 1000) / 10, unit: "%" })),
    [rows],
  );
  const columns = useMemo<DataTableColumnDef<CompareRow>[]>(() => {
    const vol = (v: number, s: Signal) => formatVolume(v, SIGNAL_META[s].unit);
    return [
      { id: "signal", header: "Signal", accessor: (r) => SIGNAL_META[r.signal].label },
      { id: "from", header: `${from.label} / day`, accessor: "from", alignment: "right", cell: ({ rowData: r }) => <DataTable.DefaultCell>{vol(r.from, r.signal)}</DataTable.DefaultCell> },
      { id: "to", header: `${to.label} / day`, accessor: "to", alignment: "right", cell: ({ rowData: r }) => <DataTable.DefaultCell>{vol(r.to, r.signal)}</DataTable.DefaultCell> },
      {
        id: "delta",
        header: "Change / day",
        accessor: "delta",
        alignment: "right",
        cell: ({ rowData: r }) => (
          <DataTable.DefaultCell>
            {r.delta > 0 ? "+" : ""}
            {vol(r.delta, r.signal)}
          </DataTable.DefaultCell>
        ),
      },
      { id: "pct", header: "Change %", accessor: "pct", alignment: "right", cell: ({ rowData: r }) => <DataTable.DefaultCell>{formatPercent(r.pct)}</DataTable.DefaultCell> },
    ];
  }, [from.label, to.label]);

  const picker = (label: string, value: string, onChange: (v: string) => void) => (
    <FormField>
      <Label>{label}</Label>
      <Select value={value} onChange={(v) => v && onChange(String(v))}>
        <Select.Content>
          {baselines.map((b) => (
            <Select.Option key={b.id} value={b.id}>
              {b.label}
            </Select.Option>
          ))}
        </Select.Content>
      </Select>
    </FormField>
  );

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex gap={16} flexWrap="wrap">
        {picker("From", from.id, setFromId)}
        {picker("To", to.id, setToId)}
      </Flex>
      <Paragraph>Volumes are averaged per day, so snapshots with different timeframes compare fairly.</Paragraph>
      {bars.length > 0 && (
        <CategoricalBarChart data={bars} height={240}>
          <CategoricalBarChart.ValueAxis label="Change %" />
        </CategoricalBarChart>
      )}
      <DataTable data={rows} columns={columns} fullWidth />
    </Flex>
  );
};

export const Baselines = () => {
  const tf = useTimeframe();
  const totals = useIngestTotals();
  const drivers = useDrivers();
  const store = useBaselines();
  const [showModal, setShowModal] = useState(false);
  const [label, setLabel] = useState("");

  const canSnapshot = !!totals.data && !!drivers.data;

  const save = async () => {
    if (!totals.data || !drivers.data) return;
    const volumes = Object.fromEntries(SIGNALS.map((s) => [s, totals.data?.bySignal[s].volume ?? 0])) as Record<Signal, number>;
    await store.add(
      makeBaseline({ label, timeframe: { start: tf.start, end: tf.end, days: tf.days }, volumes, drivers: drivers.data.counts }),
    );
    setShowModal(false);
    setLabel("");
  };

  const columns = useMemo<DataTableColumnDef<Baseline>[]>(
    () => [
      {
        id: "label",
        header: "Label",
        accessor: "label",
        cell: ({ rowData: b }) => (
          <DataTable.DefaultCell>
            <Flex gap={8} alignItems="center">
              <Text>{b.label}</Text>
              {store.active?.id === b.id && (
                <Chip color="primary" size="condensed">
                  active
                </Chip>
              )}
            </Flex>
          </DataTable.DefaultCell>
        ),
      },
      { id: "created", header: "Saved", accessor: (b) => fmtDate(b.createdAt) },
      { id: "timeframe", header: "Timeframe", accessor: (b) => `${fmtDate(b.timeframe.start)} – ${fmtDate(b.timeframe.end)}` },
      ...SIGNALS.map(
        (s): DataTableColumnDef<Baseline> => ({
          id: s,
          header: `${SIGNAL_META[s].label} / day`,
          accessor: (b) => b.volumePerDay[s],
          alignment: "right",
          cell: ({ rowData: b }) => (
            <DataTable.DefaultCell>{formatVolume(b.volumePerDay[s], SIGNAL_META[s].unit)}</DataTable.DefaultCell>
          ),
        }),
      ),
      {
        id: "actions",
        header: "Actions",
        accessor: "id",
        cell: ({ rowData: b }) => (
          <DataTable.DefaultCell>
            <Flex gap={4}>
              <Button
                size="condensed"
                onClick={() => void store.setActive(store.active?.id === b.id ? null : b.id)}
              >
                {store.active?.id === b.id ? "Unset active" : "Set active"}
              </Button>
              <Button size="condensed" color="critical" onClick={() => void store.remove(b.id)}>
                Delete
              </Button>
            </Flex>
          </DataTable.DefaultCell>
        ),
      },
    ],
    [store],
  );

  return (
    <AppShell
      title="Baselines"
      subtitle="Save snapshots of ingest and drivers, then compare them after optimising"
      actions={
        <Button variant="accent" color="primary" disabled={!canSnapshot} onClick={() => setShowModal(true)}>
          Save snapshot
        </Button>
      }
    >
      <Modal
        title="Save snapshot"
        show={showModal}
        onDismiss={() => setShowModal(false)}
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="accent" color="primary" onClick={() => void save()} loading={store.isSaving}>
              Save
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={8}>
          <Paragraph>
            Stores the current timeframe ({fmtDate(tf.start)} – {fmtDate(tf.end)}), ingest per signal and driver
            counts in app state for this tenant.
          </Paragraph>
          <FormField>
            <Label>Label</Label>
            <TextInput value={label} onChange={setLabel} placeholder="e.g. Week 1, before log filters" />
          </FormField>
          {store.saveError && <Text>Could not save: {store.saveError.message}</Text>}
        </Flex>
      </Modal>

      <QueryState
        isLoading={store.isLoading}
        error={store.error}
        scopes={["state:app-states:read"]}
        isEmpty={store.baselines.length === 0}
        emptyTitle="No baselines yet"
        emptyDetails="Pick a timeframe and select Save snapshot. Set a baseline active to see the change on the Overview."
      >
        <Flex flexDirection="column" gap={16}>
          <Surface elevation="raised">
            <Flex flexDirection="column" gap={8} padding={16}>
              <Heading level={5}>Snapshots</Heading>
              <DataTable data={store.baselines} columns={columns} fullWidth />
            </Flex>
          </Surface>
          {store.baselines.length >= 2 && (
            <Surface elevation="raised">
              <Flex flexDirection="column" gap={8} padding={16}>
                <Heading level={5}>Compare</Heading>
                <Compare baselines={store.baselines} />
              </Flex>
            </Surface>
          )}
        </Flex>
      </QueryState>
    </AppShell>
  );
};
