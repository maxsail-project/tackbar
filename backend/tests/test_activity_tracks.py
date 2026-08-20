import gzip
import json
from pathlib import Path

import pandas as pd
import pytest

from app.parsers.vakaros_csv import parse_vakaros_csv
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_reprocessing import reprocess_activity
from app.services.activity_tracks import persist_activity_track
from app.storage.track_storage import TrackStorage


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)


def _create_activity(
    tmp_path: Path,
) -> tuple[ActivityRepository, TrackStorage, bytes, str]:
    repository = ActivityRepository(tmp_path / "activities.json")
    storage = TrackStorage(tmp_path)
    original_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    activity, created = repository.find_or_create(
        "sailor-a@example.com",
        parsed,
        original_bytes,
    )
    assert created is True
    return repository, storage, original_bytes, activity.id


def test_new_activity_receives_track_file_and_archived_original(
    temporary_directory: Path,
) -> None:
    repository, storage, original_bytes, activity_id = _create_activity(
        temporary_directory
    )
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    stored = repository.get_by_id(activity_id)
    assert stored is not None

    persisted = persist_activity_track(
        stored,
        parsed,
        original_bytes,
        repository,
        storage,
    )

    assert persisted.track_file == f"tracks/{activity_id}.csv.gz"
    assert (temporary_directory / persisted.track_file).exists()
    assert storage.original_path(
        activity_id, persisted.original_filename
    ).read_bytes() == original_bytes
    record = json.loads(repository.path.read_text(encoding="utf-8"))[0]
    assert record["track_file"] == persisted.track_file


def test_existing_activity_without_track_file_is_enriched_without_duplicate(
    temporary_directory: Path,
) -> None:
    repository, storage, original_bytes, activity_id = _create_activity(
        temporary_directory
    )
    records = json.loads(repository.path.read_text(encoding="utf-8"))
    records[0].pop("track_file")
    repository.path.write_text(json.dumps(records), encoding="utf-8")
    parsed = parse_vakaros_csv(FIXTURE_PATH)

    existing, created = repository.find_or_create(
        " SAILOR-A@EXAMPLE.COM ",
        parsed,
        original_bytes,
    )
    enriched = persist_activity_track(
        existing,
        parsed,
        original_bytes,
        repository,
        storage,
    )

    assert created is False
    assert enriched.id == activity_id
    assert enriched.track_file == f"tracks/{activity_id}.csv.gz"
    assert len(repository.all()) == 1


def test_reprocessing_restores_deleted_track_without_changing_identity_or_session(
    temporary_directory: Path,
) -> None:
    repository, storage, original_bytes, activity_id = _create_activity(
        temporary_directory
    )
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    initial = repository.get_by_id(activity_id)
    assert initial is not None
    initial = persist_activity_track(
        initial,
        parsed,
        original_bytes,
        repository,
        storage,
    )
    sessions = SessionRepository(temporary_directory / "sessions.json")
    session = sessions.create(activity_id)
    track_path = storage.track_path(activity_id)
    expected_track = pd.read_csv(track_path, compression="gzip")
    identity = (
        initial.id,
        initial.participant_id,
        initial.source,
        initial.original_filename,
        initial.attachment_sha256,
    )

    track_path.unlink()
    reprocessed = reprocess_activity(activity_id, repository, storage)
    restored_track = pd.read_csv(track_path, compression="gzip")

    assert track_path.exists()
    pd.testing.assert_frame_equal(restored_track, expected_track)
    assert (
        reprocessed.id,
        reprocessed.participant_id,
        reprocessed.source,
        reprocessed.original_filename,
        reprocessed.attachment_sha256,
    ) == identity
    assert len(repository.all()) == 1
    assert sessions.all() == [session]
    assert sessions.all()[0].activity_ids == [activity_id]


def test_reprocessing_restores_track_from_archived_uncompressed_csv(
    temporary_directory: Path,
) -> None:
    repository = ActivityRepository(temporary_directory / "activities.json")
    storage = TrackStorage(temporary_directory)
    original_filename = "vakaros-demo.csv"
    original_bytes = gzip.decompress(FIXTURE_PATH.read_bytes())
    parsed = parse_vakaros_csv(
        original_bytes,
        original_filename=original_filename,
    )
    stored, created = repository.find_or_create(
        "sailor-a@example.com",
        parsed,
        original_bytes,
    )
    assert created is True
    persisted = persist_activity_track(
        stored,
        parsed,
        original_bytes,
        repository,
        storage,
    )
    expected_track = pd.read_csv(
        storage.track_path(persisted.id),
        compression="gzip",
    )

    storage.track_path(persisted.id).unlink()
    reprocessed = reprocess_activity(persisted.id, repository, storage)
    restored_track = pd.read_csv(
        storage.track_path(persisted.id),
        compression="gzip",
    )

    assert reprocessed.id == persisted.id
    assert reprocessed.participant_id == persisted.participant_id
    assert reprocessed.attachment_sha256 == persisted.attachment_sha256
    assert reprocessed.original_filename == original_filename
    assert storage.original_path(
        persisted.id,
        original_filename,
    ).read_bytes() == original_bytes
    pd.testing.assert_frame_equal(restored_track, expected_track)
    assert len(repository.all()) == 1


def test_reprocessing_reports_unknown_activity(
    temporary_directory: Path,
) -> None:
    with pytest.raises(ValueError, match="Activity not found"):
        reprocess_activity(
            "4f17e0e1-4e36-4d4e-b059-a1a33fb1be2f",
            ActivityRepository(temporary_directory / "activities.json"),
            TrackStorage(temporary_directory),
        )


def test_reprocessing_reports_missing_archived_original(
    temporary_directory: Path,
) -> None:
    repository, storage, _, activity_id = _create_activity(
        temporary_directory
    )

    with pytest.raises(FileNotFoundError, match="Archived original not found"):
        reprocess_activity(activity_id, repository, storage)
