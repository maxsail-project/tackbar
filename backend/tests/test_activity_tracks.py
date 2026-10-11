import gzip
import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest

from app.normalization.track_normalizer import (
    CANONICAL_TRACK_COLUMNS,
    normalize_track,
)
from app.parsers.vakaros import parse_vakaros_attachment
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.activity_reprocessing import reprocess_activity
from app.services.activity_tracks import persist_activity_track
from app.services.maneuver_analytics import (
    MANEUVER_ALGORITHM_VERSION,
    generate_maneuver_analytics,
    get_or_generate_maneuver_analytics,
)
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
)
SAILOR_ID = "30000000-0000-4000-8000-000000000001"
BOAT_ID = "40000000-0000-4000-8000-000000000001"


def _create_activity(
    tmp_path: Path,
) -> tuple[ActivityRepository, TrackStorage, bytes, str]:
    repository = ActivityRepository(tmp_path / "activities.json")
    storage = TrackStorage(tmp_path)
    original_bytes = FIXTURE_PATH.read_bytes()
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    activity, created = repository.find_or_create(
        SAILOR_ID,
        BOAT_ID,
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
        SAILOR_ID,
        BOAT_ID,
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
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    stale_artifact = {
        "activity_id": activity_id,
        "algorithm_version": 1,
        "track_sha256": "a" * 64,
        "status": "available",
        "maneuvers": [],
    }
    analytics.write(activity_id, stale_artifact)
    expected_track = pd.read_csv(track_path, compression="gzip")
    identity = (
        initial.id,
        initial.sailor_id,
        initial.boat_id,
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
        reprocessed.sailor_id,
        reprocessed.boat_id,
        reprocessed.source,
        reprocessed.original_filename,
        reprocessed.attachment_sha256,
    ) == identity
    assert len(repository.all()) == 1
    assert sessions.all() == [session]
    assert sessions.all()[0].activity_ids == [activity_id]
    refreshed_artifact = analytics.read(activity_id)
    assert refreshed_artifact["algorithm_version"] == MANEUVER_ALGORITHM_VERSION
    assert refreshed_artifact["track_sha256"] == hashlib.sha256(
        track_path.read_bytes()
    ).hexdigest()


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
        SAILOR_ID,
        BOAT_ID,
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
    assert reprocessed.sailor_id == persisted.sailor_id
    assert reprocessed.boat_id == persisted.boat_id
    assert reprocessed.attachment_sha256 == persisted.attachment_sha256
    assert reprocessed.original_filename == original_filename
    assert storage.original_path(
        persisted.id,
        original_filename,
    ).read_bytes() == original_bytes
    pd.testing.assert_frame_equal(restored_track, expected_track)
    assert len(repository.all()) == 1


def test_reprocessed_track_eagerly_regenerates_maneuver_analytics(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository, storage, original_bytes, activity_id = _create_activity(
        temporary_directory
    )
    parsed = parse_vakaros_csv(FIXTURE_PATH)
    stored = repository.get_by_id(activity_id)
    assert stored is not None
    persist_activity_track(
        stored,
        parsed,
        original_bytes,
        repository,
        storage,
    )
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    stale = generate_maneuver_analytics(activity_id, storage, analytics)

    def changed_normalization(activity_id: str, samples: list[dict]):
        normalized = normalize_track(activity_id, samples)
        present = normalized["hdg"].notna()
        assert present.any()
        normalized.loc[present, "hdg"] = (
            normalized.loc[present, "hdg"] + 1.0
        ) % 360.0
        return normalized

    monkeypatch.setattr(
        "app.services.activity_reprocessing.normalize_track",
        changed_normalization,
    )

    reprocess_activity(activity_id, repository, storage)
    refreshed = analytics.read(activity_id)

    assert refreshed["track_sha256"] != stale["track_sha256"]
    assert refreshed["track_sha256"] == hashlib.sha256(
        storage.track_path(activity_id).read_bytes()
    ).hexdigest()


def test_reprocessing_survives_eager_analytics_failure_and_lazy_recovers(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
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
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    stale = generate_maneuver_analytics(activity_id, storage, analytics)

    def changed_normalization(activity_id: str, samples: list[dict]):
        normalized = normalize_track(activity_id, samples)
        present = normalized["hdg"].notna()
        normalized.loc[present, "hdg"] = (
            normalized.loc[present, "hdg"] + 2.0
        ) % 360.0
        return normalized

    def fail_generation(*_args, **_kwargs):
        raise RuntimeError("derived analytics failed")

    monkeypatch.setattr(
        "app.services.activity_reprocessing.normalize_track",
        changed_normalization,
    )
    monkeypatch.setattr(
        "app.services.activity_reprocessing.generate_maneuver_analytics",
        fail_generation,
    )

    reprocessed = reprocess_activity(activity_id, repository, storage)
    rewritten_track = storage.read_normalized_track(activity_id)
    rewritten_sha256 = hashlib.sha256(
        storage.track_path(activity_id).read_bytes()
    ).hexdigest()

    assert reprocessed.id == persisted.id
    assert rewritten_track["activity_id"].eq(activity_id).all()
    assert len(rewritten_track) == reprocessed.sample_count
    assert rewritten_sha256 != stale["track_sha256"]
    assert analytics.read(activity_id) == stale

    recovered = get_or_generate_maneuver_analytics(
        activity_id,
        storage,
        analytics,
    )

    assert recovered["track_sha256"] == rewritten_sha256
    assert analytics.read(activity_id) == recovered


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


def test_reprocessing_restores_vkx_track_and_preserves_identity_and_session(
    temporary_directory: Path,
    vakaros_vkx_bytes: bytes,
) -> None:
    repository = ActivityRepository(temporary_directory / "activities.json")
    storage = TrackStorage(temporary_directory)
    original_filename = "Atlas 10-10-2026.vkx.gz"
    original_bytes = gzip.compress(vakaros_vkx_bytes)
    parsed = parse_vakaros_attachment(
        original_bytes,
        original_filename=original_filename,
    )
    stored, created = repository.find_or_create(
        SAILOR_ID,
        BOAT_ID,
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
    sessions = SessionRepository(temporary_directory / "sessions.json")
    session = sessions.create(persisted.id)
    expected_identity = (
        persisted.id,
        persisted.sailor_id,
        persisted.boat_id,
        persisted.source,
        persisted.original_filename,
        persisted.attachment_sha256,
    )

    storage.track_path(persisted.id).unlink()
    reprocessed = reprocess_activity(persisted.id, repository, storage)
    restored = storage.read_normalized_track(persisted.id)

    assert (
        reprocessed.id,
        reprocessed.sailor_id,
        reprocessed.boat_id,
        reprocessed.source,
        reprocessed.original_filename,
        reprocessed.attachment_sha256,
    ) == expected_identity
    assert reprocessed.source == "vakaros"
    assert list(restored.columns) == CANONICAL_TRACK_COLUMNS
    quaternions = restored.loc[
        0,
        ["quat_w", "quat_x", "quat_y", "quat_z"],
    ].tolist()
    assert quaternions == pytest.approx([0.5, 0.1, -0.2, 0.8])
    assert sessions.all() == [session]
    assert sessions.all()[0].activity_ids == [persisted.id]


@pytest.mark.parametrize("invalid_quaternion", ["nan", "inf", "-inf"])
def test_non_finite_csv_quaternion_cannot_be_persisted(
    temporary_directory: Path,
    invalid_quaternion: str,
) -> None:
    csv_bytes = (
        b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim,"
        b"q_w,q_x,q_y,q_z\n"
        + (
            "2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2,"
            f"{invalid_quaternion},0.1,-0.2,0.8\n"
        ).encode("ascii")
    )
    repository = ActivityRepository(temporary_directory / "activities.json")
    storage = TrackStorage(temporary_directory)
    with pytest.raises(ValueError, match="invalid quaternion values"):
        parsed = parse_vakaros_csv(
            csv_bytes,
            original_filename="invalid-quaternion.csv",
        )
        stored, _ = repository.find_or_create(
            SAILOR_ID,
            BOAT_ID,
            parsed,
            csv_bytes,
        )
        persist_activity_track(
            stored,
            parsed,
            csv_bytes,
            repository,
            storage,
        )

    assert list(storage.tracks_root.glob("*.csv.gz")) == []
