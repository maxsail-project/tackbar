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

if [ -n "$(git status --porcelain)" ]; then
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

if ! git diff --quiet "$current_commit" "$target_commit" -- \
  backend/requirements.txt frontend/package.json frontend/package-lock.json; then
  echo "Dependency manifests differ between the deployed release and '$target_tag'." >&2
  echo "Install dependencies through the approved server-side procedure before deploying." >&2
  exit 1
fi

git checkout --detach "$target_ref"
checked_out_commit="$(git rev-parse HEAD)"

if [ "$checked_out_commit" != "$target_commit" ]; then
  echo "Checked-out commit does not match requested release tag '$target_tag'." >&2
  exit 1
fi

echo "Checked-out release: $target_tag"
echo "Commit: $checked_out_commit"

cd "$frontend_dir"
npm run build
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
