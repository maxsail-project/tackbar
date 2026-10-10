import os
import sys
from pathlib import Path

import pytest

from app.services import runtime_maintenance
from app.services.runtime_maintenance import check_runtime_data
from scripts.check_runtime_data import main as check_runtime_data_main


def _runtime_root(temporary_directory: Path) -> Path:
    root = temporary_directory / "runtime"
    root.mkdir()
    (root / "sailors.json").write_text("[]\n", encoding="utf-8")
    (root / "tracks").mkdir()
    private_original = root / "originals" / "activity-id"
    private_original.mkdir(parents=True)
    (private_original / "Private Sailor track.csv.gz").write_bytes(b"track")
    return root


def _snapshot(root: Path) -> tuple[set[str], dict[str, bytes]]:
    directories = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_dir()
    }
    files = {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }
    return directories, files


def test_healthy_runtime_passes_without_persistent_mutation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: 1001,
    )
    monkeypatch.setattr(
        runtime_maintenance,
        "_owner_user_id",
        lambda _path: 1001,
    )

    result = check_runtime_data(root)

    assert result.healthy
    assert result.ownership_checked
    assert result.probe_checked
    assert result.checked_path_count == 6
    assert result.problems == ()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "check_runtime_data.py",
            "--data-dir",
            str(root),
        ],
    )
    assert check_runtime_data_main() == 0
    assert "Runtime data preflight: OK" in capsys.readouterr().out
    assert _snapshot(root) == before
    assert not list(root.glob(".tackbar-runtime-preflight-*"))


def test_cli_reports_owner_mismatch_without_private_filename(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    private_filename = "Private Sailor track.csv.gz"
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: 1001,
    )
    monkeypatch.setattr(
        runtime_maintenance,
        "_owner_user_id",
        lambda path: 1002 if path.name == private_filename else 1001,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "check_runtime_data.py",
            "--data-dir",
            str(root),
        ],
    )

    assert check_runtime_data_main() == 1

    error = capsys.readouterr().err
    assert "Runtime data preflight: FAILED" in error
    assert "ownership: <runtime-root>/originals/..." in error
    assert private_filename not in error
    assert "sudo -u <runtime-owner>" in error
    assert _snapshot(root) == before


def test_cli_reports_unwritable_runtime_path(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _runtime_root(temporary_directory)
    sailors_path = root / "sailors.json"
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: None,
    )

    def access(path: Path, mode: int) -> bool:
        return not (Path(path) == sailors_path and mode & os.W_OK)

    monkeypatch.setattr(runtime_maintenance, "_has_access", access)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "check_runtime_data.py",
            "--data-dir",
            str(root),
        ],
    )

    assert check_runtime_data_main() == 1

    error = capsys.readouterr().err
    assert "writability: <runtime-root>/sailors.json" in error
    assert _snapshot(root) == before


def test_runtime_preflight_reports_unreadable_metadata(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _runtime_root(temporary_directory)
    sailors_path = root / "sailors.json"
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: None,
    )

    def access(path: Path, mode: int) -> bool:
        return not (Path(path) == sailors_path and mode & os.R_OK)

    monkeypatch.setattr(runtime_maintenance, "_has_access", access)

    result = check_runtime_data(root)

    assert not result.healthy
    assert (
        "readability: <runtime-root>/sailors.json is not readable by the "
        "effective user"
    ) in result.problems


def test_failed_root_probe_is_reported(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = _runtime_root(temporary_directory)
    before = _snapshot(root)
    monkeypatch.setattr(
        runtime_maintenance,
        "_effective_user_id",
        lambda: None,
    )

    def fail_probe(_root: Path) -> None:
        raise PermissionError("simulated probe failure")

    monkeypatch.setattr(
        runtime_maintenance,
        "_probe_root_writability",
        fail_probe,
    )

    result = check_runtime_data(root)

    assert not result.healthy
    assert result.probe_checked
    assert any("writability probe" in problem for problem in result.problems)
    assert _snapshot(root) == before


def test_missing_runtime_root_exits_nonzero(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    missing_root = temporary_directory / "missing"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "check_runtime_data.py",
            "--data-dir",
            str(missing_root),
        ],
    )

    assert check_runtime_data_main() == 1

    assert "does not exist" in capsys.readouterr().err
    assert not missing_root.exists()


def test_cli_help_explains_checks_exit_codes_and_safe_invocation(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(sys, "argv", ["check_runtime_data.py", "--help"])

    with pytest.raises(SystemExit) as exit_info:
        check_runtime_data_main()

    assert exit_info.value.code == 0
    output = " ".join(capsys.readouterr().out.split())
    assert "read-only diagnostic" in output
    assert "ownership, readability and writability" in output
    assert "exits 0" in output
    assert "1 when a problem is detected" in output
    assert "--data-dir" in output
    assert "sudo -u <runtime-owner>" in output
