#!/usr/bin/env bash
# Read-only GitHub Actions validation summary for remote main or a specified SHA.
# Requires authenticated gh and jq. Never dispatches workflows or modifies GitHub.
set -euo pipefail

repo='maxsail-project/tackbar'
sha=''
as_json=false
usage() {
  cat <<EOF
Inspect TackBar validation for remote main or a selected commit (read-only).
Usage: ${0##*/} [SHA] [--sha|-s SHA] [--repo|-r OWNER/REPO] [--json]
       ${0##*/} --help|-h
Options:
  --sha, -s   Resolve and inspect a commit SHA (abbreviated SHA accepted).
  --repo, -r  Repository (default: maxsail-project/tackbar).
  --json      Print machine-readable results.
  --help, -h  Show this help without contacting GitHub.
Dependencies: authenticated gh, jq.
Examples:
  ${0##*/}
  ${0##*/} --sha a57971f --json
For workflow dispatch, use validate-tackbar.sh.
EOF
}
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

while (( $# )); do
  case "$1" in
    --sha|-s) (( $# >= 2 )) || { usage >&2; exit 2; }; sha=$2; shift 2 ;;
    --repo|-r) (( $# >= 2 )) || { usage >&2; exit 2; }; repo=$2; shift 2 ;;
    --json) as_json=true; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; exit 2 ;;
    *) if [[ -z "$sha" ]]; then sha=$1; shift; else usage >&2; exit 2; fi ;;
  esac
done
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail 'Invalid OWNER/REPO.'
[[ -z "$sha" || "$sha" =~ ^[a-fA-F0-9]{1,40}$ ]] || fail 'Invalid requested SHA.'
for cmd in gh jq; do command -v "$cmd" >/dev/null 2>&1 || fail "Missing dependency: $cmd"; done

if [[ -z "$sha" ]]; then
  sha=$(gh api "repos/$repo/branches/main" --jq '.commit.sha') || fail 'Cannot resolve remote main.'
  source_name='HEAD remoto de main'
else
  sha=$(gh api "repos/$repo/commits/$sha" --jq '.sha') || fail 'Cannot resolve requested SHA.'
  source_name='SHA solicitado'
fi
[[ "$sha" =~ ^[a-fA-F0-9]{40}$ ]] || fail 'Invalid resolved SHA.'
api=$(gh api "repos/$repo/actions/runs?head_sha=$sha&per_page=100") || fail 'Cannot read workflow runs.'
jq -e '(.workflow_runs | type) == "array"' <<<"$api" >/dev/null || fail 'Invalid workflows JSON.'

# Print one tab-separated record: passed, failed, skipped. Missing counts => no record.
extract_counts() {
  local kind=$1
  local line p=0 f=0 s=0 n
  local log
  log=$(cat)  # Consume stdin, removing ANSI color and CR for robust CI log parsing.
  log=$(printf '%s' "$log" | sed -E 's/\x1B\[[0-9;]*[[:alpha:]]//g' | tr '\r' '\n')
  if [[ "$kind" == frontend ]]; then
    line=$(printf '%s\n' "$log" | grep -E 'Tests[[:space:]]*:?[[:space:]]*[0-9]+[[:space:]]+passed' | tail -n 1 || true)
    [[ -n "$line" ]] || return 1
    if [[ "$line" =~ Tests[[:space:]]*:?[[:space:]]*([0-9]+)[[:space:]]+passed ]]; then p=${BASH_REMATCH[1]}; else return 1; fi
  else
    line=$(printf '%s\n' "$log" | grep -E '[0-9]+[[:space:]]+(passed|failed|errors?).*in[[:space:]]+[0-9.]+s' | tail -n 1 || true)
    [[ -n "$line" ]] || return 1
  fi
  if [[ "$kind" == backend && "$line" =~ ([0-9]+)[[:space:]]+passed ]]; then p=${BASH_REMATCH[1]}; fi
  if [[ "$line" =~ ([0-9]+)[[:space:]]+failed ]]; then f=${BASH_REMATCH[1]}; fi
  if [[ "$line" =~ ([0-9]+)[[:space:]]+skipped ]]; then s=${BASH_REMATCH[1]}; fi
  if [[ "$kind" == backend && "$line" =~ ([0-9]+)[[:space:]]+error([^[:alpha:]]|$) ]]; then n=${BASH_REMATCH[1]}; f=$((f+n)); fi
  if [[ "$kind" == backend && "$line" =~ ([0-9]+)[[:space:]]+errors([^[:alpha:]]|$) ]]; then n=${BASH_REMATCH[1]}; f=$((f+n)); fi
  printf '%s\t%s\t%s\n' "$p" "$f" "$s"
}

get_job_log() {
  local run_id=$1 job_id=$2 log
  # Official job log API first; fallback to gh run view, matching PowerShell.
  if log=$(gh api --allow-escape-sequences "repos/$repo/actions/jobs/$job_id/logs" 2>/dev/null) && [[ -n "$log" ]]; then
    printf '%s\n' "$log"
    return 0
  fi
  if log=$(gh run view "$run_id" --repo "$repo" --job "$job_id" --log 2>/dev/null) && [[ -n "$log" ]]; then
    printf '%s\n' "$log"
    return 0
  fi
  return 1
}

results='[]'
for kind in frontend backend; do
  case "$kind" in frontend) name='Validate Frontend (Linux)' ;; backend) name='Validate Backend (Linux)' ;; esac
  run=$(jq -c --arg name "$name" --arg sha "$sha" '[.workflow_runs[] | select(.name == $name and .head_sha == $sha)] | sort_by(.created_at) | reverse | .[0] // null' <<<"$api") || fail 'Invalid workflows JSON.'
  status='NOT RUN' run_id='' url='' passed='' failed='' skipped='' typecheck='' build='' note='Sin ejecucion para este SHA'
  if [[ "$run" != null ]]; then
    jq -e '(.id | type) == "number" and (.status | type) == "string"' <<<"$run" >/dev/null || fail 'Invalid workflow run JSON.'
    run_id=$(jq -r '.id' <<<"$run")
    url=$(jq -r '.html_url // ""' <<<"$run")
    run_status=$(jq -r '.status' <<<"$run")
    status=$run_status
    if [[ "$run_status" == completed ]]; then status=$(jq -r '.conclusion // ""' <<<"$run"); fi
    jobs_json=$(gh api "repos/$repo/actions/runs/$run_id/jobs?per_page=100") || fail 'Cannot read workflow jobs.'
    jq -e '(.jobs | type) == "array"' <<<"$jobs_json" >/dev/null || fail 'Invalid workflow jobs JSON.'
    if [[ "$kind" == frontend ]]; then
      typecheck=$(jq -r '[.jobs[].steps[]? | select(.name == "Typecheck frontend") | .conclusion] | last // ""' <<<"$jobs_json")
      build=$(jq -r '[.jobs[].steps[]? | select(.name == "Build production frontend") | .conclusion] | last // ""' <<<"$jobs_json")
    fi
    note=''
    if [[ "$run_status" == completed ]]; then
      job_id=$(jq -r '[.jobs[] | select(.name | test("Frontend tests|Full backend regression"))][0].id // .jobs[0].id // ""' <<<"$jobs_json")
      if [[ -n "$job_id" ]]; then
        if log=$(get_job_log "$run_id" "$job_id"); then
          if counts=$(printf '%s\n' "$log" | extract_counts "$kind"); then
            IFS=$'\t' read -r passed failed skipped <<<"$counts"
          else
            note='No se encontro resumen de tests en el log del job (consultar enlace del workflow)'
          fi
        else
          note='No se pudo leer el log del job'
        fi
      fi
    else
      note='Ejecucion no terminada'
    fi
  fi
  result=$(jq -n --arg name "$name" --arg status "$status" --arg run_id "$run_id" --arg url "$url" --arg passed "$passed" --arg failed "$failed" --arg skipped "$skipped" --arg typecheck "$typecheck" --arg build "$build" --arg note "$note" '
    def number_or_null($x): if $x == "" then null else ($x | tonumber) end;
    def string_or_null($x): if $x == "" then null else $x end;
    {Workflow:$name, Status:$status, RunId:number_or_null($run_id), URL:string_or_null($url),
      Passed:number_or_null($passed), Failed:number_or_null($failed), Skipped:number_or_null($skipped),
      Typecheck:string_or_null($typecheck), Build:string_or_null($build), Note:$note}')
  results=$(jq -c --argjson item "$result" '. + [$item]' <<<"$results")
done

if [[ "$as_json" == true ]]; then
  jq -n --arg repo "$repo" --arg sha "$sha" --arg source "$source_name" --argjson results "$results" '{Repository:$repo,SHA:$sha,Source:$source,Results:$results}'
else
  printf 'Repositorio: %s\nCommit:      %s (%s)\n\n' "$repo" "$sha" "$source_name"
  printf '%-26s %-12s %7s %6s %7s %-10s %-10s\n' Workflow Status Passed Failed Skipped Typecheck Build
  jq -r '.[] | [.Workflow,.Status,(.Passed // "" | tostring),(.Failed // "" | tostring),(.Skipped // "" | tostring),(.Typecheck // ""),(.Build // "")] | @tsv' <<<"$results" |
  awk -F '\t' '{printf "%-26s %-12s %7s %6s %7s %-10s %-10s\n", $1,$2,$3,$4,$5,$6,$7}'
  jq -r '.[] | select(.URL != null) | "\(.Workflow): \(.URL)"' <<<"$results"
  jq -r '.[] | select(.Note != "") | "WARNING: \(.Workflow): \(.Note)"' <<<"$results" >&2
  counts_count=$(jq '[.[] | select(.Passed != null)] | length' <<<"$results")
  if [[ "$counts_count" == 2 ]]; then
    jq -r '"\nTOTAL: \(map(.Passed)|add) passed | \(map(.Failed)|add) failed | \(map(.Skipped)|add) skipped"' <<<"$results"
  else
    printf '\nTOTAL: incompleto (faltan recuentos de algun workflow)\n'
  fi
fi
