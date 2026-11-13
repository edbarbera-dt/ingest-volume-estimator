import { parseIngestTotals } from "../../queries/parse";
import { sumSeries } from "./rates";

const recs = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null) : [];

/**
 * Average billed bytes per record for each bucket, from 24h of billing (Ingest & Process bytes)
 * and 24h of dt.sfm.openpipeline.pipelines_out.records. Buckets without billed bytes (metrics are
 * billed by data points) or without records get no entry.
 */
export function avgRecordSizes(billing24h: unknown, pipelinesOut24h: unknown): Map<string, number> {
  const bytes = new Map<string, number>();
  for (const row of parseIngestTotals(billing24h)) {
    if (row.bytes > 0) bytes.set(row.bucket, (bytes.get(row.bucket) ?? 0) + row.bytes);
  }
  const records = new Map<string, number>();
  for (const r of recs(pipelinesOut24h)) {
    const bucket = typeof r.bucket_name === "string" ? r.bucket_name : "";
    if (bucket) records.set(bucket, (records.get(bucket) ?? 0) + sumSeries(r.r));
  }
  const out = new Map<string, number>();
  for (const [bucket, b] of bytes) {
    const n = records.get(bucket) ?? 0;
    if (n > 0) out.set(bucket, b / n);
  }
  return out;
}

export function bytesRate(recordsPerSecond: number, avgSize: number | undefined | null): number | null {
  return avgSize === undefined || avgSize === null ? null : recordsPerSecond * avgSize;
}
