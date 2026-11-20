# Ingest Volume Estimator — Phase 1 Implementation Plan

Design: [2026-11-13-ingest-volume-estimator-design.md](2026-11-13-ingest-volume-estimator-design.md)
Branch: `ingest-volume-estimator`
App dir: `apps/ingest-volume-estimator/`
App id: `my.ingest.volume.estimator`
Dev tenant: `https://rkj7350h.sprint.apps.dynatracelabs.com` (dtctl `--context sprint`)

Phase 2 (OpenPipeline flow view) is out of scope here.

## Ground rules

- Look up every Strato component and SDK API with `dt-app-mcp` (`get_strato_component`,
  `get_sdk`, `get_experience_standard`) before using it. Don't rely on memory.
- Use Strato components only. Colours come from `@dynatrace/strato-design-tokens`.
- Use TDD for everything under `src/shared/`: write a failing test, implement, make it pass.
- All DQL lives in `src/queries/`. No inline DQL in components.
- After every task: `npm run lint && npm run test && npm run build` must pass, then commit.
- Don't hard-code tenant values. The environment URL is set only in `app.config.json`,
  where `DT_APP_ENVIRONMENT_URL` can override it.

## Validated DQL (rkj7350h, 2026-11-13)

```dql
// Q1 ingest totals by signal + bucket
fetch dt.system.events, from: $from, to: $to
| filter event.kind == "BILLING_USAGE_EVENT" and endsWith(event.type, "Ingest & Process")
| fieldsAdd bytes = coalesce(toDouble(billed_bytes), toDouble(ingested_bytes), 0.0),
            dp = coalesce(toDouble(data_points), 0.0),
            spans = coalesce(toDouble(ingested_spans), 0.0)
| summarize {bytes = sum(bytes), dp = sum(dp), spans = sum(spans)}, by:{event.type, usage.bucket}

// Q2 daily trend by signal
... same filter + fieldsAdd, plus ts = toTimestamp(usage.start)
| makeTimeseries {bytes = sum(bytes), dp = sum(dp)}, by:{event.type}, interval:1d, time:ts

// Q3 host drivers (host-hours + distinct hosts)
fetch dt.system.events, from: $from, to: $to
| filter event.kind == "BILLING_USAGE_EVENT"
  and in(event.type, {"Full-Stack Monitoring", "Infrastructure Monitoring"})
| summarize {gibh = sum(billed_gibibyte_hours), hosts = countDistinct(dt.smartscape.host)}, by:{event.type}

// Q4 entity drivers
smartscapeNodes "*" | filter in(type, {"HOST","SERVICE","K8S_POD","K8S_CLUSTER","CONTAINER"})
| summarize n = count(), by:{type}

// Q5 buckets / retention
fetch dt.system.buckets
| fields name, display_name, dt.system.table, retention_days, estimated_uncompressed_bytes, records
```

Lessons from validation:

- `makeTimeseries` needs a bare field, so compute fields in `fieldsAdd` first.
- There is no `strlen` function; use `stringLength`.
- `rkj7350h` has no K8s entities, so drivers must handle a count of 0 (see design: grey out and prompt for a manual value).
- Retain events carry `billed_bytes` (stored bytes) per bucket.

---

## Task 0 — Environment

1. Install Node 24 next to the existing v26 (`nvm install 24` or `fnm`), and add `.nvmrc` with `24` in the app dir.
2. Restart the Claude session. Check that `dynatrace-sprint` and `dt-app-mcp` are active.
3. Ask `dt-app-mcp`: "Which Strato component can I use to display a numeric return value of a DQL query?"

Done when: `node --version` shows v24 and both MCP servers respond.

## Task 1 — Scaffold

1. `npx dt-app create ingest-volume-estimator --environment-url https://rkj7350h.sprint.apps.dynatracelabs.com` inside `apps/`.
2. Set `app.config.json`:
   - id `my.ingest.volume.estimator`, name "Ingest Volume Estimator"
   - scopes from the design, with names checked via `dt-app-mcp`
3. Make sure `CLAUDE.md`/`AGENTS.md` from the template exists in the app dir.
4. `npx dt-app dev` and check that the template page loads against `rkj7350h` (SSO).

Commit: `feat: scaffold ingest volume estimator app`.

## Task 2 — Shared domain model + maths (TDD)

Files: `src/shared/signals.ts`, `src/shared/units.ts`, `src/shared/extrapolate.ts`,
`src/shared/cost.ts`, `src/shared/rateCard.ts`, plus `*.test.ts`.

- `signals.ts`:
  - `Signal = 'logs' | 'traces' | 'metrics' | 'events'`
  - maps `event.type` to `Signal` and Retain types to `Signal`
  - the unit per signal (GiB for logs, traces and events; data points for metrics)
  - a fixed colour token per signal
