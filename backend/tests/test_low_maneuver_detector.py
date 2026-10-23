"""Regression for the isolated #112.1 Phases baseline, not production selection."""

from dataclasses import asdict
from pathlib import Path

import pandas as pd
import pytest

from app.analytics.low_maneuver_detector import detect_low_maneuvers
from app.analytics.maneuver_detector import detect_maneuvers
from app.normalization.track_normalizer import normalize_track
from app.parsers.gpx import parse_gpx
from app.parsers.vakaros_csv import parse_vakaros_csv


FIXTURES = Path(__file__).parent / "fixtures"
START = pd.Timestamp("2031-01-01T10:00:00Z")


def _track(*, times=None, direction=1, initial=20, speed=5, course=None):
    times = list(range(71)) if times is None else times
    if course is None:
        course = lambda t: initial + direction * 9 * min(10, max(0, t - 20))
    return pd.DataFrame({
        "utc": [START + pd.Timedelta(seconds=t) for t in times],
        "cog": [course(t) % 360 for t in times],
        "sog": speed,
    })


@pytest.mark.parametrize("direction,initial", [(1, 20), (-1, 110), (1, 330), (-1, 30)])
def test_candidate_formation_and_circular_context(direction, initial):
    track = _track(direction=direction, initial=initial)
    candidate, = detect_low_maneuvers(track)
    assert candidate.cog_change_deg == pytest.approx(direction * 90, abs=1)
    assert pd.Timestamp(candidate.start_time) < pd.Timestamp(candidate.center_time) < pd.Timestamp(candidate.end_time)
    assert abs((pd.Timestamp(candidate.center_time) - START).total_seconds() - 25) <= 1
    assert candidate.detector_mode == "LOW"
    assert candidate.signal_basis == ("cog", "sog")
    assert "heading_change_deg" not in asdict(candidate)


def test_center_is_first_sample_reaching_half_absolute_rotation():
    # Asymmetric turn: 60 degrees in four seconds, then 40 in eight seconds.
    def course(t):
        return 20 + 15 * min(4, max(0, t - 20)) + 5 * min(8, max(0, t - 24))

    track = _track(course=course)
    candidate, = detect_low_maneuvers(track)
    # The smoothed course first crosses half rotation at t24, after t23 and
    # before the temporal midpoint at t25. Center is an existing sample.
    assert pd.Timestamp(candidate.center_time) == START + pd.Timedelta(seconds=24)
    midpoint = pd.Timestamp(candidate.start_time) + (pd.Timestamp(candidate.end_time) - pd.Timestamp(candidate.start_time)) / 2
    assert pd.Timestamp(candidate.center_time) == midpoint - pd.Timedelta(seconds=1)


@pytest.mark.parametrize("speed", [0, 0.5, 1.49])
def test_low_speed_and_stationary_rotation_cannot_seed(speed):
    assert detect_low_maneuvers(_track(speed=speed)) == ()


def test_recorded_speed_threshold_is_inclusive_and_no_speed_drop_is_required():
    assert len(detect_low_maneuvers(_track(speed=1.5))) == 1


@pytest.mark.parametrize("column", ["utc", "cog", "sog"])
def test_missing_required_columns_do_not_use_rich_or_gps_signals(column):
    track = _track().drop(columns=column).assign(hdg=90, heel=10, lat=39, lon=-0.3)
    assert detect_low_maneuvers(track) == ()


@pytest.mark.parametrize("column,value", [
    ("cog", None), ("cog", float("nan")), ("cog", float("inf")), ("cog", "bad"),
    ("sog", None), ("sog", float("nan")), ("sog", float("inf")), ("sog", -1),
    ("sog", "bad"), ("utc", None), ("utc", "bad"),
])
def test_invalid_evidence_is_a_break_not_a_dropped_or_filled_sample(column, value):
    track = _track()
    track[column] = track[column].astype(object)
    track.loc[23:27, column] = value
    assert detect_low_maneuvers(track) == ()


def test_stationary_missing_bearing_is_not_filled():
    track = _track()
    track["cog"] = None
    track["sog"] = 0
    assert detect_low_maneuvers(track) == ()


@pytest.mark.parametrize("gap", [10.001, 30])
def test_gap_in_turn_is_not_bridged(gap):
    track = _track()
    track.loc[25:, "utc"] += pd.Timedelta(seconds=gap - 1)
    assert detect_low_maneuvers(track) == ()


@pytest.mark.parametrize("offset", [0, -5])
def test_non_increasing_time_splits_evidence_without_sorting(offset):
    track = _track()
    track.loc[25:, "utc"] -= pd.Timedelta(seconds=1 - offset)
    assert detect_low_maneuvers(track) == ()


def test_every_run_is_evaluated_including_shorter_runs():
    first = _track()
    second = _track(times=list(range(90)), direction=-1)
    second.utc += pd.Timedelta(seconds=100)
    combined = pd.concat([first, second], ignore_index=True)
    assert detect_low_maneuvers(combined) == detect_low_maneuvers(first) + detect_low_maneuvers(second)
    assert len(detect_low_maneuvers(combined)) == 2


