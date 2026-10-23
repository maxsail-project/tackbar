import hashlib
import json
import math
import struct
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.analytics.maneuver_detector import detect_maneuvers
from app.normalization.track_normalizer import normalize_track
from app.parsers.vakaros_vkx import parse_vakaros_vkx
from app.services.maneuver_analytics import (
    MANEUVER_ALGORITHM_VERSION,
    generate_maneuver_analytics,
    get_or_generate_maneuver_analytics,
    inspect_maneuver_analytics,
)
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


ACTIVITY_ID = "4f17e0e1-4e36-4d4e-b059-a1a33fb1be2f"
BODY_FIXED_VKX_ACTIVITY_ID = "51f08780-c8ba-43b0-923c-a6cbfd13b0f9"
UNFIXED_VKX_ACTIVITY_ID = "a6be49b8-4177-4ce5-a7db-d1260240c386"


def _canonical_track(activity_id: str, *, with_hdg: bool = True):
    start = datetime(2031, 1, 1, 10, 0, tzinfo=timezone.utc)
    samples = []
    heading = 40.0
    for index in range(35):
        if 10 <= index < 24:
            heading += 7.5
        samples.append({
            "utc": (
                start + timedelta(seconds=index * 0.5)
            ).isoformat(timespec="milliseconds"),
            "lat": 0.25,
            "lon": -30.75,
            "hdg": heading if with_hdg else None,
        })
    return normalize_track(activity_id, samples)


def _yaw_quaternion(heading: float) -> tuple[float, float, float, float]:
    half_yaw = math.radians(heading) / 2
    return math.cos(half_yaw), 0.0, 0.0, math.sin(half_yaw)


def _maneuver_vkx(*, body_fixed: bool) -> bytes:
    start_ms = 1_924_861_200_000
    heading = 40.0
    rows = [bytes([0xFF, 0x05]) + bytes(6)]
    if body_fixed:
        rows.append(bytes([0x08]) + struct.pack("<QIB", 0, 1, 10))
    for index in range(35):
        if 10 <= index < 24:
            heading += 7.5
        quaternion = _yaw_quaternion(heading)
        rows.append(
            bytes([0x02])
            + struct.pack(
                "<Qii7f",
                start_ms + index * 500,
                381_234_567,
                -2_345_678,
                5.0,
                math.radians(heading),
                0.0,
                *quaternion,
            )
        )
    return b"".join(rows)


def _persist_vkx_track(
    activity_id: str,
    body_fixed: bool,
    tracks: TrackStorage,
) -> None:
    activity = parse_vakaros_vkx(
        _maneuver_vkx(body_fixed=body_fixed),
        original_filename="Synthetic maneuver.vkx",
    )
    tracks.write_normalized_track(
        activity_id,
        normalize_track(activity_id, activity.samples),
    )


