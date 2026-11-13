import { isObject } from "../parsing";

export interface RouteInfo {
  configuration: string;
  description: string;
  pipelineKey: string;
  matcher: string;
  enabled: boolean;
}

export interface PipelineInfo {
  key: string;
  configuration: string;
  objectId: string;
  name: string;
  customId: string;
  /** Buckets named in bucketAssignment storage processors. */
  buckets: string[];
  value: Record<string, unknown>;
}

export interface IngestSourceInfo {
  configuration: string;
  name: string;
  source: string;
  pipelineKey: string | null;
}

export interface ForwardingInfo {
  key: string;
  configuration: string;
  name: string;
  summary: Record<string, unknown>;
}

export interface Topology {
  routes: Map<string, RouteInfo>;
  pipelines: Map<string, PipelineInfo>;
  byCustomId: Map<string, string>;
  byObjectId: Map<string, string>;
  ingestSources: IngestSourceInfo[];
  forwarding: ForwardingInfo[];
}

export interface ConfigurationSettings {
  configuration: string;
  routing: unknown;
  pipelines: unknown;
  ingestSources: unknown;
  forwarding: unknown;
}

export function emptyTopology(): Topology {
  return { routes: new Map(), pipelines: new Map(), byCustomId: new Map(), byObjectId: new Map(), ingestSources: [], forwarding: [] };
}

const objects = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const pipelineKeyFor = (configuration: string, objectId: string) => `pipe:${configuration}:${objectId}`;

function resolvePipelineId(t: Topology, cfg: string, pipelineId: string): string {
  return (
    t.byObjectId.get(`${cfg}|${pipelineId}`) ??
    t.byCustomId.get(`${cfg}|${pipelineId}`) ??
    (pipelineId === "default" ? `pipe:${cfg}:default` : `pipe:${cfg}:id:${pipelineId}`)
  );
}

/** Builds route → pipeline → bucket lookups from builtin:openpipeline.<configuration>.* settings objects. */
export function parseTopology(configs: ConfigurationSettings[]): Topology {
  const t = emptyTopology();
  for (const c of configs) {
    const cfg = c.configuration;
    for (const p of objects(c.pipelines)) {
      const value = isObject(p.value) ? p.value : null;
      const objectId = str(p.objectId);
      if (!value || !objectId) continue;
      const storage = isObject(value.storage) ? objects(value.storage.processors) : [];
      const buckets = storage
        .map((s) => (isObject(s.bucketAssignment) ? str(s.bucketAssignment.bucketName) : ""))
        .filter(Boolean);
      const key = pipelineKeyFor(cfg, objectId);
      const info: PipelineInfo = {
        key,
        configuration: cfg,
        objectId,
        name: str(value.displayName) || str(p.summary) || str(value.customId) || objectId,
        customId: str(value.customId),
        buckets,
        value,
      };
      t.pipelines.set(key, info);
      t.byObjectId.set(`${cfg}|${objectId}`, key);
      if (info.customId) t.byCustomId.set(`${cfg}|${info.customId}`, key);
    }
    for (const r of objects(c.routing)) {
      const entries = isObject(r.value) ? objects(r.value.routingEntries) : [];
      for (const e of entries) {
        const description = str(e.description);
        if (!description) continue;
        t.routes.set(`${cfg}|${description}`, {
          configuration: cfg,
          description,
          pipelineKey: resolvePipelineId(t, cfg, str(e.pipelineId)),
          matcher: str(e.matcher),
          enabled: e.enabled !== false,
        });
      }
    }
    for (const s of objects(c.ingestSources)) {
      const v = isObject(s.value) ? s.value : {};
      const routing = isObject(v.staticRouting) ? v.staticRouting : {};
      t.ingestSources.push({
        configuration: cfg,
        name: str(v.displayName) || str(s.summary),
        source: str(v.source),
        pipelineKey: str(routing.pipelineId) ? resolvePipelineId(t, cfg, str(routing.pipelineId)) : null,
      });
    }
    for (const f of objects(c.forwarding)) {
      const objectId = str(f.objectId);
      if (!objectId) continue;
      const v = isObject(f.value) ? f.value : {};
      t.forwarding.push({
        key: `fwd:${cfg}:${objectId}`,
        configuration: cfg,
        name: str(f.summary) || str(v.displayName) || objectId,
        summary: v,
      });
    }
  }
  return t;
}

export interface ProcessorInfo {
  stage: string;
  id: string;
  type: string;
  description: string;
  enabled: boolean;
  matcher: string;
}

/** Every processor of a pipeline, grouped by stage (processing, storage, dataExtraction, ...). */
export function pipelineProcessors(p: PipelineInfo): ProcessorInfo[] {
  const out: ProcessorInfo[] = [];
  for (const [stage, v] of Object.entries(p.value)) {
    if (!isObject(v)) continue;
    for (const proc of objects(v.processors)) {
      out.push({
        stage,
        id: str(proc.id),
        type: str(proc.type),
        description: str(proc.description),
        enabled: proc.enabled !== false,
        matcher: str(proc.matcher),
      });
    }
  }
  return out;
}

export function routesForPipeline(t: Topology, pipelineKey: string): RouteInfo[] {
  return [...t.routes.values()].filter((r) => r.pipelineKey === pipelineKey);
}