- `units.ts`: bytes ↔ GiB, number formatting.
- `extrapolate.ts`:
  - `ratePerUnit(volumePerDay, driverCount)` returns `null` when the count is 0
  - `projectDaily(rate, prodCount, multiplier)`
  - `projectMonthly(daily, days = 30)`
- `cost.ts`:
  - `ingestCost(volume, price)`
  - `retainCost(dailyVolume, retentionDays, includedDays, pricePerGiBDay)`
  - `totalCost(...)`
- `rateCard.ts`:
  - `RateCard` type
  - `LIST_PRICES` constant, filled in Task 3
  - `mergeRateCard(stored)` falls back to list prices on missing or corrupt input
  - `isListPrice(card)`

Tests cover: zero or negative drivers, a multiplier of 0, NaN input, retention ≤ included days,
corrupt stored JSON.

Commit: `feat: add volume, extrapolation and cost domain logic`.

## Task 3 — List prices

1. Fetch the public Dynatrace rate card (dynatrace.com/pricing / rate card PDF). Record each price
   with its source URL and date in `src/shared/rateCard.ts` comments:
   - logs, traces and events ingest per GiB
   - metrics per 100k data points
   - retain per GiB-day
   - included retention days
2. If anything is unclear (region, currency, edition), stop and ask the user.

Commit: `feat: add list-price rate card defaults`.

## Task 4 — Query layer

Files: `src/queries/billing.ts` (Q1–Q3, plus Retain), `src/queries/drivers.ts` (Q4),
`src/queries/buckets.ts` (Q5), `src/queries/breakdown.ts` (tier 3, below),
`src/queries/parse.ts` + tests.

Tier-3 breakdown queries, default 24h, top 10:

- logs by `log.source`, `k8s.namespace.name`, `host.name`, using `sum(stringLength(content))` and `count()`
- spans by `service.name`, using `count()`
- metrics by `monitoring_source`, then by metric key
- events by `event.billing.category` and `event.provider`

Other files:

- `parse.ts`: turns DQL records into typed rows (strings to numbers, `event.type` to `Signal`).
  Unit-tested with fixture records captured from `rkj7350h`.
- `scripts/validate-queries.sh`: runs every query constant through
  `dtctl --context sprint query ... -o json` and fails on error or empty shape.

Commit: `feat: add DQL query layer with validation script`.

## Task 5 — Data hooks + state

Files: `src/hooks/useIngestTotals.ts`, `useIngestTrend.ts`, `useDrivers.ts`, `useBuckets.ts`,
`useBreakdown.ts` (lazy: runs only when triggered), `useRateCard.ts`, `useBaselines.ts`.

- Wrap `useDql` from `@dynatrace-sdk/react-hooks`. Each hook returns `{data, isLoading, error, refetch}`.
- `useRateCard` / `useBaselines` use app state or app settings (choose via `dt-app-mcp` `get_sdk`).
  Read with `mergeRateCard`.
- Shared timeframe context: `src/context/Timeframe.tsx`, default last 7d.

Commit: `feat: add data hooks and persisted state`.

## Task 6 — Shell + shared UI

Files: `src/App.tsx`, `src/components/AppShell.tsx`, `src/components/QueryState.tsx`,
`src/components/EstimateChip.tsx`, `src/components/MissingScope.tsx`.

- `AppHeader` navigation with routes Overview / Signals / Extrapolate / Baselines / Settings.
- A `TimeframeSelector` in the page header.
- `QueryState`: shared loading, error-with-retry and empty states.
- `EstimateChip` shows "estimate, list price" while `isListPrice`.
- `MissingScope` is a `MessageContainer` naming the missing scope.

Commit: `feat: add app shell and shared state components`.

## Task 7 — Overview page

- A `SingleValue` per signal: volume, estimated cost, change from the active baseline when one is set.
- A stacked `TimeseriesChart` from Q2, using the signal colours.
- A `DonutChart` of cost share.
- A `DataTable` by bucket with retention (Q1 + Q5).
- A "no billing data yet (~4h delay)" empty state.

Commit: `feat: add overview page`.

## Task 8 — Signal detail page

- Tabs per signal. A "Run breakdown" `Button` shows a scan-cost hint (timeframe × signal),
  then runs `useBreakdown`.
- A `CategoricalBarChart` of the top 10 + a `DataTable` with % share.
- A note that content bytes are smaller than billed bytes.

Commit: `feat: add signal breakdown page`.

## Task 9 — Extrapolate page

