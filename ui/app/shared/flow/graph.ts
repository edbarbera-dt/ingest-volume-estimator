import { isObject } from "../parsing";
import type { Signal } from "../signals";
import { toNumber } from "../units";
import { bytesRate } from "./bytesEstimate";
import { collapseSources } from "./collapse";
import { configurationSignal } from "./configuration";
import { addSeries, ratePerSecond, scaleSeries, sumSeries, toSeries } from "./rates";
import type { Topology } from "./topology";
import type { FlowEdge, FlowGraph, FlowNode, SourceType } from "./types";

export interface FlowInput {
  signal: Signal;
  /** dt.sfm.openpipeline.ingest_sources_in.records by configuration, dt.openpipeline.source */
  sources: unknown;
  /** dt.sfm.openpipeline.routing.records by configuration, dt.openpipeline.source, pipeline_id, route_name */
  routing: unknown;
  /** dt.sfm.openpipeline.pipelines_out.records by configuration, pipeline_id, bucket_name */
  out: unknown;
  topology: Topology;
  /** bucket → average bytes per record (24h). */
  recordSizes: Map<string, number>;
  windowSeconds: number;
  maxSources?: number;
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const NO_BUCKET = "<NoBucket>";

function sourceInfo(raw: string): { label: string; type: SourceType } {
  if (!raw) return { label: "Unknown source", type: "unknown" };
  if (raw === "oneagent") return { label: "OneAgent", type: "oneagent" };
  if (raw === "rumagent") return { label: "RUM agent", type: "rum" };
  if (raw.startsWith("/")) return { label: raw, type: "api" };
  if (raw === "extension" || raw.startsWith("com.dynatrace")) return { label: raw === "extension" ? "Extensions" : raw, type: "extension" };
  const words = raw.replace(/[_-]+/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), type: "internal" };
}

interface PipelineRef {
  key: string;
  label: string;
  pipelineKey?: string;
  builtin: boolean;
  raw: string;
}

function resolvePipeline(t: Topology, cfg: string, pipelineId: string, routeName: string): PipelineRef {
  if (pipelineId) {
    const key = t.byCustomId.get(`${cfg}|${pipelineId}`) ?? t.byObjectId.get(`${cfg}|${pipelineId}`);
    if (key) return { key, label: t.pipelines.get(key)?.name ?? pipelineId, pipelineKey: key, builtin: false, raw: pipelineId };
    if (pipelineId === "default") return { key: `pipe:${cfg}:default`, label: "Default pipeline", builtin: true, raw: pipelineId };
    return { key: `pipe:${cfg}:id:${pipelineId}`, label: pipelineId, builtin: false, raw: pipelineId };
  }
  if (routeName === "default") return { key: `pipe:${cfg}:default`, label: "Default pipeline", builtin: true, raw: "default" };
  const route = t.routes.get(`${cfg}|${routeName}`);
  if (route) {
    const p = t.pipelines.get(route.pipelineKey);
    return { key: route.pipelineKey, label: p?.name ?? route.pipelineKey, pipelineKey: p ? route.pipelineKey : undefined, builtin: false, raw: routeName };
  }
  const name = routeName || "(unknown route)";
  return { key: `pipe:${cfg}:route:${name}`, label: name, builtin: true, raw: name };
}

const sumNullable = (vals: (number | null)[]) =>
  vals.length === 0 || vals.some((v) => v === null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0);

/**
 * Builds the Sources → Pipelines → Destinations graph for one signal tab from the three
 * OpenPipeline self-monitoring metrics plus the settings topology.
 */
