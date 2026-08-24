import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest

from app.normalization.track_normalizer import CANONICAL_TRACK_COLUMNS
from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.consent_events import ConsentEventRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.runtime_paths import (
    DATA_DIR_ENVIRONMENT_VARIABLE,
    PUBLIC_TEST_DATA_ROOT,
    require_private_data_root,
    resolve_data_root,
    runtime_paths,
)
from app.services.ingestion_history import IngestionHistory
from app.storage.track_storage import TrackStorage


DEMO_ACTIVITY_IDS = {
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
}
DEMO_SAILOR_IDS = {
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
}
DEMO_BOAT_IDS = {
    "40000000-0000-4000-8000-000000000001",
    "40000000-0000-4000-8000-000000000002",
}


def test_unconfigured_data_root_is_public_test_data() -> None:
    assert resolve_data_root({}) == PUBLIC_TEST_DATA_ROOT


def test_configured_data_root_is_private_runtime_path(
    temporary_directory: Path,
) -> None:
    configured_root = temporary_directory / "private-runtime"

    assert resolve_data_root(
        {DATA_DIR_ENVIRONMENT_VARIABLE: str(configured_root)}
    ) == configured_root.resolve()


def test_empty_private_data_root_is_rejected() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        resolve_data_root({DATA_DIR_ENVIRONMENT_VARIABLE: "  "})


def test_default_repositories_share_the_configured_root(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    configured_root = temporary_directory / "private-runtime"
    monkeypatch.setenv(DATA_DIR_ENVIRONMENT_VARIABLE, str(configured_root))
    paths = runtime_paths()

    assert SailorRepository().path == paths.sailors
    assert BoatRepository().path == paths.boats
    assert ActivityRepository().path == paths.activities
    assert SessionRepository().path == paths.sessions
    assert IngestionHistory().path == paths.ingestion_history
    assert ConsentEventRepository().path == paths.consent_events
    assert TrackStorage().data_root == paths.root


def test_real_ingestion_requires_explicit_private_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(DATA_DIR_ENVIRONMENT_VARIABLE, raising=False)

    with pytest.raises(ValueError, match=DATA_DIR_ENVIRONMENT_VARIABLE):
        require_private_data_root()


def test_real_ingestion_rejects_a_root_inside_the_repository(
    monkeypatch: pytest.MonkeyPatch,
    temporary_directory: Path,
) -> None:
    monkeypatch.setenv(
        DATA_DIR_ENVIRONMENT_VARIABLE,
        str(temporary_directory / "not-private"),
    )

    with pytest.raises(ValueError, match="outside"):
        require_private_data_root()


def test_public_test_data_has_complete_consistent_storage() -> None:
    paths = runtime_paths(PUBLIC_TEST_DATA_ROOT)
    sailors = SailorRepository(paths.sailors)
    boats = BoatRepository(paths.boats)
    activities = ActivityRepository(paths.activities).all()
    sessions = SessionRepository(paths.sessions).all()
    history = IngestionHistory(paths.ingestion_history).records()

    sailor_records = json.loads(
        paths.sailors.read_text(encoding="utf-8")
    )
    boat_records = json.loads(paths.boats.read_text(encoding="utf-8"))
    assert {record["id"] for record in sailor_records} == DEMO_SAILOR_IDS
    assert {record["id"] for record in boat_records} == DEMO_BOAT_IDS
    assert sailors.find_by_email(" SAILOR-A@EXAMPLE.COM ") is not None
    assert {sailor.default_boat_id for sailor in sailors.all()} == DEMO_BOAT_IDS
    assert {boat.id for boat in boats.all()} == DEMO_BOAT_IDS
    assert {activity.id for activity in activities} == DEMO_ACTIVITY_IDS
    assert {activity.sailor_id for activity in activities} == DEMO_SAILOR_IDS
    assert {activity.boat_id for activity in activities} == DEMO_BOAT_IDS
    assert len(sessions) == 1
    assert set(sessions[0].activity_ids) == DEMO_ACTIVITY_IDS
    assert {record["activity_id"] for record in history} == DEMO_ACTIVITY_IDS
    assert all(record["provider"] == "demo" for record in history)

    storage = TrackStorage(paths.root)
    for activity in activities:
        original_path = storage.original_path(
            activity.id,
            activity.original_filename,
        )
        track_path = storage.track_path(activity.id)
        assert original_path.exists()
        assert track_path.exists()
        assert hashlib.sha256(original_path.read_bytes()).hexdigest() == (
            activity.attachment_sha256
        )

        track = pd.read_csv(track_path, compression="gzip")
        assert list(track.columns) == CANONICAL_TRACK_COLUMNS
        assert len(track) == activity.sample_count
        assert set(track["activity_id"]) == {activity.id}
