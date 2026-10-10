"""Diagnose TackBar runtime-data ownership and filesystem access."""

import argparse
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.runtime_maintenance import (  # noqa: E402
    RUNTIME_OWNER_GUIDANCE,
    RuntimeDataPreflightResult,
    check_runtime_data,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run a read-only diagnostic of TackBar runtime-data ownership, "
            "readability and writability."
        ),
        epilog=(
            "The command exits 0 when all checks pass and 1 when a problem "
            "is detected. It reads no domain file content and makes no "
            "persistent runtime changes; its temporary root-writability "
            "probe is removed immediately.\n\n"
            "Safe production example:\n"
            "  sudo -u <runtime-owner> /opt/tackbar/.venv/bin/python "
            "/opt/tackbar/backend/scripts/check_runtime_data.py "
            "--data-dir <runtime-data-dir>"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--data-dir",
        required=True,
        help="Explicit TackBar runtime data root to inspect",
    )
    args = parser.parse_args()

    result = check_runtime_data(args.data_dir)
    output = _format_result(result)
    if result.healthy:
        print(output)
        return 0
    print(output, file=sys.stderr)
    return 1


def _format_result(result: RuntimeDataPreflightResult) -> str:
    if result.healthy:
        ownership = (
            "checked against the effective user"
            if result.ownership_checked
            else "not available on this platform"
        )
        probe = "created and removed" if result.probe_checked else "not needed"
        return "\n".join(
            (
                "Runtime data preflight: OK",
                f"Runtime root: {result.root}",
                f"Paths checked: {result.checked_path_count}",
                f"Ownership: {ownership}",
                "Readability and writability: OK",
                f"Temporary probe: {probe}",
            )
        )

    lines = [
        "Runtime data preflight: FAILED",
        f"Runtime root: {result.root}",
        "Problems:",
        *(f"  - {problem}" for problem in result.problems),
        RUNTIME_OWNER_GUIDANCE,
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
