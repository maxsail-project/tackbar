"""Filesystem persistence for derived maneuver analytics artifacts."""

import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.runtime_paths import runtime_paths
from app.storage.activity_ids import canonical_activity_id


class ManeuverAnalyticsStorage:
    def __init__(self, data_root: str | Path | None = None) -> None:
        self.data_root = (
            runtime_paths().root if data_root is None else Path(data_root)
        )
        self.analytics_root = self.data_root / "analytics"

    def artifact_path(self, activity_id: str) -> Path:
        safe_activity_id = canonical_activity_id(activity_id)
        return self.analytics_root / f"{safe_activity_id}.maneuvers.json"

    def read(self, activity_id: str) -> dict[str, Any]:
        safe_activity_id = canonical_activity_id(activity_id)
        path = self.artifact_path(activity_id)
        artifact = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(artifact, dict):
            raise ValueError("Maneuver analytics artifact must be a JSON object")
        if artifact.get("activity_id") != safe_activity_id:
            raise ValueError(
                "Maneuver analytics artifact contains a different Activity id"
            )
        return artifact

    def write(self, activity_id: str, artifact: dict[str, Any]) -> Path:
        safe_activity_id = canonical_activity_id(activity_id)
        path = self.artifact_path(activity_id)
        if artifact.get("activity_id") != safe_activity_id:
            raise ValueError(
                "Maneuver analytics artifact contains a different Activity id"
            )

        encoded = (
            json.dumps(artifact, indent=2, ensure_ascii=False) + "\n"
        ).encode("utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(
            f".{path.name}.{uuid4().hex}.tmp"
        )
        try:
            with temporary.open("xb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            if temporary.exists():
                temporary.unlink()
        return path
