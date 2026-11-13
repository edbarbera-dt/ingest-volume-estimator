import React from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { EmptyState, MessageContainer, ProgressCircle } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { errorMessage, isPermissionError } from "../shared/errors";
import { MissingScope } from "./MissingScope";

export interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Scopes the query needs; shown when the error is a permission error. */
  scopes?: readonly string[];
  emptyTitle?: string;
  emptyDetails?: React.ReactNode;
  children: React.ReactNode;
}

/** Shared loading / error-with-retry / empty handling for one tile or section. */
export const QueryState = ({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  scopes,
  emptyTitle = "No data available.",
  emptyDetails,
  children,
}: QueryStateProps) => {
  if (isLoading) {
    return (
      <Flex justifyContent="center" padding={24} data-testid="query-loading">
        <ProgressCircle aria-label="Loading" />
      </Flex>
    );
  }
  if (error) {
    if (scopes && isPermissionError(error)) return <MissingScope scopes={scopes} />;
    return (
      <MessageContainer variant="critical">
        <MessageContainer.Title>Query failed</MessageContainer.Title>
        <MessageContainer.Description>{errorMessage(error)}</MessageContainer.Description>
        {onRetry && (
          <MessageContainer.Actions>
            <Button onClick={onRetry}>Retry</Button>
          </MessageContainer.Actions>
        )}
      </MessageContainer>
    );
  }
  if (isEmpty) {
    return (
      <EmptyState size="small">
        <EmptyState.VisualPreset context="chart" type="no-result" />
        <EmptyState.Title>{emptyTitle}</EmptyState.Title>
        {emptyDetails && <EmptyState.Details>{emptyDetails}</EmptyState.Details>}
      </EmptyState>
    );
  }
  return <>{children}</>;
};