def test_body_fixed_vkx_uses_existing_maneuver_analytics_pipeline(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    _persist_vkx_track(BODY_FIXED_VKX_ACTIVITY_ID, True, tracks)

    track = tracks.read_normalized_track(BODY_FIXED_VKX_ACTIVITY_ID)
    artifact = generate_maneuver_analytics(
        BODY_FIXED_VKX_ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert track["hdg"].notna().all()
    assert track["heel"].notna().all()
    assert track["trim"].notna().all()
    assert artifact["status"] == "available"
    assert len(artifact["maneuvers"]) == 1


def test_vkx_without_body_frame_evidence_selects_low_when_movement_is_usable(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    _persist_vkx_track(UNFIXED_VKX_ACTIVITY_ID, False, tracks)

    track = tracks.read_normalized_track(UNFIXED_VKX_ACTIVITY_ID)
    artifact = generate_maneuver_analytics(
        UNFIXED_VKX_ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert track["hdg"].isna().all()
    assert track["heel"].isna().all()
    assert track["trim"].isna().all()
    assert artifact["status"] == "available"
    assert artifact["detector_mode"] == "LOW"
    assert artifact["signal_basis"] == ["cog", "sog"]
    assert artifact["maneuvers"] == []


def test_generates_available_artifact_without_mutating_canonical_track(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    canonical_before = tracks.track_path(ACTIVITY_ID).read_bytes()

    artifact = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    assert analytics.artifact_path(ACTIVITY_ID) == (
        temporary_directory / "analytics" / f"{ACTIVITY_ID}.maneuvers.json"
    )
    assert artifact["activity_id"] == ACTIVITY_ID
    assert artifact["algorithm_version"] == MANEUVER_ALGORITHM_VERSION == 7
    assert artifact["track_sha256"] == hashlib.sha256(canonical_before).hexdigest()
    assert artifact["status"] == "available"
    assert len(artifact["maneuvers"]) == 1
    assert artifact["maneuvers"][0]["duration_s"] > 0
    assert artifact["maneuvers"][0]["sog_entry_kn"] is None
    assert artifact["maneuvers"][0]["recovery_time_s"] is None
    assert artifact["maneuvers"][0]["speed_loss_distance_m"] is None
    assert analytics.read(ACTIVITY_ID) == artifact
    assert tracks.track_path(ACTIVITY_ID).read_bytes() == canonical_before
    assert json.loads(
        analytics.artifact_path(ACTIVITY_ID).read_text(encoding="utf-8")
    ) == artifact


def test_generates_unavailable_artifact_when_hdg_is_missing(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(
        ACTIVITY_ID,
        _canonical_track(ACTIVITY_ID, with_hdg=False),
    )

    artifact = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    assert artifact["status"] == "unavailable"
    assert artifact["reason"] == "missing_cog"
    assert artifact["maneuvers"] == []


def test_current_artifact_is_reused_without_recalculation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    expected = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)
    artifact_before = analytics.artifact_path(ACTIVITY_ID).read_bytes()

    def fail_detection(_track: object) -> None:
        raise AssertionError("current artifact should not be recalculated")

    monkeypatch.setattr(
        "app.services.maneuver_analytics.detect_maneuvers",
        fail_detection,
    )

    actual = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert actual == expected
    assert analytics.artifact_path(ACTIVITY_ID).read_bytes() == artifact_before


def test_missing_artifact_is_generated_and_persisted(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))

    artifact = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert artifact["status"] == "available"
    assert analytics.read(ACTIVITY_ID) == artifact


def test_inspection_reports_missing_without_generating(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))

    inspection = inspect_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    assert inspection.artifact_currency == "missing"
    assert inspection.detector_status is None
    assert inspection.detected_count is None
    assert inspection.current_algorithm_version == MANEUVER_ALGORITHM_VERSION
    assert not analytics.artifact_path(ACTIVITY_ID).exists()


def test_inspection_reuses_validation_for_current_stale_and_unavailable_states(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(
        ACTIVITY_ID,
        _canonical_track(ACTIVITY_ID, with_hdg=False),
    )
    generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    current = inspect_maneuver_analytics(ACTIVITY_ID, tracks, analytics)
    artifact = analytics.read(ACTIVITY_ID)
    artifact["algorithm_version"] = MANEUVER_ALGORITHM_VERSION - 1
    analytics.write(ACTIVITY_ID, artifact)
    stale = inspect_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    assert current.artifact_currency == "current"
    assert current.detector_status == "unavailable"
    assert current.unavailable_reason == "missing_cog"
    assert current.detected_count == 0
    assert stale.artifact_currency == "stale"
    assert stale.artifact_algorithm_version == MANEUVER_ALGORITHM_VERSION - 1


def test_version_five_artifact_is_regenerated_for_current_generation(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    stale = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)
    expected_track_sha = stale["track_sha256"]
    stale["algorithm_version"] = 5
    stale["maneuvers"][0]["speed_loss_distance_m"] = 123.0
    stale["maneuvers"][0]["speed_loss_time_s"] = 45.0
    analytics.write(ACTIVITY_ID, stale)

    detector_calls = 0
    original_detector = detect_maneuvers

    def count_detection(track: object) -> object:
        nonlocal detector_calls
        detector_calls += 1
        return original_detector(track)

    monkeypatch.setattr(
        "app.services.maneuver_analytics.detect_maneuvers",
        count_detection,
    )

    artifact = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert artifact["algorithm_version"] == MANEUVER_ALGORITHM_VERSION == 7
    assert artifact["track_sha256"] == expected_track_sha
    assert artifact["maneuvers"][0]["speed_loss_distance_m"] is None
    assert artifact["maneuvers"][0]["speed_loss_time_s"] is None
    assert detector_calls == 1
    assert analytics.read(ACTIVITY_ID) == artifact


def test_track_sha_mismatch_is_regenerated(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    stale = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)
    updated_track = _canonical_track(ACTIVITY_ID)
    updated_track.loc[updated_track["hdg"].notna(), "hdg"] += 1.0
    tracks.write_normalized_track(ACTIVITY_ID, updated_track)

    artifact = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert artifact["track_sha256"] != stale["track_sha256"]
    assert artifact["track_sha256"] == hashlib.sha256(
        tracks.track_path(ACTIVITY_ID).read_bytes()
    ).hexdigest()


@pytest.mark.parametrize(
    "serialized",
    [
        "{not-json\n",
        json.dumps({"activity_id": ACTIVITY_ID}),
    ],
)
def test_malformed_or_corrupt_artifact_is_regenerated(
    temporary_directory: Path,
    serialized: str,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    path = analytics.artifact_path(ACTIVITY_ID)
    path.parent.mkdir(parents=True)
    path.write_text(serialized, encoding="utf-8")

    artifact = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert artifact["algorithm_version"] == MANEUVER_ALGORITHM_VERSION
    assert analytics.read(ACTIVITY_ID) == artifact


def test_current_unavailable_artifact_is_reused(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(
        ACTIVITY_ID,
        _canonical_track(ACTIVITY_ID, with_hdg=False),
    )
    expected = generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)

    def fail_detection(_track: object) -> None:
        raise AssertionError("current unavailable artifact should be reused")

    monkeypatch.setattr(
        "app.services.maneuver_analytics.detect_maneuvers",
        fail_detection,
    )

    artifact = get_or_generate_maneuver_analytics(
        ACTIVITY_ID,
        tracks,
        analytics,
    )

    assert artifact == expected
    assert artifact["status"] == "unavailable"


def test_stale_artifact_does_not_hide_canonical_track_corruption(
    temporary_directory: Path,
) -> None:
    tracks = TrackStorage(temporary_directory)
    analytics = ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY_ID, _canonical_track(ACTIVITY_ID))
    generate_maneuver_analytics(ACTIVITY_ID, tracks, analytics)
    malformed_track = _canonical_track(ACTIVITY_ID).drop(columns=["hdg"])
    malformed_track.to_csv(
        tracks.track_path(ACTIVITY_ID),
        index=False,
        compression={"method": "gzip", "mtime": 0},
    )

    with pytest.raises(ValueError, match="columns must exactly match"):
        get_or_generate_maneuver_analytics(
            ACTIVITY_ID,
            tracks,
            analytics,
        )


def test_atomic_write_replaces_artifact_deterministically(
    temporary_directory: Path,
) -> None:
    storage = ManeuverAnalyticsStorage(temporary_directory)
    first = {
        "activity_id": ACTIVITY_ID,
        "algorithm_version": 1,
        "track_sha256": "a" * 64,
        "status": "available",
        "maneuvers": [],
    }
    second = {**first, "track_sha256": "b" * 64}

    storage.write(ACTIVITY_ID, first)
    storage.write(ACTIVITY_ID, second)
    serialized = storage.artifact_path(ACTIVITY_ID).read_bytes()
    storage.write(ACTIVITY_ID, second)

    assert storage.read(ACTIVITY_ID) == second
    assert storage.artifact_path(ACTIVITY_ID).read_bytes() == serialized
    assert list((temporary_directory / "analytics").glob("*.tmp")) == []


def test_failed_atomic_replace_retains_previous_artifact(
    temporary_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = ManeuverAnalyticsStorage(temporary_directory)
    first = {
        "activity_id": ACTIVITY_ID,
        "algorithm_version": 1,
        "track_sha256": "a" * 64,
        "status": "available",
        "maneuvers": [],
    }
    storage.write(ACTIVITY_ID, first)

    def fail_replace(*_args: object) -> None:
        raise OSError("simulated replace failure")

    monkeypatch.setattr(
        "app.storage.maneuver_analytics_storage.os.replace",
        fail_replace,
    )

    with pytest.raises(OSError, match="simulated replace failure"):
        storage.write(ACTIVITY_ID, {**first, "track_sha256": "b" * 64})

    assert storage.read(ACTIVITY_ID) == first
    assert list((temporary_directory / "analytics").glob("*.tmp")) == []


@pytest.mark.parametrize(
    "activity_id",
    ["../unsafe", "not-a-uuid"],
)
def test_analytics_path_requires_canonical_activity_uuid(
    temporary_directory: Path,
    activity_id: str,
) -> None:
    with pytest.raises(ValueError, match="Invalid Activity id"):
        ManeuverAnalyticsStorage(temporary_directory).artifact_path(activity_id)


def test_analytics_path_normalizes_uuid_letter_case(
    temporary_directory: Path,
) -> None:
    assert ManeuverAnalyticsStorage(temporary_directory).artifact_path(
        ACTIVITY_ID.upper()
    ).name == f"{ACTIVITY_ID}.maneuvers.json"
