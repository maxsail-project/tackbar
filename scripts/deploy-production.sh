#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <existing-release-tag>" >&2
  exit 64
fi

target_tag="$1"
checkout_dir="/opt/tackbar"
frontend_dir="$checkout_dir/frontend"
target_ref="refs/tags/$target_tag"

if ! git check-ref-format "$target_ref"; then
  echo "Invalid release tag '$target_tag'." >&2
  exit 64
fi

cd "$checkout_dir"

if ! worktree_status="$(git status --porcelain)"; then
  echo "Production worktree could not be inspected; refusing to switch releases." >&2
  exit 1
fi

if [ -n "$worktree_status" ]; then
  echo "Production worktree is not clean; refusing to switch releases." >&2
  exit 1
fi

current_commit="$(git rev-parse HEAD)"
git fetch --tags origin

if ! target_commit="$(git rev-parse --verify --quiet "${target_ref}^{commit}")"; then
  echo "Release tag '$target_tag' does not exist locally after fetching tags." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/v0.6.1^{commit}" >/dev/null && \
  ! git merge-base --is-ancestor "refs/tags/v0.6.1" "$target_commit"; then
  echo "Release '$target_tag' predates the OVH mailbox baseline." >&2
  echo "Restore the corresponding mailbox runtime configuration manually before retrying." >&2
  exit 1
fi

backend_requirements_changed=false
if ! git diff --quiet "$current_commit" "$target_commit" -- \
  backend/requirements.txt; then
  backend_requirements_changed=true
fi

frontend_manifests_changed=false
if ! git diff --quiet "$current_commit" "$target_commit" -- \
  frontend/package.json frontend/package-lock.json; then
  frontend_manifests_changed=true
fi

if [ "$backend_requirements_changed" = true ]; then
  target_requirements_file="$(mktemp)"

  cleanup_target_requirements() {
    rm -f -- "$target_requirements_file"
  }
  trap cleanup_target_requirements EXIT

  git show "${target_commit}:backend/requirements.txt" > "$target_requirements_file"
  /opt/tackbar/.venv/bin/python -m pip install -r "$target_requirements_file"

  cleanup_target_requirements
  trap - EXIT
fi

git checkout --detach "$target_ref"
checked_out_commit="$(git rev-parse HEAD)"

if [ "$checked_out_commit" != "$target_commit" ]; then
  echo "Checked-out commit does not match requested release tag '$target_tag'." >&2
  exit 1
fi

echo "Checked-out release: $target_tag"
echo "Commit: $checked_out_commit"

prepare_frontend() {
  cd "$frontend_dir" || return

  if [ "$frontend_manifests_changed" = true ]; then
    npm ci || return
  elif ! npm ls --all; then
    npm ci || return
  fi

  VITE_APP_VERSION="$target_tag" npm run build
}

if prepare_frontend; then
  :
else
  preparation_status="$?"
  echo "Frontend dependency preparation or build failed; restoring the previous checkout." >&2
  if ! git -C "$checkout_dir" checkout --detach "$current_commit"; then
    echo "Failed to restore the previous checkout at '$current_commit'." >&2
  fi
  exit "$preparation_status"
fi

sudo rsync -a --delete "$frontend_dir/dist/" /var/www/tackbar/
echo "Frontend: published"

sudo systemctl restart tackbar.service
sudo systemctl status tackbar.service --no-pager
sleep 2
curl -fsS http://127.0.0.1:8000/health
echo
echo "Backend: restarted"
echo "Health: OK"
echo "Production: $target_tag"
