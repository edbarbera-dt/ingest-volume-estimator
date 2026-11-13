import { useState } from "react";
import type { BreakdownDef } from "../queries/breakdown";
import { parseBreakdown, type BreakdownRow } from "../queries/parse";
import type { ResolvedTimeframe } from "../shared/timeframe";
import { useTimeframedDql, type QueryResult } from "./useTimeframedDql";

/** Tier-3 breakdown. Lazy: nothing runs until `run()` is called for this breakdown + timeframe. */
export function useBreakdown(
  def: BreakdownDef,
  timeframe: ResolvedTimeframe,
): QueryResult<BreakdownRow[]> & { run: () => void; hasRun: boolean } {
  const key = `${def.id}|${timeframe.start}|${timeframe.end}`;
  const [requested, setRequested] = useState<string | null>(null);
  const hasRun = requested === key;
  const q = useTimeframedDql(def.query, timeframe, parseBreakdown, { enabled: hasRun });
  return {
    ...q,
    data: hasRun ? q.data : undefined,
    isLoading: hasRun && q.isLoading,
    error: hasRun ? q.error : null,
    hasRun,
    run: () => {
      if (hasRun) q.refetch();
      else setRequested(key);
    },
  };
}
