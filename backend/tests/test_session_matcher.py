import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import UUID

from app.repositories.activities import ActivityRepository
from app.repositories.sessions import SessionRepository
from app.services.session_matcher import (
    EARTH_RADIUS_NM,
    MAX_SESSION_DISTANCE_NM,
    derive_session_summary,
    haversine_nm,
    match_activity_to_session,
)


def _time(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 8, 10, hour, minute, tzinfo=timezone.utc)


def _activity_record(
    activity_id: str,
    start_time: datetime,
    end_time: datetime,
    center_lat: float = 0.0,
    center_lon: float = 0.0,
    sailor_id: str = "30000000-0000-4000-8000-000000000001",
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
) -> dict[str, object]:
    return {
        "id": activity_id,
        "sailor_id": sailor_id,
        "boat_id": None,
        "source": "vakaros",
        "device_name": "VK-Test",
        "original_filename": f"{activity_id}.csv.gz",
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "start_lat": center_lat,
        "start_lon": center_lon,
        "end_lat": center_lat,
        "end_lon": center_lon,
        "center_lat": center_lat,
        "center_lon": center_lon,
        "min_lat": center_lat - 0.001 if min_lat is None else min_lat,
        "max_lat": center_lat + 0.001 if max_lat is None else max_lat,
        "min_lon": center_lon - 0.001 if min_lon is None else min_lon,
        "max_lon": center_lon + 0.001 if max_lon is None else max_lon,
        "sample_count": 10,
        "attachment_sha256": activity_id * 4,
    }


def _repositories(
    temporary_json_file: Callable[[str, object], Path],
    activity_records: list[dict[str, object]],
    session_records: list[dict[str, object]] | None = None,
) -> tuple[ActivityRepository, SessionRepository]:
    return (
        ActivityRepository(
            temporary_json_file("session-activities", activity_records)
        ),
        SessionRepository(
            temporary_json_file("sessions", session_records or [])
        ),
    )


def _match_second_activity(
    temporary_json_file: Callable[[str, object], Path],
    first: dict[str, object],
    second: dict[str, object],
):
    activities, sessions = _repositories(
        temporary_json_file,
        [first, second],
        [{"id": "session-a", "activity_ids": [first["id"]]}],
    )
    activity = activities.get_by_id(str(second["id"]))
    assert activity is not None
    return match_activity_to_session(activity, activities, sessions), sessions


def test_first_activity_creates_session_with_only_persisted_ids(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    record = _activity_record("activity-a", _time(10), _time(11))
    activities, sessions = _repositories(temporary_json_file, [record])
    activity = activities.get_by_id("activity-a")
    assert activity is not None

    result = match_activity_to_session(activity, activities, sessions)
    persisted = json.loads(sessions.path.read_text(encoding="utf-8"))[0]

    assert result.status == "created"
    assert str(UUID(result.session.id)) == result.session.id
    assert result.session.activity_ids == ["activity-a"]
    assert set(persisted) == {
        "id",
        "activity_ids",
        "created_at",
        "expires_at",
        "capability_token",
        "capability_revoked",
    }
    assert persisted["capability_token"] is None
    assert persisted["capability_revoked"] is False


def test_overlapping_activity_matches_existing_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(12)),
        _activity_record("activity-b", _time(11), _time(13), 0.01),
    )

    assert result.status == "matched"
    assert result.session.id == "session-a"


def test_gap_of_60_minutes_matches_existing_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(12), _time(13), 0.01),
    )

    assert result.status == "matched"


def test_gap_over_60_minutes_creates_another_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, sessions = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(12, 1), _time(13), 0.01),
    )

    assert result.status == "created"
    assert len(sessions.all()) == 2


def test_center_inside_three_nm_matches_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(10), _time(11), 0.02),
    )

    assert result.status == "matched"


def test_center_exactly_at_distance_threshold_matches_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    latitude_delta = math.degrees(
        MAX_SESSION_DISTANCE_NM / EARTH_RADIUS_NM
    )
    assert haversine_nm(0.0, 0.0, latitude_delta, 0.0) <= (
        MAX_SESSION_DISTANCE_NM + 1e-12
    )

    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record(
            "activity-b", _time(10), _time(11), latitude_delta
        ),
    )

    assert result.status == "matched"


def test_center_outside_three_nm_creates_another_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, sessions = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(10), _time(11), 0.06),
    )

    assert result.status == "created"
    assert len(sessions.all()) == 2


