import React from "react";
import { Flex, TitleBar } from "@dynatrace/strato-components/layouts";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { useTimeframe } from "../context/Timeframe";

/** Page frame: title bar with the shared TimeframeSelector, then the page content. */
export const AppShell = ({
  title,
  subtitle,
  showTimeframe = true,
  actions,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  showTimeframe?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const tf = useTimeframe();
  return (
    <Flex flexDirection="column" gap={16} padding={16}>
      <TitleBar>
        <TitleBar.Title>{title}</TitleBar.Title>
        {subtitle && <TitleBar.Subtitle>{subtitle}</TitleBar.Subtitle>}
        {(showTimeframe || actions) && (
          <TitleBar.Suffix>
            <Flex gap={8} alignItems="center">
              {actions}
              {showTimeframe && (
                <TimeframeSelector
                  value={tf.value}
                  onChange={(value) => tf.setValue(value)}
                  aria-label="Timeframe"
                />
              )}
            </Flex>
          </TitleBar.Suffix>
        )}
      </TitleBar>
      {children}
    </Flex>
  );
};
