import React from "react";
import { SingleValue } from "@dynatrace/strato-components/charts";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { SIGNAL_META, signalColor, type Signal } from "../shared/signals";
import { formatCurrency, formatPercent, formatVolume } from "../shared/units";

export const SignalCard = ({
  signal,
  volume,
  perDay,
  cost,
  currency,
  change,
  baselineLabel,
}: {
  signal: Signal;
  volume: number;
  perDay: number;
  cost: number;
  currency: string;
  change: { delta: number; pct: number | null } | null;
  baselineLabel?: string;
}) => {
  const unit = SIGNAL_META[signal].unit;
  return (
    <Surface elevation="raised" style={{ borderTop: `4px solid ${signalColor(signal)}` }}>
      <Flex flexDirection="column" gap={4} padding={12}>
        <SingleValue data={formatVolume(volume, unit)} label={SIGNAL_META[signal].label} height={110}>
          {change && change.pct !== null && (
            <SingleValue.Trend
              direction={change.delta > 0 ? "upward" : change.delta < 0 ? "downward" : "neutral"}
              value={Math.round(change.pct * 1000) / 10}
              label={`% per day vs ${baselineLabel ?? "baseline"}`}
            />
          )}
        </SingleValue>
        <Text>{formatVolume(perDay, unit)} / day</Text>
        <Text style={{ color: Colors.Text.Neutral.Subdued }}>
          Est. cost {formatCurrency(cost, currency)}
          {change && change.pct === null ? ` · baseline had no ${SIGNAL_META[signal].label.toLowerCase()}` : ""}
        </Text>
        {change && change.pct !== null && (
          <Text style={{ color: Colors.Text.Neutral.Subdued }}>Change {formatPercent(change.pct)}</Text>
        )}
      </Flex>
    </Surface>
  );
};
