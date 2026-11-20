# Ingest Volume Estimator

> [!WARNING]
> **Not an official Dynatrace product.** Dynatrace does not support this app. You install and
> use it at your own risk, and you take ownership of the source code and all maintenance from
> then on. Read the [Disclaimer](#disclaimer) before you install it.

> **Install it in your environment:** follow [DEPLOYMENT.md](DEPLOYMENT.md).

A Dynatrace platform app that shows how much data a tenant ingests per signal (logs, metrics,
traces, events), what it costs at list price (or your rate card), and what it would cost at
production scale.

- **Plan growth:** measure what a subset of your environment ingests today and project the
  volume and cost when you roll out to all hosts, services or clusters.
- **Optimise:** save a baseline, change what you ingest (drop rules, sampling, retention), then
  compare.

Design: [`docs/plans/2026-11-13-ingest-volume-estimator-design.md`](docs/plans/2026-11-13-ingest-volume-estimator-design.md)

## Pages

| Page | What it shows |
|---|---|
| Overview | Volume, per-day volume and estimated cost per signal, change against the active baseline, daily ingest (volume or cost), cost share, and a table by bucket with retention and stored volume |
| Signals | Top contributors per signal (log source / namespace / host, service, monitoring source / metric key, billing category / provider), plus any signal by a Primary Grail field or primary tag, with the share of data that lacks it. Runs only when you click **Run breakdown**, after it shows an estimated scan size and query cost |
| Extrapolate | Detected current drivers (hosts, services, pods, clusters, containers) with overrides, a driver per signal, production counts, a multiplier and retention days. Shows a projected monthly volume and cost per signal, with CSV export |
| Baselines | Labelled snapshots of per-day ingest and driver counts. Set one active for the Overview, or compare two |
| Settings | The rate card: ingest price, retain price per GiB-day and included retention per signal, plus currency |
| Flow | OpenPipeline sources → pipelines → destinations per signal (LOGS / METRICS / TRACES / EVENTS) over 5m, 1h or 24h. Edges show ~GiB/s or records/s; hover a node to trace its paths, click it for details |

## How it works

| Tier | Source | When |
|---|---|---|
| 1 Billing | `dt.system.events`, `event.kind == "BILLING_USAGE_EVENT"` (Ingest & Process and Retain) | On load |
| 2 Drivers | `smartscapeNodes` counts and Full-Stack / Infrastructure host billing | On load |
| 3 Breakdown | Raw `logs`, `spans`, `events`, `metric.series` (and billing events for metrics and events) | Only on request, last 24 h by default |

Tier 1 is the source of truth for volume and cost. Tier 3 only splits volume into shares.

Extrapolation, per signal:

```
rate_per_unit    = current volume per day / current driver count
prod_per_day     = rate_per_unit × production driver count × multiplier
ingest_cost/mo   = prod_per_day × 30 × ingest price
retain_cost/mo   = prod_per_day × max(0, retention − included days) × retain price × 30
```

All DQL lives in [`ui/app/queries/`](ui/app/queries/). The maths lives in [`ui/app/shared/`](ui/app/shared/)
as pure functions with Jest tests.

### Flow page

- **Edges:** `dt.sfm.openpipeline.routing.records` (source → pipeline, by `route_name`) and
  `dt.sfm.openpipeline.pipelines_out.records` (pipeline → bucket). Source totals come from
  `dt.sfm.openpipeline.ingest_sources_in.records`. Rate = records in the window ÷ window seconds.
- **Pipelines:** when the metrics carry `pipeline_id`, it is matched to the pipeline's `customId`.
  Otherwise the metric `route_name` is matched to a routing entry's description
  in `builtin:openpipeline.<configuration>.routing`, whose `pipelineId` names the pipeline. The
  `default` route is the built-in default pipeline.
- **Pipeline → bucket:** `pipelines_out` has no pipeline dimension without `pipeline_id`. With one
  active pipeline per configuration the edge is exact; with several, a bucket's records are split
  by each pipeline's inflow share and drawn dashed.
- **~bytes/s:** records/s × the bucket's average billed bytes per record (24h billing ÷ 24h
  `pipelines_out` records). Metrics are billed by data points, so METRICS always shows records/s;
  buckets without billing (e.g. fleet or system events) fall back to records/s.
- **EVENTS** covers events, bizevents, system, security, sdlc and Davis events. Smartscape, user
  events and user sessions are not shown.
- More than 15 sources are folded into "Other". Configured forwarding targets without metric
  data are shown dashed.

State is stored in **app state** (shared by all users of the app on the tenant):
`rate-card`, `baselines`, `extrapolation-inputs`.

## Rate card defaults

