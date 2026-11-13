import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { isPermissionError } from "../shared/errors";
import { configurationsFor } from "../shared/flow/configuration";
import { parseTopology, type ConfigurationSettings, type Topology } from "../shared/flow/topology";
import type { Signal } from "../shared/signals";

const KINDS = ["routing", "pipelines", "ingest-sources", "data-forwarding"] as const;
type Kind = (typeof KINDS)[number];

export interface TopologyResult {
  topology: Topology;
  /** True when at least one settings read was denied (settings:objects:read). */
  missingScope: boolean;
}

async function listAll(schemaId: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let nextPageKey: string | undefined;
  do {
    const page = nextPageKey
      ? await settingsObjectsClient.getSettingsObjects({ nextPageKey })
      : await settingsObjectsClient.getSettingsObjects({ schemaIds: schemaId, fields: "objectId,summary,value", pageSize: 500 });
    items.push(...page.items);
    nextPageKey = page.nextPageKey;
  } while (nextPageKey);
  return items;
}

/**
 * Reads builtin:openpipeline.<configuration>.{routing,pipelines,ingest-sources,data-forwarding}
 * for the signal's configurations. Schemas that don't exist are skipped; a denied read sets
 * `missingScope` and the graph falls back to raw ids.
 */
export async function fetchTopology(signal: Signal): Promise<TopologyResult> {
  const configs = configurationsFor(signal);
  const jobs = configs.flatMap((cfg) => KINDS.map((kind) => ({ cfg, kind, schemaId: `builtin:openpipeline.${cfg}.${kind}` })));
  const results = await Promise.allSettled(jobs.map((j) => listAll(j.schemaId)));

  let missingScope = false;
  const byCfg = new Map<string, Record<Kind, unknown[]>>();
  results.forEach((r, i) => {
    const { cfg, kind } = jobs[i];
    const entry = byCfg.get(cfg) ?? { routing: [], pipelines: [], "ingest-sources": [], "data-forwarding": [] };
    if (r.status === "fulfilled") entry[kind] = r.value;
    else if (isPermissionError(r.reason)) missingScope = true;
    byCfg.set(cfg, entry);
  });

  const settings: ConfigurationSettings[] = [...byCfg.entries()].map(([configuration, e]) => ({
    configuration,
    routing: e.routing,
    pipelines: e.pipelines,
    ingestSources: e["ingest-sources"],
    forwarding: e["data-forwarding"],
  }));
  return { topology: parseTopology(settings), missingScope };
}
