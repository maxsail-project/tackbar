from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]
DEPLOYMENT_SCRIPT = PROJECT_DIR / "scripts" / "deploy-production.sh"


def _deployment_script() -> str:
    return DEPLOYMENT_SCRIPT.read_text(encoding="utf-8")


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