export function buildFlowGraph(input: FlowInput): FlowGraph {
  const { signal, topology: t, recordSizes, windowSeconds } = input;
  const inTab = (r: Rec) => configurationSignal(str(r.configuration)) === signal;
  const rows = (v: unknown) => (Array.isArray(v) ? v.filter(isObject).filter(inTab) : []);
  const sources = rows(input.sources);
  const routing = rows(input.routing);
  const out = rows(input.out);

  const first = [...routing, ...out, ...sources][0];
  const tf = first && isObject(first.timeframe) ? first.timeframe : {};
  const start = new Date(str(tf.start) || Date.now() - windowSeconds * 1000);
  const intervalMs = first ? toNumber(first.interval) / 1e6 || 60_000 : 60_000;

  const nodes = new Map<string, FlowNode>();
  const edges = new Map<string, FlowEdge>();
  const rate = (records: number) => ratePerSecond(records, windowSeconds);

  const ensureNode = (n: Omit<FlowNode, "records" | "rate" | "bytesRate" | "series">) => {
    const existing = nodes.get(n.id);
    if (existing) return existing;
    const created: FlowNode = { ...n, records: 0, rate: 0, bytesRate: null, series: [] };
    nodes.set(n.id, created);
    return created;
  };
  const addEdge = (from: string, to: string, cfg: string, series: number[], extra: Partial<FlowEdge>) => {
    const id = `${from}->${to}`;
    const records = series.reduce((a, v) => a + v, 0);
    const e = edges.get(id);
    if (e) {
      e.series = addSeries(e.series, series);
      e.records += records;
      e.rate = rate(e.records);
      if (extra.routeName && !(e.routeName ?? "").split(", ").includes(extra.routeName)) {
        e.routeName = e.routeName ? `${e.routeName}, ${extra.routeName}` : extra.routeName;
      }
      e.estimatedSplit = e.estimatedSplit || !!extra.estimatedSplit;
      return;
    }
    edges.set(id, { id, from, to, configuration: cfg, records, rate: rate(records), bytesRate: null, estimatedSplit: false, series, ...extra });
  };

  const sourceNode = (cfg: string, raw: string) => {
    const info = sourceInfo(raw);
    return ensureNode({ id: `src:${cfg}:${raw || "(unknown)"}`, kind: "source", label: info.label, configuration: cfg, sourceType: info.type, raw });
  };
  const pipelineNode = (cfg: string, ref: PipelineRef) =>
    ensureNode({ id: ref.key, kind: "pipeline", label: ref.label, configuration: cfg, pipelineKey: ref.pipelineKey, builtin: ref.builtin, raw: ref.raw });

  // Source → pipeline edges (routing).
  const inflow = new Map<string, number>(); // pipeline id → records
  const cfgPipelines = new Map<string, Set<string>>();
  for (const r of routing) {
    const cfg = str(r.configuration);
    const src = sourceNode(cfg, str(r["dt.openpipeline.source"]));
    const ref = resolvePipeline(t, cfg, str(r.pipeline_id), str(r.route_name));
    pipelineNode(cfg, ref);
    const series = toSeries(r.r);
    addEdge(src.id, ref.key, cfg, series, { routeName: str(r.route_name) || undefined });
    inflow.set(ref.key, (inflow.get(ref.key) ?? 0) + sumSeries(series));
    cfgPipelines.set(cfg, new Set([...(cfgPipelines.get(cfg) ?? []), ref.key]));
  }

  // Pipeline → destination edges (pipelines_out).
  for (const r of out) {
    const cfg = str(r.configuration);
    const bucket = str(r.bucket_name) || NO_BUCKET;
    const dest = ensureNode({
      id: `dest:${bucket}`,
      kind: "destination",
      label: bucket === NO_BUCKET ? "Not stored (no bucket)" : bucket,
      configuration: cfg,
      bucket: bucket === NO_BUCKET ? undefined : bucket,
      raw: bucket,
    });
    const series = toSeries(r.r);
    const pid = str(r.pipeline_id);
    if (pid) {
      const ref = resolvePipeline(t, cfg, pid, "");
      pipelineNode(cfg, ref);
      addEdge(ref.key, dest.id, cfg, series, {});
      continue;
    }
    const candidates = [...(cfgPipelines.get(cfg) ?? [])].filter((k) => (inflow.get(k) ?? 0) > 0);
    if (candidates.length === 0) {
      const only = [...(cfgPipelines.get(cfg) ?? [])];
      const key = only.length === 1 ? only[0] : `pipe:${cfg}:unattributed`;
      if (only.length !== 1) ensureNode({ id: key, kind: "pipeline", label: "Unattributed", configuration: cfg, builtin: true, raw: "" });
      addEdge(key, dest.id, cfg, series, {});
    } else if (candidates.length === 1) {
      addEdge(candidates[0], dest.id, cfg, series, {});
    } else {
      const total = candidates.reduce((a, k) => a + (inflow.get(k) ?? 0), 0);
      for (const k of candidates) addEdge(k, dest.id, cfg, scaleSeries(series, (inflow.get(k) ?? 0) / total), { estimatedSplit: true });
    }
  }

  // Configured pipelines and forwarding targets without traffic.
  for (const p of t.pipelines.values()) {
    if (configurationSignal(p.configuration) !== signal) continue;
    ensureNode({ id: p.key, kind: "pipeline", label: p.name, configuration: p.configuration, pipelineKey: p.key, builtin: false, raw: p.customId || p.objectId });
  }
  for (const f of t.forwarding) {
    if (configurationSignal(f.configuration) !== signal) continue;
    ensureNode({ id: f.key, kind: "destination", label: f.name, configuration: f.configuration, configuredOnly: true, raw: f.key });
  }

  // Bytes estimate: destination edges use the bucket size; inbound pipeline edges use the
  // pipeline's record-weighted output size.
  const edgeList = [...edges.values()];
  const pipeSize = new Map<string, number | null>();
  for (const e of edgeList) {
    const to = nodes.get(e.to);
    if (to?.kind !== "destination") continue;
    const size = to.bucket ? recordSizes.get(to.bucket) : undefined;
    e.bytesRate = bytesRate(e.rate, size);
  }
  for (const n of nodes.values()) {
    if (n.kind !== "pipeline") continue;
    const outs = edgeList.filter((e) => e.from === n.id);
    const recs = outs.reduce((a, e) => a + e.records, 0);
    if (outs.length === 0 || outs.some((e) => e.bytesRate === null) || recs === 0) {
      pipeSize.set(n.id, null);
      continue;
    }
    pipeSize.set(n.id, outs.reduce((a, e) => a + (e.bytesRate ?? 0) * windowSeconds, 0) / recs);
  }
  for (const e of edgeList) {
    if (nodes.get(e.to)?.kind === "pipeline") e.bytesRate = bytesRate(e.rate, pipeSize.get(e.to));
  }

  // Node totals.
  const sourceTotals = new Map<string, number[]>();
  for (const r of sources) {
    const id = `src:${str(r.configuration)}:${str(r["dt.openpipeline.source"]) || "(unknown)"}`;
    sourceTotals.set(id, addSeries(sourceTotals.get(id) ?? [], toSeries(r.r)));
  }
  for (const n of nodes.values()) {
    const incident = n.kind === "source" ? edgeList.filter((e) => e.from === n.id) : edgeList.filter((e) => e.to === n.id);
    n.series = n.kind === "source" && sourceTotals.has(n.id)
      ? (sourceTotals.get(n.id) as number[])
      : incident.reduce<number[]>((a, e) => addSeries(a, e.series), []);
    n.records = n.series.reduce((a, v) => a + v, 0);
    n.rate = rate(n.records);
    n.bytesRate = sumNullable(incident.map((e) => e.bytesRate));
  }

  return collapseSources(
    { nodes: [...nodes.values()], edges: edgeList, windowSeconds, start, intervalMs },
    input.maxSources ?? 15,
  );
}
