"""Safely plan or apply deletion of one Sailor's owned runtime data."""

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.sailor_deletion import (  # noqa: E402
    SERVICE_WARNING,
    SailorDeletionError,
    apply_sailor_deletion,
    format_sailor_deletion_report,
    plan_sailor_deletion,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Plan or apply deletion of one Sailor and owned TackBar runtime "
            "data. Dry-run is the default."
        ),
        epilog=(
            f"{SERVICE_WARNING}\n\n"
            "Safety:\n"
            "  Dry-run is the default and does not mutate runtime data.\n"
            "  --apply mutates runtime data and, in production, must run as "
            "the runtime owner/service-compatible user.\n"
            "  Plain sudo can be unsafe because it changes the effective "
            "user to root.\n\n"
            "Safe production example:\n"
            "  sudo -u <runtime-owner> /path/to/python "
            "backend/scripts/delete_sailor.py --data-dir "
            "<runtime-data-dir> --email <sailor-email> --apply"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--data-dir",
        required=True,
        help="Explicit TackBar runtime data root",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Sailor email identity (normalized by TackBar)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help=(
            "Mutate runtime data using the planned deletion; requires "
            "tackbar.service to be stopped and a runtime-owner-compatible user"
        ),
    )
    args = parser.parse_args()

    try:
        plan = plan_sailor_deletion(args.data_dir, args.email)
        if args.apply:
            result = apply_sailor_deletion(plan)
            output = format_sailor_deletion_report(
                plan,
                applied=True,
                warnings=result.warnings,
            )
        else:
            output = format_sailor_deletion_report(plan, applied=False)
    except (SailorDeletionError, OSError, ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f"Sailor deletion failed: {error}\n")

    print(output)


if __name__ == "__main__":
    main()
