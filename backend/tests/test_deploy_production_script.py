import os
import shutil
import subprocess
from pathlib import Path

import pytest


PROJECT_DIR = Path(__file__).resolve().parents[2]
DEPLOYMENT_SCRIPT = PROJECT_DIR / "scripts" / "deploy-production.sh"


def _deployment_script() -> str:
    return DEPLOYMENT_SCRIPT.read_text(encoding="utf-8")


def _bash_executable() -> str:
    if os.name == "nt":
        git_bash = Path("C:/Program Files/Git/bin/bash.exe")
        if git_bash.is_file():
            return str(git_bash)
    bash = shutil.which("bash")
    if bash is None:
        pytest.skip("Bash is not available")
    return bash


@pytest.mark.parametrize(
    ("status_output", "status_exit", "expected_exit", "expected_error"),
    [
        ("", 0, 0, ""),
        (" M changed file.txt\n", 0, 1, "not clean"),
        ("", 128, 1, "could not be inspected"),
        (" M changed file.txt\n", 128, 1, "could not be inspected"),
    ],
)
def test_worktree_inspection_guard(
    status_output: str,
    status_exit: int,
    expected_exit: int,
    expected_error: str,
):
    script = _deployment_script()
    guard_start = script.index('if ! worktree_status="$(git status --porcelain)"; then')
    guard_end = script.index('current_commit="$(git rev-parse HEAD)"', guard_start)
    guard = script[guard_start:guard_end]
    harness = f"""\
set -euo pipefail
mock_status_output="$1"
mock_status_exit="$2"
git() {{
  if [ "$#" -ne 2 ] || [ "$1" != status ] || [ "$2" != --porcelain ]; then
    printf 'Unexpected Git command\\n' >&2
    return 99
  fi
  printf '%s' "$mock_status_output"
  return "$mock_status_exit"
}}
{guard}
printf 'passed-worktree-guard\\n'
"""

    result = subprocess.run(
        [
            _bash_executable(),
            "-c",
            harness,
            "worktree-guard",
            status_output,
            str(status_exit),
        ],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )

    assert result.returncode == expected_exit
    assert ("passed-worktree-guard" in result.stdout) == (expected_exit == 0)
    if expected_error:
        assert expected_error in result.stderr
    else:
        assert result.stderr == ""
    if status_exit != 0:
        assert "not clean" not in result.stderr


def test_worktree_inspection_precedes_deployment_side_effects():
    script = _deployment_script()
    guard = script.index('if ! worktree_status="$(git status --porcelain)"; then')
    guard_end = script.index('current_commit="$(git rev-parse HEAD)"', guard)

    for command in (
        "git fetch --tags origin",
        "/opt/tackbar/.venv/bin/python -m pip install -r",
        'git checkout --detach "$target_ref"',
        "npm ci || return",
        'VITE_APP_VERSION="$target_tag" npm run build',
        "sudo rsync",
    ):
        assert guard_end < script.index(command)


def test_backend_dependencies_are_prepared_from_target_before_checkout():
    script = _deployment_script()

    detection = script.index("backend_requirements_changed=false")
    extraction = script.index(
        'git show "${target_commit}:backend/requirements.txt"'
    )
    installation = script.index(
        "/opt/tackbar/.venv/bin/python -m pip install -r"
    )
    checkout = script.index('git checkout --detach "$target_ref"')

    assert detection < extraction < installation < checkout
    assert 'target_requirements_file="$(mktemp)"' in script
    assert "trap cleanup_target_requirements EXIT" in script
    assert "cleanup_target_requirements\n  trap - EXIT" in script
    assert "--upgrade" not in script
    assert "Dependency manifests differ" not in script


def test_frontend_preparation_restores_checkout_before_publication_on_failure():
    script = _deployment_script()

    detection = script.index("frontend_manifests_changed=false")
    checkout = script.index('git checkout --detach "$target_ref"')
    verification = script.index("elif ! npm ls --all; then")
    build = script.index('VITE_APP_VERSION="$target_tag" npm run build')
    restoration = script.index(
        'git -C "$checkout_dir" checkout --detach "$current_commit"'
    )
    failure_exit = script.index('exit "$preparation_status"')
    publication = script.index("sudo rsync")

    assert (
        detection
        < checkout
        < verification
        < build
        < restoration
        < failure_exit
        < publication
    )
    assert 'if [ "$frontend_manifests_changed" = true ]; then' in script
    assert "npm ci || return" in script
    assert script.count('VITE_APP_VERSION="$target_tag" npm run build') == 1
