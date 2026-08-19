"""Regenerate one normalized TackBar track from its archived original."""

import argparse
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.repositories.activities import ActivityRepository  # noqa: E402
from app.services.activity_reprocessing import reprocess_activity  # noqa: E402
from app.storage.track_storage import TrackStorage  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regenerate an Activity track from its archived original."
    )
    parser.add_argument("activity_id", help="TackBar Activity UUID")
    args = parser.parse_args()

    try:
        activity = reprocess_activity(
            args.activity_id,
            ActivityRepository(),
            TrackStorage(),
        )
    except (FileNotFoundError, ValueError) as error:
        parser.exit(1, f"Error: {error}\n")

    print(f"Reprocessed Activity: {activity.id}")
    print(f"Track: {activity.track_file}")


if __name__ == "__main__":
    main()