List prices in USD from the [Dynatrace rate card](https://www.dynatrace.com/pricing/rate-card/),
read 2026-11-13. Other currencies use the rates on
[local currency pricing](https://www.dynatrace.com/pricing/currency-conversion/).

| Signal | Ingest & Process | Retain | Included retention |
|---|---|---|---|
| Logs | $0.20 / GiB | $0.0007 / GiB-day | 0 days (Pay-per-Query) |
| Traces | $0.20 / GiB | $0.0007 / GiB-day | 10 days |
| Metrics | $0.15 / 100k data points | not modelled | 15 months |
| Events | $0.20 / GiB | $0.0007 / GiB-day | 0 days (not published) |

Signal breakdowns use the list query price of $0.0035 per GiB scanned for the scan estimate.
Contracts are usually discounted; enter your own prices in **Settings**. Until you do, cost
figures carry an "estimate, list price" chip.

## Required scopes

Declared in [`app.config.json`](app.config.json). Users also need matching IAM permissions.

| Scope | Used for |
|---|---|
| `storage:system:read` | Billing usage events (all volume and cost figures) |
| `storage:buckets:read` | Bucket retention |
| `storage:smartscape:read` | Entity driver counts |
| `storage:logs:read` | Log breakdown |
| `storage:spans:read` | Trace breakdown |
| `storage:metrics:read` | Metric key breakdown |
| `storage:events:read` | Event provider breakdown |
| `state:app-states:read` / `state:app-states:write` | Rate card, baselines, inputs |
| `settings:objects:read` | OpenPipeline routing, pipelines, ingest sources and forwarding (Flow names and details) |

When a query is denied, that tile shows which scope is missing; the rest of the app still works.
Without `settings:objects:read` the Flow page still draws from metrics, with raw route and
pipeline ids.

## Develop

Requires Node 24 (`.nvmrc`). With Homebrew: `brew install node@24` and put
`/opt/homebrew/opt/node@24/bin` first on your `PATH`.

```bash
npm install
npm run start        # dev server against the tenant in app.config.json
npm run lint
npm run test
npm run test:coverage  # fails below 95% statements/lines, 90% functions, 85% branches
npm run build
```

## Tests

| Type | Where | What it checks |
|---|---|---|
| Unit | `ui/app/shared/**/*.test.ts` | Cost, extrapolation, baselines, rate card, units, timeframe and Flow graph/layout maths |
| Query contract | `ui/app/queries/*.test.ts` | Every DQL constant is well formed, every fixture has the fields the parsers need, and the parsers handle them |
| Hook | `ui/app/hooks/*.test.ts(x)`, `ui/app/context/*.test.tsx` | Persisted state, auto-save debounce, driver merging, timeframe resolution |
| Component | `ui/app/components/**/*.test.tsx` | Signal cards, app shell, Flow canvas and node details |
| Page integration | `ui/app/pages/*.test.tsx`, `ui/app/App.test.tsx` | Routing and user flows on each page (overrides, CSV export, baselines, rate card) against fixture data |
| Live query | `npm run test:queries -- --context <dtctl-context>` | Runs every query against a real tenant and checks the result shape |

Check every query against a tenant with dtctl (it never changes your current dtctl context):

```bash
scripts/validate-queries.sh --context sprint
```

`--save-fixtures ui/app/queries/__fixtures__` refreshes the test fixtures. Anonymise host names
before you commit them.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for installing the app in your own environment: prerequisites,
who can use it, updates, optional CI/CD deployment and troubleshooting.

## Limitations

- Metrics billing arrives about 4 hours late, so the last hours of a timeframe under-count metrics.
- Logs and traces billing is split by bucket only. Finer splits come from tier-3 breakdowns,
  which measure content length (logs) or counts (spans, events, series), not billed bytes.
- Full-Stack Monitoring includes a trace and custom-metric allowance whose size isn't published,
  so trace and metric costs can be overstated for Full-Stack hosts.
- Retain cost on the Overview uses average stored bytes from Retain events × days × retain price.
  The projection assumes steady state.
- Query (scan) costs are only estimated for breakdowns; they aren't part of the projection.
- Driver counts come from Smartscape at query time, not over the timeframe; host counts also
  use billed hosts and take the larger value.
- Flow throughput comes from self-monitoring metrics, which can lag a few minutes; the 5m
  window may under-count. Bytes on the Flow page are estimates (see above).
- Flow pipeline → bucket edges are estimated when several pipelines in one configuration are
  active and the metrics carry no `pipeline_id`.

## Disclaimer

**This app is not an official Dynatrace product and is not supported by Dynatrace.** It is
sample code, shared as a convenience and provided "as is", without warranty of any kind,
express or implied, including fitness for a particular purpose.

By installing, deploying or using this app, you acknowledge and accept that:

- **No support.** Dynatrace Support, product SLAs and the Dynatrace documentation don't cover
  it. Don't raise support tickets with Dynatrace about it.
- **You use it at your own risk.** You are responsible for reviewing the code, the scopes it
  requests (see [Required scopes](#required-scopes)) and who in your organisation can use it,
  before you deploy it to any environment.
- **You own it.** Once you take a copy of this repository, you own that copy and everything
  that follows from it. That includes maintenance, bug fixes, security patches, dependency
  upgrades, and keeping it working as the Dynatrace platform, SDKs and Strato components change.
  Nobody is obliged to provide updates.
- **Figures are estimates.** Volume, cost and projection figures are estimates for planning.
  They are not quotes, invoices or contractual commitments. Your Dynatrace contract and billing
  data are authoritative.
- **No liability.** To the maximum extent permitted by law, neither Dynatrace nor the authors
  are liable for any loss, damage, cost or claim arising from installing or using this app,
  including any effect on your Dynatrace environment, data or consumption.

If you don't accept these terms, don't install the app.
