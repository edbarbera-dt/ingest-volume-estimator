import { INGEST_TREND } from "../queries/billing";
import { parseTrend, type TrendSeries } from "../queries/parse";
import { useTimeframe } from "../context/Timeframe";
import { useTimeframedDql, type QueryResult } from "./useTimeframedDql";

/** Q2: daily ingest per signal. */
export function useIngestTrend(): QueryResult<TrendSeries[]> {
  const tf = useTimeframe();
  return useTimeframedDql(INGEST_TREND, tf, parseTrend);
}
