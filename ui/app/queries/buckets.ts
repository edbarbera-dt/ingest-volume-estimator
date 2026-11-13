// Bucket metadata and retention. Import-free (see billing.ts).

/** Q5: buckets with retention. */
export const BUCKETS = `fetch dt.system.buckets
| fields name, display_name, dt.system.table, retention_days, estimated_uncompressed_bytes, records`;

export const BUCKET_QUERIES = { BUCKETS };
