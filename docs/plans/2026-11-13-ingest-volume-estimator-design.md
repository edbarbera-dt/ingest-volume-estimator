# Ingest Volume Estimator — Design

Date: 2026-11-13
Status: Phase 1 built; Phase 2 approved 2026-11-13
Dev tenant: `rkj7350h` (`https://rkj7350h.sprint.apps.dynatracelabs.com`, dtctl context `sprint`)

## Goal

A standalone Dynatrace platform app that shows how much data a tenant ingests per signal
(logs, metrics, traces, events), what it costs, and what it would cost at production scale.

- **Plan growth:** measure current ingest on a subset of the environment and extrapolate production cost.
- **Customers after go-live:** baseline ingest, then measure the effect of optimisations.

It takes inspiration from the QuickStart app but has no code or integration dependency on it.
It is built and tested against `rkj7350h`, has no hard-coded tenant values, and is packaged
with `npx dt-app deploy` for any other tenant.

## Scope

| Phase | Content | Status |
|---|---|---|
| 1 | Data layer (Section 1) + screens (Section 2) | **In scope now** |
| 2 | OpenPipeline flow visualisation (Section 3) | **Approved 2026-11-13, building** |

## Decisions

| Topic | Decision |
|---|---|
| App form | Standalone custom app (`dt-app`, React, Node 24) |
| UI | Strato components only; colours from `@dynatrace/strato-design-tokens` |
| Cost | Editable rate card, pre-filled with Dynatrace public list prices, overridable per tenant |
| Extrapolation | Per-unit drivers derived from current ingest (per host / service / pod), plus an optional multiplier |
| Baselines | Labelled snapshots stored in app state |

## Tenant findings (rkj7350h, 7 days to 2026-11-13)

| Signal | Volume | Billing-event dimensions |
|---|---|---|
| Traces | 58.4 GiB, 40.1M spans | `usage.bucket`, `licensing_type` |
| Logs | 4.9 GiB | `usage.bucket` only |
| Metrics | 2.2M data points | `monitoring_source` (fullstack/other), `metric.type`, `dt.cost.costcenter`, `dt.cost.product` |
| Events | ~2.9 MB | `event.billing.category` |

- Billing events have 15-minute granularity (`usage.start`/`usage.end`).
- Volume fields: `billed_bytes` for logs and events, `ingested_bytes` + `ingested_spans` for traces,
  `data_points` for metrics.
- Metrics usage arrives about 4 hours late.
- Raw logs: `Container Output` is about 85% of log content bytes.
- OpenPipeline self-monitoring metrics exist: `dt.sfm.openpipeline.ingest_sources_in.records`,
  `.routing.records`, `.pipelines_out.records`. Dimensions: `dt.openpipeline.source`, `configuration`,
  `pipeline_id`, `route_name`, `bucket_name`. These are record counts only, with no bytes.

---

## Section 1 — Architecture and data layer (Phase 1)

### Data tiers, ordered by query cost

| Tier | Source | When it runs | Purpose |
|---|---|---|---|
| 1 Billing | `fetch dt.system.events \| filter event.kind == "BILLING_USAGE_EVENT"` — Ingest & Process, Retain, Full-Stack / Infrastructure host-hours | On load, cached | Overview totals, trends, cost |
| 2 Drivers | `smartscapeNodes` counts (hosts, services, pods, k8s clusters) + host-hours from billing | On load, cached | Per-unit rates for extrapolation |
| 3 Breakdown | Raw `fetch logs` / `spans` / `events`, `metric.series` | Only when a user opens a signal detail; default 24h; scan-cost hint shown | Top contributors |

Tier 1 is the source of truth for volume and cost. Tier 3 only splits the volume into shares,
because raw content length is smaller than billed bytes (billing also counts attributes).

### Extrapolation

```
rate_per_unit   = signal_volume_per_day / driver_count          (from current ingest)
prod_volume_day = rate_per_unit * prod_driver_count * multiplier
prod_cost_month = prod_volume_day * 30 * ingest_price
                + retained_volume(retention_days) * retain_price
```

Default drivers: logs → hosts, traces → services, metrics → hosts, events → hosts.
The user can change a signal's driver.

### State (app state / app settings)

- Rate card per tenant: list-price defaults, overrides, currency.
- Baselines: label, date range, tier-1 and tier-2 snapshot.
- The last production counts entered.

### Scopes (check exact names with `dt-app-mcp` before implementing)

`storage:events:read`, `storage:system:read`, `storage:logs:read`, `storage:spans:read`,
`storage:metrics:read`, `storage:smartscape:read`, `storage:buckets:read`,
`app-state:*` / `app-settings:*` read/write.

### Known gaps, shown in the UI

- Metrics billing arrives about 4 hours late.
- Logs and traces billing is per bucket only.
- Tier-3 bytes are approximate.

---

## Section 2 — Screens and UX (Phase 1)

`AppHeader` navigation. Each page has a `TimeframeSelector`, defaulting to the last 7 days.

1. **Overview**
   - A `SingleValue` per signal: volume, estimated cost, change from the active baseline.
   - A stacked `TimeseriesChart` of daily ingest by signal.
   - A `DonutChart` of cost share.
   - A `DataTable` by bucket.
