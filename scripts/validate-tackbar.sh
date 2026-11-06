#!/usr/bin/env bash
# Manual TackBar Linux validation via GitHub Actions.
# Requires authenticated gh and jq. Dispatches exactly once per selected workflow.
# Does not modify repository files, stage/commit/push, release or deploy.
set -euo pipefail

repo='maxsail-project/tackbar'
usage() {
  cat <<EOF
Dispatch TackBar validation for the remote main commit (writes GitHub Actions runs).
Usage: ${0##*/} frontend|backend|both [--wait|-w]
       ${0##*/} --help|-h
Options:
  --wait, -w  Wait for completion and fail if a workflow fails.
  --help, -h  Show this help without contacting GitHub.
Dependencies: authenticated gh, jq.
Examples:
  ${0##*/} frontend
  ${0##*/} both --wait
For read-only inspection, use get-validation.sh.
EOF
}
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

if [[ ${1-} == --help || ${1-} == -h ]]; then usage; exit 0; fi
[[ $# -ge 1 && $# -le 2 ]] || { usage >&2; exit 2; }
target=$1
case "$target" in frontend|backend|both) ;; *) usage >&2; exit 2 ;; esac
wait_flag=false
if (( $# == 2 )); then
  case "$2" in --wait|-w) wait_flag=true ;; *) usage >&2; exit 2 ;; esac
fi
for cmd in gh jq; do command -v "$cmd" >/dev/null 2>&1 || fail "Missing dependency: $cmd"; done

account=$(gh api user --jq '.login') || fail 'Cannot authenticate with GitHub CLI (gh auth login).'
printf 'GitHub account: %s\n' "$account"
expected_sha=$(gh api "repos/$repo/branches/main" --jq '.commit.sha') || fail 'Cannot read remote main SHA.'
[[ "$expected_sha" =~ ^[a-fA-F0-9]{40}$ ]] || fail 'Could not resolve an unambiguous remote main SHA.'
printf 'Expected remote main SHA: %s\n' "$expected_sha"

if [[ "$target" == both ]]; then selected=(backend frontend); else selected=("$target"); fi
failed=false
for which in "${selected[@]}"; do
  case "$which" in
    frontend) workflow='validate-frontend-linux.yml' ;;
    backend) workflow='validate-backend-linux.yml' ;;
  esac
  printf '\nPreparing %s validation: %s\n' "$which" "$workflow"
  query=(run list -R "$repo" -w "$workflow" -b main -e workflow_dispatch -L 50 --json databaseId,headSha,url,status,conclusion)
  prior=$(gh "${query[@]}") || fail "Cannot list previous $workflow runs."
  prior_ids=$(jq -ec 'if type == "array" and all(.[]; (.databaseId | type) == "number") then [.[].databaseId | tostring] else error("invalid run list") end' <<<"$prior") || fail 'Invalid previous runs JSON.'

  # No automatic dispatch retry. A failure is reported, not silently repeated.
  if ! gh workflow run "$workflow" --ref main -R "$repo"; then
    warn "Dispatch failed for $workflow; inspect GitHub Actions."
    failed=true
    continue
  fi

  new_run=''
  ambiguous=false
  candidate_id=''
  for ((attempt=1; attempt<=12; attempt++)); do
    sleep 2
    current=$(gh "${query[@]}") || fail "Cannot identify new $workflow run."
    new=$(jq -ec --argjson ids "$prior_ids" 'if type == "array" and all(.[]; (.databaseId | type) == "number" and (.headSha | type) == "string" and (.url | type) == "string") then [.[] | select((.databaseId | tostring) as $id | ($ids | index($id) | not))] else error("invalid run list") end' <<<"$current") || fail 'Invalid runs JSON.'
    new_count=$(jq 'length' <<<"$new")
    if (( new_count > 1 )); then ambiguous=true; break; fi
    if (( new_count == 1 )); then
      new_run=$(jq -c '.[0]' <<<"$new")
      run_id=$(jq -r '.databaseId' <<<"$new_run")
      # Observe the same sole new run twice; a second dispatch may be arriving.
      if [[ "$candidate_id" == "$run_id" ]]; then break; fi
      candidate_id=$run_id
      new_run=''
    else
      candidate_id=''
    fi
  done
  if [[ "$ambiguous" == true ]]; then
    warn "More than one new $workflow run appeared; cannot attribute safely."
    failed=true
    continue
  fi
  if [[ -z "$new_run" ]]; then
    warn "Dispatch requested, but no new run identified: https://github.com/$repo/actions/workflows/$workflow"
    failed=true
    continue
  fi
  run_id=$(jq -r '.databaseId' <<<"$new_run")
  run_sha=$(jq -r '.headSha' <<<"$new_run")
  run_url=$(jq -r '.url' <<<"$new_run")
  printf 'Run: %s\nExecuted SHA: %s\n' "$run_url" "$run_sha"
  if [[ "$run_sha" != "$expected_sha" ]]; then
    warn 'Run SHA differs from remote main SHA captured before dispatch; validation not attributable.'
    failed=true
    continue
  fi

  watch_exit=0
  if [[ "$wait_flag" == true ]]; then
    gh run watch "$run_id" --exit-status -R "$repo" || watch_exit=$?
  fi
  details=$(gh run view "$run_id" -R "$repo" --json status,conclusion,headSha,url) || fail 'Cannot view workflow run.'
  jq -e '(.status | type) == "string" and (.headSha | type) == "string" and (.url | type) == "string"' <<<"$details" >/dev/null || fail 'Invalid workflow details JSON.'
  status=$(jq -r '.status // ""' <<<"$details")
  conclusion=$(jq -r '.conclusion // ""' <<<"$details")
  detail_sha=$(jq -r '.headSha // ""' <<<"$details")
  detail_url=$(jq -r '.url // ""' <<<"$details")
  printf 'Status: %s; Conclusion: %s\n' "$status" "$conclusion"
  printf 'JUnit and test counts: open the GitHub Actions Summary and Artifacts on %s\n' "$detail_url"
  if [[ "$detail_sha" != "$expected_sha" ]]; then warn 'Viewed run SHA differs from expected SHA.'; failed=true; fi
  if [[ "$wait_flag" == true && ( "$watch_exit" -ne 0 || "$conclusion" != success ) ]]; then failed=true; fi
done
[[ "$failed" == false ]]
