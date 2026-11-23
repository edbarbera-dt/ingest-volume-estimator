# Changelog

All notable changes to Ingest Volume Estimator. Versions match `version` in `app.config.json`.

## [1.1.0] - 2026-11-23

### Changed

- **Extrapolate rebuilt around cost units.** Each signal's volume is split by percent across
  drivers (hosts, services, K8s pods, K8s clusters, containers), rather than being tied to one driver.
- Shows the current monthly cost of one of each driver, per signal and in total.
- Projects cost from user-defined cost units: named bundles of drivers, each with a quantity and a
  traffic factor, that can be added, duplicated and removed. The first unit mirrors the current
  environment, so the projection starts at today's cost.
- Compares projected cost with current cost per signal and in total. The CSV export has sections
  per signal, per unit and per driver.
- Warns when volume is split onto a driver whose current count is 0, or when a signal is split onto no driver.

### Fixed

- Rate card prices converted to another currency are rounded (ingest to 2 dp, retain to 4
  significant figures) and no longer drift when switching currencies back and forth.

### Migration

- Saved extrapolation inputs move to a new format. Inputs from earlier versions migrate
  automatically: each signal gets 100% on its old driver, and the old production counts and
  multiplier become one "Production" unit.

## [1.0.4] - 2026-11-20

### Added

- Signals: break any signal down by a Primary Grail field or a custom primary tag
  (`primary_tags.<key>`), with the share of volume that has no value for it.
- README and deployment guide state that the app is not an official Dynatrace product and is not
  supported by Dynatrace.

## [1.0.3] - 2026-11-20

### Security

- Upgraded `react-router-dom` to 7.18.6 to fix GHSA-wrjc-x8rr-h8h6 and GHSA-337j-9hxr-rhxg.

## [1.0.2] - 2026-11-20

### Added

- App logo in the launcher.
- `DEPLOYMENT.md`: guide for deploying the app to your own environment, covering prerequisites,
  permissions, first-time setup, updates, optional pipeline deployment, uninstalling and troubleshooting.

## [1.0.1] - 2026-11-20

### Changed

- Production-ready release (1.0.0 was not deployed separately). POC wording was removed from the
  UI, CSV export and docs: current ingest now scales to "production".
- Saved driver overrides are renamed from `pocOverrides` to `driverOverrides`. Older saved inputs
  still load.

### Added

- Test coverage expanded from 258 to 491 tests: page, routing, hook, component, query contract
  and Flow/baseline edge cases.
- `npm run test:coverage` with enforced thresholds, and `npm run test:queries` for live DQL validation.
- `package-lock.json` committed for reproducible installs.

## [0.2.0] - 2026-11-13

### Added

- First release, with these pages:
  - **Overview:** volume, per-day volume and estimated cost per signal, change against a
    baseline, daily ingest, cost share, and buckets with retention.
  - **Signals:** top contributors per signal, run on demand after a scan-cost estimate.
  - **Extrapolate:** one driver per signal, production counts, a multiplier and retention days,
    giving a projected monthly volume and cost, with CSV export.
  - **Baselines:** labelled snapshots of ingest and driver counts.
  - **Settings:** rate card and currency.
  - **Flow:** OpenPipeline sources → pipelines → destinations per signal.
