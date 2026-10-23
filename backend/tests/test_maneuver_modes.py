"""HIGH/LOW selection, strict v7 contracts and lazy migration."""

from copy import deepcopy
import hashlib
from pathlib import Path

import pandas as pd
import pytest

from app.analytics.low_maneuver_detector import (
    _context_courses, detect_low_maneuvers, low_unavailable_reason,
)
from app.analytics.maneuver_detector import detect_maneuvers
from app.analytics.maneuver_metrics import calculate_maneuver_metrics
from app.normalization.track_normalizer import normalize_track
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.services.maneuver_analytics import (
    _is_valid_artifact, generate_maneuver_analytics,
    get_or_generate_maneuver_analytics, inspect_maneuver_analytics,
)
from app.storage.maneuver_analytics_storage import ManeuverAnalyticsStorage
from app.storage.track_storage import TrackStorage


ACTIVITY = "10000000-0000-4000-8000-000000000001"


def low_track(*, straight=False, step=1):
    return normalize_track(ACTIVITY, [
        {"utc": pd.Timestamp("2031-06-01T09:00:00Z") + pd.Timedelta(seconds=t),
         "lat": 39, "lon": -.3, "sog": 5,
         "cog": (330 + (0 if straight else 9 * min(10, max(0, t - 20)) )) % 360}
        for t in [i * step for i in range(int(90 / step) + 1)]
    ])


def test_corrected_phases_context_boundaries():
    # First/last seed at 0/3: include outer endpoints -10/+13,
    # exclude inner endpoints -2/+5. Those inner courses would corrupt means.
    times = [-10, -4, -3, -2, 0, 3, 5, 6, 7, 13]
    courses = [350, 350, 350, 170, 350, 40, 220, 40, 40, 40]
    assert _context_courses(times, courses, 4, 5) == pytest.approx((350, 40))


@pytest.mark.parametrize("step", [.5, 1, 2])
@pytest.mark.parametrize("straight", [False, True])
def test_low_evidence_can_be_available_with_or_without_events(step, straight):
    track = low_track(step=step, straight=straight)
    assert low_unavailable_reason(track) is None
    assert bool(detect_low_maneuvers(track)) is not straight


@pytest.mark.parametrize("column,value,reason", [
    ("cog", None, "missing_cog"), ("cog", float("inf"), "missing_cog"),
    ("sog", None, "missing_sog"), ("sog", float("nan"), "missing_sog"),
    ("sog", -1, "missing_sog"), ("sog", 0, "insufficient_low_speed"),
    ("sog", 1.49, "insufficient_low_speed"), ("utc", "bad", "invalid_time"),
])
def test_low_unavailable_signals(column, value, reason):
    track = low_track()
    track[column] = value
    assert low_unavailable_reason(track) == reason


def test_low_context_is_not_combined_across_invalid_time_missing_signals_or_gaps():
    for column in ("utc", "cog", "sog"):
        track = low_track().iloc[:24].copy()
        track[column] = track[column].astype(object)
        track.loc[track.index % 6 == 0, column] = None
        assert low_unavailable_reason(track) == "insufficient_low_context"
    for offsets in ([0, 1, 2, 0, 1, 2], [0, 1, 2, 20, 21, 22]):
        track = low_track().iloc[:6].copy()
        track.utc = [pd.Timestamp("2031-06-01T09:00:00Z") + pd.Timedelta(seconds=t) for t in offsets]
        assert low_unavailable_reason(track) == "insufficient_low_context"
    assert low_unavailable_reason(low_track().iloc[:5]) == "insufficient_low_context"
    assert low_unavailable_reason(low_track(step=5)) == "insufficient_low_context"


