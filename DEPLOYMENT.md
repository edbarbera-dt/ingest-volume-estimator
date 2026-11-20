# Deploying Ingest Volume Estimator

This guide takes you from a fresh clone of this repository to the app running in your own
Dynatrace environment. You don't need to change any code.

> [!WARNING]
> This app is not an official Dynatrace product and is not supported by Dynatrace. By deploying
> it you accept the [Disclaimer](README.md#disclaimer): you install it at your own risk, and you
> own the source code and its maintenance from then on.

## 1. Check your environment

| Requirement | Why |
|---|---|
| Dynatrace SaaS with Grail and AppEngine (URL like `https://<tenant-id>.apps.dynatrace.com`) | The app runs on AppEngine and reads Grail |
| Dynatrace Platform Subscription (DPS) | Volumes and costs come from DPS billing usage events in `dt.system.events` |
| OpenPipeline (optional) | Only the Flow page needs it |

## 2. Check your permissions

The person who deploys needs this IAM permission:

```text
ALLOW app-engine:apps:install;
```

`app-engine:apps:delete` is also needed to uninstall the app later. Environment admins usually
have both.

## 3. Install the tools

- **Node.js 24.** The exact version is in `.nvmrc`. With nvm, run `nvm install && nvm use`. With
  Homebrew, run `brew install node@24` and put `$(brew --prefix node@24)/bin` first on your
  `PATH`.
- **Git.**

Check the version:

```bash
node -v   # v24.x
```

## 4. Get the code

```bash
git clone https://github.com/edbarbera-dt/ingest-volume-estimator.git
cd ingest-volume-estimator
npm ci
```

`npm ci` installs the exact dependency versions from `package-lock.json`.

Optionally, check the code before you deploy it:

```bash
npm run lint
npm test
```

## 5. Point the app at your environment

Choose one of these options.

**Option A: per command (recommended).** Leave the repository unchanged and pass the URL when
you deploy (step 6).

**Option B: in the config.** Set `environmentUrl` in `app.config.json`:

```json
"environmentUrl": "https://<tenant-id>.apps.dynatrace.com/"
```

### App ID

The app installs as `my.ingest.volume.estimator`. Keep that ID unless one of these applies:

- you want to run two copies side by side, for example a test build and a stable build
- another team has already installed an app with that ID in your environment

In either case, change `app.id` in `app.config.json`, for example to
`my.acme.ingest.volume.estimator`. Each ID is a separate app with its own saved settings.

## 6. Deploy

Option A:

```bash
npx dt-app deploy --environment-url https://<tenant-id>.apps.dynatrace.com
```

Option B:

```bash
npm run deploy
```

The command builds the app, opens a browser so you can sign in with SSO, and installs the app.
When it finishes, it prints the app URL:

```text
✔ App is deployed
Open your deployed app: 'https://<tenant-id>.apps.dynatrace.com/ui/apps/my.ingest.volume.estimator'
```

You'll also find the app in the Dynatrace launcher under **Ingest Volume Estimator**.

## 7. Who can use it

The app is built for Dynatrace environment administrators. It reports ingest and cost across the
whole environment, so it needs to read all billing, log, trace, metric, event and Smartscape data.
Administrators already have every permission it needs, so you don't need any extra IAM
configuration.

If someone without full access opens the app, each affected tile names the missing permission.
For reference, the app uses:

| Permission | Used for |
|---|---|
| `storage:system:read` | All volume and cost figures (billing events) |
| `storage:buckets:read` | Bucket retention on the Overview |
| `storage:smartscape:read` | Host, service, pod, cluster and container counts |
| `storage:logs:read`, `storage:spans:read`, `storage:metrics:read`, `storage:events:read` | Breakdowns on the Signals page |
| `state:app-states:read` / `write` | Saving the rate card, baselines and extrapolation inputs |
| `settings:objects:read` | OpenPipeline names and details on the Flow page |

The rate card, baselines and extrapolation inputs are saved once per environment, so every
administrator who uses the app sees and edits the same values.

## 8. First-time setup

1. Open **Settings** and enter your contract prices for each signal and your currency. Until you
   do, every cost shows an "estimate, list price" chip.
2. Open **Overview** and pick a timeframe. Seven days or more gives stable per-day figures.
3. Optionally, save a **Baseline** now, so you can measure the effect of later optimisations.

## Updating to a new version

```bash
git pull
npm ci
npx dt-app deploy --environment-url https://<tenant-id>.apps.dynatrace.com
```

Saved settings, baselines and inputs are kept across updates.

AppEngine won't install a version number that is already installed with different contents. If
you change the code yourself, raise `app.version` in `app.config.json` (for example `1.0.1` →
`1.0.2`) before each deploy. Otherwise the deploy fails with:

```text
Cannot install app with version 1.0.1 because the same version is already installed with a different checksum.
```

## Optional: deploying from a pipeline (no browser)

You only need this if you change the code often and want to deploy automatically. For
CI/CD, `dt-app` can authenticate without SSO. Set one of these:

| Variable | Value |
|---|---|
| `DT_APP_OAUTH_CLIENT_ID` + `DT_APP_OAUTH_CLIENT_SECRET` | An OAuth client with the `app-engine:apps:install` scope |
| `DT_APP_PLATFORM_TOKEN` | A platform token with the `app-engine:apps:install` scope |

Store these values in your CI secret store, never in the repository. Then run:

```bash
npm ci
npx dt-app deploy --environment-url "$DT_ENVIRONMENT_URL" --non-interactive
```

`DT_APP_ENVIRONMENT_URL` can replace `--environment-url`.

To build an archive without installing it, for example to hand it to another team or an
approval process, run:

```bash
npx dt-app deploy --dry-run
```

This writes a `.zip` bundle to `out/`.

## Uninstalling

```bash
npx dt-app uninstall --environment-url https://<tenant-id>.apps.dynatrace.com
```

Uninstalling removes the app and its app state. That is the only place the app saves the rate card,
baselines and extrapolation inputs, so they are deleted too. Note down your rate card and export any
projections (CSV) you need before you uninstall.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `node: command not found`, or an engine warning about Node | Install Node 24 (step 3) |
| Deploy fails with "same version is already installed with a different checksum" | Raise `app.version` in `app.config.json` (see "Updating to a new version") |
| Deploy fails with a permission or authorization error | You don't have `app-engine:apps:install` (step 2) |
| The browser doesn't open for SSO | Open the URL printed in the terminal by hand, or use pipeline deployment |
| A tile says a scope or permission is missing | The user isn't a full administrator. Grant the named permission (step 7) or use an admin account |
| All volumes are 0 | The environment has no DPS billing events yet, or the timeframe is too short. Try the last 7 days |
| Metrics look low for the last few hours | Metrics billing arrives about 4 hours late (see Limitations in the README) |
| A breakdown on the Signals page is slow or costly | Breakdowns scan raw data. Check the scan estimate before you click **Run breakdown**, and use a shorter timeframe |