- Detected drivers from Q3 + Q4, which the user can override.
- Driver choice per signal, with the design defaults.
- Production counts, multiplier and retention days as `NumberInput`s.
- Output `DataTable`: per signal, current/day, rate per unit, production/day, production/month, cost/month, plus a total.
- A greyed-out row with a "set driver manually" prompt when the driver count is 0.
- CSV export via a `Button`.
- The last inputs are saved to state.

Commit: `feat: add extrapolation page`.

## Task 10 — Baselines page

- "Save snapshot" opens a `Modal` for the label. It stores the timeframe plus Q1 and Q3/Q4 results.
- A list of snapshots with delete and "set active".
- A compare view: pick two snapshots, show delta bars per signal (absolute and %).

Commit: `feat: add baselines page`.

## Task 11 — Settings page

- The rate card as an editable `DataTable`, with "reset to list" and a currency `Select`.
- Values are validated (non-negative numbers).

Commit: `feat: add rate card settings page`.

## Task 12 — Verify + package

1. Run `scripts/validate-queries.sh` against `rkj7350h`.
2. Run `npm run lint && npm run test && npm run build`.
3. Walk through every page in `npx dt-app dev`, including error states: revoke a scope, try a
   timeframe with no data, set a driver to 0.
4. Check Overview totals against a direct dtctl Q1 run: they should match within rounding.
5. Run `npx dt-app deploy` to `rkj7350h`.
6. Write the README in the app dir: purpose, deploying to other tenants
   (`DT_APP_ENVIRONMENT_URL`), required scopes, limitations.

Commit: `docs: add app README`. Then ask the user before pushing or opening a PR.

---

# Phase 2 — OpenPipeline flow view (approved 2026-11-13)

Design: Section 3 of the design doc. The same ground rules apply (dt-app-mcp lookups, Strato only,
TDD in `src/shared/`, lint/test/build pass and a commit per task, `dtctl --context sprint`).

Validated DQL (rkj7350h):

```dql
timeseries r = sum(dt.sfm.openpipeline.routing.records), from: $from, to: $to, interval: $i,
  by:{configuration, dt.openpipeline.source, pipeline_id, route_name}
timeseries r = sum(dt.sfm.openpipeline.pipelines_out.records), from: $from, to: $to, interval: $i,
  by:{configuration, pipeline_id, bucket_name}
```

Settings: `dtctl --context sprint get settings --schema builtin:openpipeline.logs.routing -o json`
(and `.pipelines`, `.ingest-sources`, `.data-forwarding`, for each configuration).

## Task 13 — Flow domain model (TDD)

Files: `src/shared/flow/graph.ts`, `rates.ts`, `bytesEstimate.ts`, `collapse.ts`, plus tests.

- Build `{nodes, edges}` from the three metric result sets plus settings
  (sources → pipelines → destinations).
- Map `configuration` to a signal tab.
- Rate = sum ÷ window seconds. Edge bytes/s = rec/s × the bucket's average record size.
- Collapse sources beyond 15 into "Other".
- Edge cases: unknown pipeline id, `<NoBucket>`, nil values, zero traffic.

Capture fixtures from rkj7350h into `src/shared/flow/__fixtures__/`.

## Task 14 — Flow queries + settings access

- `src/queries/flow.ts`: the edge queries and the 24h bucket record counts. Add them to the validate script.
- Read the settings schemas via the SDK (check the scope name with dt-app-mcp) and add the scope to `app.config.json`.
- Hooks `useFlowMetrics(signal, window)` and `useFlowTopology(signal)`. The topology hook
  falls back to raw ids when the scope is missing.

## Task 15 — Layout + SVG renderer

- `src/components/flow/FlowCanvas.tsx`: `d3-sankey` for node positions only, our own
  curved paths, stroke width scaled to the rate.
- Node cards (icon, name, badge), edge labels (~GiB/s or rec/s).
- Hover: animated dashed line in Dynatrace blue, everything else dimmed.
- Strato tokens for all colours.
- Snapshot test with fixtures.

## Task 16 — Flow page

- `src/pages/Flow.tsx`: signal tabs, `5m | 1h | 24h` toggle, bytes ↔ records toggle, legend explaining `~`.
- Empty, error and missing-scope states via the existing `QueryState` / `MissingScope`.
- Add it to the `AppHeader` navigation.

## Task 17 — Node detail sheet

- A `Sheet` with the node's throughput `TimeseriesChart` for the window.
- Pipeline: processors (type, description, enabled) and route matchers.
- Bucket: billed bytes, retention, link to Overview.
- Forwarding target: config summary.

## Task 18 — Verify + deploy

1. Run the validate script, then lint, test and build.
2. Check that edge rec/s for one route matches a direct dtctl query.
3. Check every signal tab and window in `npx dt-app dev`.
4. Deploy to rkj7350h with a version bump.
5. Update the README.
6. Ask the user before pushing.
