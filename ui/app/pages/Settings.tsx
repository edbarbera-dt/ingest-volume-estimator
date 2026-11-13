import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { FormField, Label, NumberInputV2 as NumberInput, Select } from "@dynatrace/strato-components/forms";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { ExternalLink, Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { AppShell } from "../components/AppShell";
import { EstimateChip } from "../components/EstimateChip";
import { QueryState } from "../components/QueryState";
import { useRateCard } from "../hooks/useRateCard";
import {
  CURRENCIES,
  convertRateCard,
  isCurrencyCode,
  isListPrice,
  listPricesFor,
  validateRateCard,
  type RateCard,
  type RateField,
} from "../shared/rateCard";
import { SIGNALS, SIGNAL_META, type Signal } from "../shared/signals";
import { formatCurrency } from "../shared/units";

interface RateRow {
  signal: Signal;
}

const FIELD_LABEL: Record<RateField, string> = {
  ingestPrice: "Ingest & Process",
  retainPricePerGiBDay: "Retain per GiB-day",
  includedRetentionDays: "Included retention (days)",
};

const unitLabel = (s: Signal) => (SIGNAL_META[s].unit === "GiB" ? "per GiB" : "per 100k data points");

const RateInputCell = ({
  signal,
  field: f,
  card,
  list,
  onChange,
}: {
  signal: Signal;
  field: RateField;
  card: RateCard;
  list: RateCard;
  onChange: (s: Signal, f: RateField, v: number | null) => void;
}) => {
  const v = card.rates[signal][f];
  if (v === null) {
    return <DataTable.DefaultCell>Not billed separately (15 months included)</DataTable.DefaultCell>;
  }
  const listValue = list.rates[signal][f];
  return (
    <DataTable.DefaultCell>
      <Flex flexDirection="column" gap={2}>
        <NumberInput
          aria-label={`${SIGNAL_META[signal].label} ${FIELD_LABEL[f]}`}
          min={0}
          step={f === "includedRetentionDays" ? 1 : 0.0001}
          value={Number.isFinite(v) ? v : null}
          onChange={(nv) => onChange(signal, f, nv)}
        />
        <Text>
          List:{" "}
          {f === "includedRetentionDays"
            ? `${listValue ?? "–"} days`
            : `${formatCurrency(listValue, card.currency)} ${f === "ingestPrice" ? unitLabel(signal) : ""}`}
        </Text>
      </Flex>
    </DataTable.DefaultCell>
  );
};

export const Settings = () => {
  const rc = useRateCard();
  const [draft, setDraft] = useState<RateCard | null>(null);
  useEffect(() => {
    if (!draft && !rc.isLoading) setDraft(rc.card);
  }, [draft, rc.isLoading, rc.card]);

  const card = draft ?? rc.card;
  const errors = useMemo(() => validateRateCard(card), [card]);
  const dirty = JSON.stringify(card) !== JSON.stringify(rc.card);
  const list = listPricesFor(card.currency);

  const setField = useCallback(
    (s: Signal, f: RateField, v: number | null) =>
      setDraft((d) => {
        const base = d ?? rc.card;
        return { ...base, rates: { ...base.rates, [s]: { ...base.rates[s], [f]: v ?? Number.NaN } } };
      }),
    [rc.card],
  );

  const rows = useMemo<RateRow[]>(() => SIGNALS.map((signal) => ({ signal })), []);

  const columns = useMemo<DataTableColumnDef<RateRow>[]>(() => {
    const priceCell = (f: RateField) =>
      function renderRateCell({ rowData: { signal } }: { rowData: RateRow }) {
        return <RateInputCell signal={signal} field={f} card={card} list={list} onChange={setField} />;
      };
    return [
      { id: "signal", header: "Signal", accessor: (r) => SIGNAL_META[r.signal].label },
      { id: "ingestPrice", header: `Ingest & Process (${card.currency})`, accessor: (r) => card.rates[r.signal].ingestPrice, cell: priceCell("ingestPrice") },
      { id: "retainPricePerGiBDay", header: `Retain per GiB-day (${card.currency})`, accessor: (r) => card.rates[r.signal].retainPricePerGiBDay ?? "", cell: priceCell("retainPricePerGiBDay") },
      { id: "includedRetentionDays", header: "Included retention (days)", accessor: (r) => card.rates[r.signal].includedRetentionDays, cell: priceCell("includedRetentionDays") },
    ];
  }, [card, list, setField]);

  return (
    <AppShell title="Settings" subtitle="Rate card used for every cost estimate" showTimeframe={false} actions={<EstimateChip />}>
      <QueryState isLoading={rc.isLoading} error={rc.error} scopes={["state:app-states:read"]}>
        <Surface elevation="raised">
          <Flex flexDirection="column" gap={12} padding={16}>
            <Flex justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap={12}>
              <FormField>
                <Label>Currency</Label>
                <Select
                  value={card.currency}
                  onChange={(v) => {
                    if (isCurrencyCode(v)) setDraft(convertRateCard(card, v));
                  }}
                >
                  <Select.Content>
                    {Object.entries(CURRENCIES).map(([code, c]) => (
                      <Select.Option key={code} value={code}>
                        {`${code} – ${c.label}`}
                      </Select.Option>
                    ))}
                  </Select.Content>
                </Select>
              </FormField>
              <Flex gap={8}>
                <Button onClick={() => setDraft(listPricesFor(card.currency))} disabled={isListPrice(card)}>
                  Reset to list
                </Button>
                <Button
                  variant="accent"
                  color="primary"
                  disabled={!dirty || errors.length > 0}
                  loading={rc.isSaving}
                  onClick={() => void rc.save(card)}
                >
                  Save rate card
                </Button>
              </Flex>
            </Flex>

            {errors.length > 0 && (
              <MessageContainer variant="critical">
                <MessageContainer.Title>Fix these values before saving</MessageContainer.Title>
                <MessageContainer.Description>
                  {errors.map((e) => `${SIGNAL_META[e.signal].label} ${FIELD_LABEL[e.field]}: ${e.message}`).join("; ")}
                </MessageContainer.Description>
              </MessageContainer>
            )}
            {rc.saveError && (
              <MessageContainer variant="critical">
                <MessageContainer.Description>Could not save: {rc.saveError.message}</MessageContainer.Description>
              </MessageContainer>
            )}

            <DataTable data={rows} columns={columns} fullWidth variant={{ verticalAlignment: "center" }} />

            <Heading level={6}>Sources</Heading>
            <Paragraph>
              List prices: <ExternalLink href="https://www.dynatrace.com/pricing/rate-card/">Dynatrace rate card</ExternalLink>{" "}
              (USD, read 2026-11-13). Other currencies use the rates on{" "}
              <ExternalLink href="https://www.dynatrace.com/pricing/currency-conversion/">local currency pricing</ExternalLink>.
              Logs default to Pay-per-Query retention. Events included retention isn't published, so it defaults to 0
              days. Enter your contract prices to replace the list-price estimate.
            </Paragraph>
          </Flex>
        </Surface>
      </QueryState>
    </AppShell>
  );
};
