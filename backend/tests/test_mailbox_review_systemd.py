from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]
SYSTEMD_DIR = PROJECT_DIR / "deploy" / "systemd"


def _directives(path: Path) -> set[str]:
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("[")
    }


def test_mailbox_review_service_runs_one_deployed_review_cycle():
    directives = _directives(
        SYSTEMD_DIR / "tackbar-mailbox-review.service"
    )

    assert "Type=oneshot" in directives
    assert "User=tackbar" in directives
    assert "Group=tackbar" in directives
    assert "WorkingDirectory=/opt/tackbar/backend" in directives
    assert "EnvironmentFile=/etc/tackbar/tackbar.env" in directives
    assert (
        "ExecStart=/opt/tackbar/.venv/bin/python "
        "-m app.mailbox_review_once"
    ) in directives
    assert "StandardOutput=journal" in directives
    assert "StandardError=journal" in directives


def test_mailbox_review_timer_waits_after_service_finishes():
    directives = _directives(
        SYSTEMD_DIR / "tackbar-mailbox-review.timer"
    )

    assert "OnActiveSec=2min" in directives
    assert "OnUnitInactiveSec=2min" in directives
    assert "Unit=tackbar-mailbox-review.service" in directives
    assert not any(item.startswith("OnCalendar=") for item in directives)


def test_deployment_script_does_not_manage_mailbox_review_units():
    deployment_script = (
        PROJECT_DIR / "scripts" / "deploy-production.sh"
    ).read_text(encoding="utf-8")

    assert "tackbar-mailbox-review" not in deployment_script