@pytest.mark.parametrize("mode", ["HIGH", "LOW", None])
def test_v6_is_regenerated_lazily_instead_of_relabelled(temporary_directory, mode):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    track = low_track()
    if mode == "HIGH":
        track.hdg = track.cog
    elif mode is None:
        track.cog = None
    tracks.write_normalized_track(ACTIVITY, track)
    before = tracks.track_path(ACTIVITY).read_bytes()
    legacy = {
        "activity_id": ACTIVITY, "algorithm_version": 6,
        "track_sha256": hashlib.sha256(before).hexdigest(),
        "status": "available" if mode == "HIGH" else "unavailable",
        "maneuvers": [],
    }
    if mode != "HIGH":
        legacy["reason"] = "missing_hdg"
    artifacts.write(ACTIVITY, legacy)
    legacy_bytes = artifacts.artifact_path(ACTIVITY).read_bytes()
    assert inspect_maneuver_analytics(ACTIVITY, tracks, artifacts).artifact_currency == "stale"
    assert artifacts.artifact_path(ACTIVITY).read_bytes() == legacy_bytes
    result = get_or_generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    assert result["algorithm_version"] == 7
    assert result["detector_mode"] == mode
    assert result["status"] == ("available" if mode else "unavailable")
    assert bool(result["maneuvers"]) == bool(mode)
    assert _is_valid_artifact(result, ACTIVITY)
    assert get_or_generate_maneuver_analytics(ACTIVITY, tracks, artifacts) == result
    assert tracks.track_path(ACTIVITY).read_bytes() == before


def test_high_without_heel_and_zero_events_never_falls_through(temporary_directory, monkeypatch):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    track = low_track()
    track.hdg = 40  # LOW would find a turn, but sufficient stable HDG selects HIGH.
    tracks.write_normalized_track(ACTIVITY, track)
    def fail(_track):
        raise AssertionError("LOW must not run")
    monkeypatch.setattr("app.services.maneuver_analytics.low_unavailable_reason", fail)
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    assert result["status"] == "available"
    assert result["detector_mode"] == "HIGH"
    assert result["signal_basis"] == ["hdg"]
    assert result["maneuvers"] == []


def test_low_angle_null_peak_and_existing_sog_metrics(temporary_directory):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    track = low_track()
    tracks.write_normalized_track(ACTIVITY, track)
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    event, = result["maneuvers"]
    candidate, = detect_low_maneuvers(track)
    assert event["heading_change_deg"] is None
    assert event["course_change_deg"] == candidate.cog_change_deg == pytest.approx(90, abs=1)
    assert event["peak_turn_rate_deg_s"] is event["peak_turn_rate_time"] is None
    for key, value in calculate_maneuver_metrics(track, candidate).to_dict().items():
        assert event[key] == value
    assert event["sog_entry_kn"] == event["sog_exit_kn"] == 5
    assert event["speed_loss_distance_m"] == event["recovery_time_s"] == 0


def test_low_zero_events_is_current_and_short_track_metrics_remain_null(temporary_directory, monkeypatch):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY, low_track(straight=True))
    zero = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    assert zero["status"] == "available" and zero["detector_mode"] == "LOW"
    assert zero["maneuvers"] == []
    assert _is_valid_artifact(zero, ACTIVITY)
    def fail(_track):
        raise AssertionError("current LOW zero-event artifact must be reused")
    with monkeypatch.context() as patch:
        patch.setattr("app.services.maneuver_analytics.detect_maneuvers", fail)
        assert get_or_generate_maneuver_analytics(ACTIVITY, tracks, artifacts) == zero
    tracks.write_normalized_track(ACTIVITY, low_track().iloc[:45])
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    event, = result["maneuvers"]
    for field in ("sog_exit_kn", "recovery_time_s", "speed_loss_distance_m", "speed_loss_time_s"):
        assert event[field] is None


@pytest.mark.parametrize("change", [
    {"detector_mode": "LOW"}, {"signal_basis": ["cog"]},
    {"signal_basis": ["hdg", "heel", "heel"]}, {"signal_basis": ["hdg", "trim"]},
    {"status": "unavailable", "reason": "missing_cog"},
])
def test_high_mode_signal_and_status_combinations_are_strict(temporary_directory, change):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    track = low_track()
    track.hdg = track.cog
    tracks.write_normalized_track(ACTIVITY, track)
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    result.update(change)
    assert not _is_valid_artifact(result, ACTIVITY)


