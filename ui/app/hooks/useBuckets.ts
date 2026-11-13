import { BUCKETS } from "../queries/buckets";
import { parseBuckets, type BucketRow } from "../queries/parse";
import { useTimeframe } from "../context/Timeframe";
import { useTimeframedDql, type QueryResult } from "./useTimeframedDql";

/** Q5: bucket metadata and retention. */
export function useBuckets(): QueryResult<BucketRow[]> {
  const tf = useTimeframe();
  return useTimeframedDql(BUCKETS, tf, parseBuckets);
}
