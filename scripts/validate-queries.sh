#!/usr/bin/env bash
# Runs every DQL constant in ui/app/queries against a tenant with dtctl and checks the result shape.
#
# Usage: scripts/validate-queries.sh [--context NAME] [--save-fixtures DIR]
#   --context        dtctl context to use (default: sprint). The global dtctl context is never changed.
#   --save-fixtures  write each query's records to DIR/<name>.json
#
# Billing/driver queries run over the last 7 days, breakdown queries over the last 24 hours,
# flow queries over their own window (1h, or 24h for the 24h window and bucket record counts).
# Fails on a query error, a missing records array, or records that lack the expected fields.
# dtctl drops timeframe/interval from timeseries records, so only the value arrays are checked.
# Zero rows is reported as a warning (a new tenant may have no data yet).
set -euo pipefail

CONTEXT="sprint"
FIXTURES=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --save-fixtures) FIXTURES="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
command -v dtctl >/dev/null || { echo "dtctl not found" >&2; exit 2; }
[[ -n "$FIXTURES" ]] && mkdir -p "$FIXTURES"

iso() { date -u -v"$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "now $2" +%Y-%m-%dT%H:%M:%SZ; }
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
WEEK=$(iso -7d "-7 days")
DAY=$(iso -1d "-1 day")

failed=0
total=0
while IFS= read -r line; do
  total=$((total + 1))
  name=$(jq -r .name <<<"$line")
  tier=$(jq -r .tier <<<"$line")
  fields=$(jq -c .fields <<<"$line")
  hours=$(jq -r '.hours // empty' <<<"$line")
  start=$WEEK; [[ "$tier" == "breakdown" ]] && start=$DAY
  [[ -n "$hours" ]] && start=$(iso "-${hours}H" "-${hours} hours")

  if ! result=$(jq -r .query <<<"$line" | dtctl --context "$CONTEXT" query -f - -o json \
        --series=full --precision 0 \
        --default-timeframe-start "$start" --default-timeframe-end "$NOW" 2>&1); then
    echo "FAIL  $name: query error"; echo "$result" | head -5 | sed 's/^/      /'
    failed=$((failed + 1)); continue
  fi

  verdict=$(jq -r --argjson f "$fields" '
    (.result.records // null) as $r
    | if $r == null then "FAIL no records array"
      elif ($r | length) == 0 then "WARN 0 rows"
      else ([$f[] as $k | select(($r[0] | has($k)) | not) | $k]) as $missing
        | if ($missing | length) > 0 then "FAIL missing fields: \($missing | join(", "))"
          else "OK   \($r | length) rows" end
      end' <<<"$result")

  echo "${verdict%% *}  $name: ${verdict#* }"
  [[ "$verdict" == FAIL* ]] && failed=$((failed + 1))
  if [[ -n "$FIXTURES" && "$verdict" != FAIL* ]]; then
    jq '.result.records' <<<"$result" > "$FIXTURES/$name.json"
  fi
done < <(node scripts/list-queries.mjs 2>/dev/null)

echo "---"
echo "$((total - failed))/$total queries passed (context: $CONTEXT)"
[[ $failed -eq 0 ]]
