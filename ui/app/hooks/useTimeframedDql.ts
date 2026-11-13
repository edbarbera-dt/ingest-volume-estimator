import { useDql } from "@dynatrace-sdk/react-hooks";
import type { ResolvedTimeframe } from "../shared/timeframe";

export interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Runs a DQL constant over a timeframe and maps its records with `parse`. */
export function useTimeframedDql<T>(
  query: string,
  timeframe: Pick<ResolvedTimeframe, "start" | "end">,
  parse: (records: unknown) => T,
  options: { enabled?: boolean } = {},
): QueryResult<T> & { records: unknown } {
  const result = useDql(
    {
      query,
      defaultTimeframeStart: timeframe.start,
      defaultTimeframeEnd: timeframe.end,
    },
    { enabled: options.enabled ?? true, staleTime: 5 * 60_000 },
  );
  const records = result.data?.records;
  return {
    records,
    data: result.data ? parse(records) : undefined,
    isLoading: result.isLoading,
    error: result.error,
    refetch: () => {
      void result.forceRefetch({});
    },
  };
}