@pytest.mark.parametrize("step", [0.5, 1, 2])
def test_regular_cadences_use_seconds_not_sample_counts(step):
    track = _track(times=[i * step for i in range(int(70 / step) + 1)])
    candidate, = detect_low_maneuvers(track)
    assert candidate.cog_change_deg == pytest.approx(90, abs=2)
    assert abs((pd.Timestamp(candidate.center_time) - START).total_seconds() - 25) <= 2


def test_irregular_cadence_uses_actual_elapsed_time():
    times = [0.0]
    intervals = [0.6, 1.4, 0.8, 1.2]
    for i in range(70):
        times.append(times[-1] + intervals[i % len(intervals)])
    candidate, = detect_low_maneuvers(_track(times=times))
    assert candidate.cog_change_deg == pytest.approx(90, abs=2)
    assert abs((pd.Timestamp(candidate.center_time) - START).total_seconds() - 25) <= 2


def test_coarse_cadence_does_not_invent_seeds_or_context():
    assert detect_low_maneuvers(_track(times=list(range(0, 71, 5)))) == ()


@pytest.mark.parametrize("course", [
    lambda t: 20,
    lambda t: 20 + (2 if t % 2 else -2),
    lambda t: 20 + 3 * min(10, max(0, t - 20)),  # Below 35-degree context change.
    lambda t: 20 + 1.5 * min(40, max(0, t - 10)),  # Gradual 60-degree miss: no seeds.
    lambda t: 20 + 4 * min(50, max(0, t - 10)),  # Over 35 seconds.
    lambda t: 20 + (90 if t == 25 else 0),  # Isolated course outlier.
])
def test_non_candidate_patterns(course):
    assert detect_low_maneuvers(_track(course=course)) == ()


def test_insufficient_before_or_after_context_rejects_candidate():
    for times in (list(range(20, 71)), list(range(32))):
        assert detect_low_maneuvers(_track(times=times)) == ()


def test_interval_median_speed_rejects_sparse_fast_seeds():
    track = _track(speed=0.5)
    track.loc[track.index % 3 == 0, "sog"] = 5
    assert detect_low_maneuvers(track) == ()


def test_incoherent_zigzag_rejects_large_net_context_change():
    def course(t):
        if t <= 20:
            return 20
        if t >= 40:
            return 110
        return 20 + 4.5 * (t - 20) + (70 if t % 4 < 2 else -70)

    assert detect_low_maneuvers(_track(course=course)) == ()


def test_antipodal_smoothed_evidence_has_no_invented_mean_direction():
    track = _track(times=[i * 0.5 for i in range(141)])
    track.cog = [0 if i % 2 else 180 for i in range(len(track))]
    assert detect_low_maneuvers(track) == ()


@pytest.mark.parametrize("filename,expected", [
    ("2025-06-21-ESP29375-P01.gpx", 21),
    ("2025-06-21-ESP30782-P01.gpx", 16),
])
def test_representative_canonical_gpx(filename, expected):
    # Recorded PoC: 21/16 respectively. Canonical input yields 21/16; preserve
    # the difference for review rather than tuning thresholds to recover counts.
    track = normalize_track("review", parse_gpx(FIXTURES / filename).samples)
    before = track.copy(deep=True)
    candidates = detect_low_maneuvers(track)
    assert len(candidates) == expected
    assert candidates == detect_low_maneuvers(track)
    pd.testing.assert_frame_equal(track, before)
    for candidate in candidates:
        assert {candidate.start_time, candidate.center_time, candidate.end_time} <= set(track.utc)
    assert detect_maneuvers(track).status == "unavailable"


def test_known_real_gradual_turn_misses_remain_review_cases():
    # Canonical excerpts of public ESP29375 P02, +/-60s around the two map
    # review marks in #112. Extracted via parse_gpx + normalize_track, without
    # altering COG/SOG. The >10s separation deliberately exercises both runs.
    # Source: https://github.com/maxsail-project/maxsail-analytics/blob/main/2025-06-21-ESP29375-P02.gpx
    track = pd.read_csv(FIXTURES / "esp29375-p02-gradual-turns.csv.gz")
    assert len(track) == 242
    for mark in ("12:19:30", "12:33:42"):
        target = pd.Timestamp(f"2025-06-21T{mark}Z")
        times = pd.to_datetime(track.utc, utc=True)
        context = track.loc[abs(times - target) <= pd.Timedelta(seconds=60)]
        assert len(context) == 121
        assert 4.5 < context.sog.median() < 6
        assert not any(abs(pd.Timestamp(c.center_time) - target) <= pd.Timedelta(seconds=12) for c in detect_low_maneuvers(context))


def test_rich_track_can_run_both_detectors_without_changing_input_or_high():
    track = normalize_track("review", parse_vakaros_csv(FIXTURES / "vakaros-demo.csv.gz").samples)
    before = track.copy(deep=True)
    high = detect_maneuvers(track)
    low = detect_low_maneuvers(track)
    assert len(high.maneuvers) == 38
    assert len(low) == 9
    assert low == detect_low_maneuvers(track[["utc", "cog", "sog"]])
    assert high == detect_maneuvers(track)
    pd.testing.assert_frame_equal(track, before)