def test_unavailable_mode_reason_signals_and_events_are_consistent(temporary_directory):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY, low_track().assign(cog=None))
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    assert result["detector_mode"] is None and result["signal_basis"] == []
    for changes in ({"detector_mode": "LOW"}, {"signal_basis": ["cog", "sog"]},
                    {"reason": []}, {"reason": "missing_hdg"}, {"maneuvers": [{}]}):
        assert not _is_valid_artifact({**result, **changes}, ACTIVITY)


@pytest.mark.parametrize("change", [
    {"detector_mode": None}, {"detector_mode": "MEDIUM"}, {"signal_basis": ["hdg"]},
    {"signal_basis": ["cog", "sog", "heel"]}, {"signal_basis": ["cog", "cog"]},
    {"status": "unavailable"}, {"reason": "missing_hdg"}, {"algorithm_version": "7"},
    {"algorithm_version": True}, {"track_sha256": "z" * 64},
])
def test_malformed_v7_artifacts_regenerate(temporary_directory, change):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY, low_track())
    expected = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    malformed = {**deepcopy(expected), **change}
    assert not _is_valid_artifact(malformed, ACTIVITY)
    artifacts.write(ACTIVITY, malformed)
    assert get_or_generate_maneuver_analytics(ACTIVITY, tracks, artifacts) == expected


@pytest.mark.parametrize("field,value", [
    ("heading_change_deg", 90), ("course_change_deg", None),
    ("course_change_deg", float("nan")), ("peak_turn_rate_deg_s", 2),
    ("peak_turn_rate_time", "2031-06-01T09:00:25Z"), ("center_time", "bad"),
    ("end_time", "2031-06-01T08:00:00Z"), ("duration_s", 99),
])
def test_low_event_contract_rejects_fabricated_angles_rates_and_times(temporary_directory, field, value):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    tracks.write_normalized_track(ACTIVITY, low_track())
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    result["maneuvers"][0][field] = value
    assert not _is_valid_artifact(result, ACTIVITY)


def test_rich_high_results_preserved_and_comparison_does_not_touch_artifacts(temporary_directory):
    tracks, artifacts = TrackStorage(temporary_directory), ManeuverAnalyticsStorage(temporary_directory)
    source = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
    track = normalize_track(ACTIVITY, parse_vakaros_csv(source).samples)
    before = track.copy(deep=True)
    high = detect_maneuvers(track)
    tracks.write_normalized_track(ACTIVITY, track)
    result = generate_maneuver_analytics(ACTIVITY, tracks, artifacts)
    artifact_bytes = artifacts.artifact_path(ACTIVITY).read_bytes()
    low = detect_low_maneuvers(track)
    assert len(high.maneuvers) == 38 and len(low) == 9
    assert result["signal_basis"] == list(high.signal_basis)
    assert set(result["signal_basis"]) == {"hdg", "cog", "heel", "sog"}
    for actual, original in zip(result["maneuvers"], high.maneuvers):
        assert all(actual[k] == v for k, v in original.to_dict().items())
        assert actual["course_change_deg"] is None
    assert _is_valid_artifact(result, ACTIVITY)
    assert artifacts.artifact_path(ACTIVITY).read_bytes() == artifact_bytes
    pd.testing.assert_frame_equal(track, before)
    # Research matching by overlapping intervals, each HIGH used at most once.
    # These are fixture observations, not precision/recall or ground truth.
    matched = []
    used = set()
    for candidate in low:
        overlaps = [
            (abs((pd.Timestamp(candidate.center_time) - pd.Timestamp(event.center_time)).total_seconds()), i, event)
            for i, event in enumerate(high.maneuvers)
            if i not in used and max(pd.Timestamp(candidate.start_time), pd.Timestamp(event.start_time))
            <= min(pd.Timestamp(candidate.end_time), pd.Timestamp(event.end_time))
        ]
        if overlaps:
            _, index, event = min(overlaps, key=lambda item: item[0])
            used.add(index)
            matched.append((event, candidate))
    assert len(matched) == 6
    for field in ("speed_loss_distance_m", "speed_loss_time_s", "recovery_time_s"):
        comparable = [
            (calculate_maneuver_metrics(track, h).to_dict()[field],
             calculate_maneuver_metrics(track, l).to_dict()[field])
            for h, l in matched
        ]
        assert sum(a is not None and b is not None for a, b in comparable) == 3