2. **Signal detail** (a tab per signal), tier-3 breakdown:
   - Logs by `log.source`, k8s namespace or host.
   - Traces by `service.name`.
   - Metrics by `monitoring_source`, then by metric key.
   - Events by `event.billing.category` and `event.provider`.
   - A `CategoricalBarChart` of the top 10 + a `DataTable` with % share.
   - A "Run breakdown" `Button` that shows an estimated scan cost first.
3. **Extrapolate**
   - Detected current drivers, which the user can override.
   - Production counts, multiplier and retention days as `NumberInput`s.
   - Output: a `DataTable` with projected monthly volume and cost per signal and a total, plus CSV export.
4. **Baselines**
   - Save a snapshot (a `Modal` asks for a label).
   - A list of snapshots.
   - A compare view with delta bars per signal.
5. **Settings**
   - The rate card as an editable `DataTable`, with "reset to list".
   - A currency `Select`.

Design rules:

- Strato components only.
- Each signal has one fixed colour from the Strato categorical chart palette, used on every screen.
- Cost figures carry an "estimate, list price" `Chip` until the rate card has been edited.

### Error handling

- Missing scope: a `MessageContainer` names the scope. Only that page is disabled.
- Query budget exceeded or a query fails: an error and retry on that tile. Each query has its own error state.
- Empty or new tenant: a "no billing data yet" state that notes the ~4h delay.
- Driver count of 0: the extrapolation for that signal is greyed out, with a prompt to set the driver manually.
- Corrupt state: the rate card falls back to list prices.

### Testing

- The extrapolation, cost and rate-card maths are pure functions in `shared/`, covered by Jest unit tests including edge cases.
- All DQL queries are constants in one `queries/` module. A script runs each one with
  `dtctl --context sprint query` to check syntax and result shape.
- UI tests use `@testing-library/react` with mocked `useDql`, covering loading, error and empty states.
- `npm run build` and `npm run lint` must pass. Then a manual check in `npx dt-app dev` against `rkj7350h`.

### Things to check before implementing

- Public list prices, from the Dynatrace public rate card. Don't quote them from memory.
- Exact scope names and Strato component APIs, via `dt-app-mcp`.

---

## Section 3 — OpenPipeline flow view (Phase 2)

Inspired by Bindplane's source → destination throughput view.

### Decisions

| Topic | Decision |
|---|---|
| Columns | 3: Sources → Pipelines → Destinations (buckets + data-forwarding targets). Route name shown in the edge tooltip |
| Edge metric | ~GiB/s by default (estimate), toggle to exact records/s |
| Window | `5m \| 1h \| 24h` toggle, independent of the app timeframe |
| Signals | Tabs LOGS / METRICS / TRACES / EVENTS (EVENTS = events, bizevents, system/security/sdlc/davis events) |

### Page "Flow" (sixth nav item)

- **Nodes:** Strato card style, icon per source type, count badge (e.g. hosts behind
  OneAgent, number of API endpoints). Buckets show retention.
- **Edges:** curved paths. Stroke width scales with throughput; the label shows the rate.
- **Hover a node:** its paths animate as a dashed line in Dynatrace blue; everything else dims.
- **Click a node:** opens a `Sheet` with the throughput timeseries for the window.
  - Pipeline: processor list (drop / sample / extract) and its route matchers.
  - Bucket: billed bytes, retention, link to Overview.

### Data

- **Edges:** `dt.sfm.openpipeline.ingest_sources_in.records`, `.routing.records` and
  `.pipelines_out.records`, split by `configuration`, `dt.openpipeline.source`, `route_name`,
  `pipeline_id` and `bucket_name`.
  - Rate = sum over the window ÷ window seconds.
- **Bytes estimate:**
  - Average record size per bucket = billed bytes (billing events) ÷ `pipelines_out` records for
    that bucket, both over the last 24h (billing lags, so always 24h).
  - Edge bytes/s = edge rec/s × average size of the destination bucket.
  - Shown with a `~` and a tooltip that explains the method.
- **Topology names:** settings `builtin:openpipeline.<configuration>.{pipelines,routing,ingest-sources,data-forwarding}`.
  - `pipeline_id` is matched to the pipeline's `customId` / summary. Unknown ids are shown raw.
- **Findings on rkj7350h:** the metrics cover logs, metrics, spans, bizevents, events,
  smartscape.events and system.events. Logs has custom routes (e.g. "AstroShop PaymentService").
  No data-forwarding is configured.

### Rendering

Check with `dt-app-mcp` that Strato has no flow component. Then build it as custom SVG:
`d3-sankey` only for node positions, with Bindplane-style curved paths drawn by us.
Colours come from Strato tokens; signal colours stay the same as Phase 1.

### Edge cases

- No traffic in the window: the node is grey and shows "0".
- Forwarding target without metric data: dashed outline, labelled "configured, no throughput data".
- Missing settings scope: the diagram still draws from the metrics, using raw ids.
- More than 15 sources: the smallest are collapsed into "Other".

### Testing

- Graph building, rate maths and the bytes estimate are pure functions in `src/shared/flow/`,
  written test-first.
- The new queries are added to `scripts/validate-queries.sh`.
- Layout snapshot test with fixtures captured from `rkj7350h`.