def test_bounding_box_overlap_is_not_required(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    first = _activity_record("activity-a", _time(10), _time(11))
    second = _activity_record("activity-b", _time(10), _time(11), 0.02)
    assert first["max_lat"] < second["min_lat"]

    result, _ = _match_second_activity(
        temporary_json_file,
        first,
        second,
    )

    assert result.status == "matched"


def test_session_summary_derives_center_and_bounding_box(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    first = _activity_record(
        "activity-a", _time(10), _time(11), 10.0, 20.0,
        min_lat=9.0, max_lat=11.0, min_lon=19.0, max_lon=21.0,
    )
    second = _activity_record(
        "activity-b", _time(11), _time(13), 12.0, 24.0,
        min_lat=11.5, max_lat=13.0, min_lon=23.0, max_lon=25.0,
    )
    activities, sessions = _repositories(
        temporary_json_file,
        [first, second],
        [{"id": "session-a", "activity_ids": ["activity-a", "activity-b"]}],
    )

    summary = derive_session_summary(sessions.all()[0], activities)

    assert summary.start_time == _time(10)
    assert summary.end_time == _time(13)
    assert summary.center_lat == 11.0
    assert summary.center_lon == 22.0
    assert summary.min_lat == 9.0
    assert summary.max_lat == 13.0
    assert summary.min_lon == 19.0
    assert summary.max_lon == 25.0


def test_late_arriving_activity_matches_older_sailing_session(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("late-email-activity", _time(10, 30), _time(11, 30)),
    )

    assert result.status == "matched"


def test_repeated_matching_is_idempotent_and_does_not_duplicate_id(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    record = _activity_record("activity-a", _time(10), _time(11))
    activities, sessions = _repositories(temporary_json_file, [record])
    activity = activities.get_by_id("activity-a")
    assert activity is not None

    first = match_activity_to_session(activity, activities, sessions)
    second = match_activity_to_session(activity, activities, sessions)

    assert first.session.id == second.session.id
    assert second.status == "already assigned"
    assert second.session.activity_ids.count("activity-a") == 1
    assert sum(
        session.activity_ids.count("activity-a")
        for session in sessions.all()
    ) == 1


def test_multiple_activities_from_same_sailor_are_allowed(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    result, _ = _match_second_activity(
        temporary_json_file,
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(10, 30), _time(11, 30)),
    )

    assert result.status == "matched"
    assert result.activity_count == 2


def test_candidate_ranking_prefers_temporal_midpoint(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    records = [
        _activity_record("activity-a", _time(10), _time(11), 0.0),
        _activity_record("activity-b", _time(11), _time(12), 0.01),
        _activity_record("activity-new", _time(10, 15), _time(11, 15), 0.01),
    ]
    activities, sessions = _repositories(
        temporary_json_file,
        records,
        [
            {"id": "session-a", "activity_ids": ["activity-a"]},
            {"id": "session-b", "activity_ids": ["activity-b"]},
        ],
    )
    activity = activities.get_by_id("activity-new")
    assert activity is not None

    result = match_activity_to_session(activity, activities, sessions)

    assert result.session.id == "session-a"


def test_candidate_ranking_uses_geographical_distance_second(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    records = [
        _activity_record("activity-a", _time(10), _time(11), 0.0),
        _activity_record("activity-b", _time(10), _time(11), 0.02),
        _activity_record("activity-new", _time(10), _time(11), 0.019),
    ]
    activities, sessions = _repositories(
        temporary_json_file,
        records,
        [
            {"id": "session-a", "activity_ids": ["activity-a"]},
            {"id": "session-b", "activity_ids": ["activity-b"]},
        ],
    )
    activity = activities.get_by_id("activity-new")
    assert activity is not None

    result = match_activity_to_session(activity, activities, sessions)

    assert result.session.id == "session-b"


def test_candidate_ranking_uses_session_id_as_final_tie_breaker(
    temporary_json_file: Callable[[str, object], Path],
) -> None:
    records = [
        _activity_record("activity-a", _time(10), _time(11)),
        _activity_record("activity-b", _time(10), _time(11)),
        _activity_record("activity-new", _time(10), _time(11)),
    ]
    activities, sessions = _repositories(
        temporary_json_file,
        records,
        [
            {"id": "session-z", "activity_ids": ["activity-a"]},
            {"id": "session-a", "activity_ids": ["activity-b"]},
        ],
    )
    activity = activities.get_by_id("activity-new")
    assert activity is not None

    result = match_activity_to_session(activity, activities, sessions)

    assert result.session.id == "session-a"
