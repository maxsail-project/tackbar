from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app.analytics.circular_angles import (
    accumulated_signed_heading_change,
    signed_angular_difference,
)
from app.analytics.maneuver_detector import (
    MAX_SAMPLE_GAP_SECONDS,
    calculate_local_turn_rates,
    detect_maneuvers,
)


def _track(
    phases: list[tuple[float, float]],
    *,
    initial_heading: float = 40.0,
    step_seconds: float = 0.5,
    heel: float | None = None,
    cog: float | None = None,
    sog: float | None = None,
) -> pd.DataFrame:
    start = datetime(2031, 1, 1, 10, 0, tzinfo=timezone.utc)
    elapsed = 0.0
    heading = initial_heading
    rows = []
    for duration, rate in phases:
        sample_count = round(duration / step_seconds)
        for _ in range(sample_count):
            rows.append({
                "utc": (start + timedelta(seconds=elapsed)).isoformat(timespec="milliseconds"),
                "hdg": heading % 360.0,
                "heel": heel,
                "cog": cog,
                "sog": sog,
            })
            elapsed += step_seconds
            heading += rate * step_seconds
    rows.append({
        "utc": (start + timedelta(seconds=elapsed)).isoformat(timespec="milliseconds"),
        "hdg": heading % 360.0,
        "heel": heel,
        "cog": cog,
        "sog": sog,
    })
    return pd.DataFrame(rows)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (359.0, 1.0, 2.0),
        (1.0, 359.0, -2.0),
        (355.0, 5.0, 10.0),
        (5.0, 355.0, -10.0),
    ],
)
def test_signed_angular_difference_crosses_north_safely(
    start: float,
    end: float,
    expected: float,
) -> None:
    assert signed_angular_difference(start, end) == expected


def test_accumulated_heading_change_preserves_rotation_sign() -> None:
    assert accumulated_signed_heading_change([350, 355, 1, 8]) == 18
    assert accumulated_signed_heading_change([8, 1, 355, 350]) == -18


def test_constant_heading_has_near_zero_local_turn_rate() -> None:
    rates = calculate_local_turn_rates(_track([(12, 0)]))
    finite_rates = [sample.turn_rate_deg_s for sample in rates if sample.turn_rate_deg_s is not None]

    assert finite_rates
    assert max(abs(rate) for rate in finite_rates) < 0.001


@pytest.mark.parametrize("rate", [10.0, -10.0])
def test_local_turn_rate_preserves_steady_rotation_direction(rate: float) -> None:
    rates = calculate_local_turn_rates(_track([(12, rate)], initial_heading=350))
    center_rates = [
        sample.turn_rate_deg_s
        for sample in rates[6:-6]
        if sample.turn_rate_deg_s is not None
    ]

    assert center_rates
    assert all(value == pytest.approx(rate, abs=0.2) for value in center_rates)
    assert max(abs(value) for value in center_rates) < 20


def test_local_turn_rate_uses_irregular_elapsed_timestamps() -> None:
    start = datetime(2031, 1, 1, tzinfo=timezone.utc)
    elapsed_values = [0, 0.4, 1.1, 1.7, 2.6, 3.1, 4.2, 5.0, 6.1]
    track = pd.DataFrame({
        "utc": [(start + timedelta(seconds=value)).isoformat() for value in elapsed_values],
        "hdg": [(350 + 10 * value) % 360 for value in elapsed_values],
    })

    rates = calculate_local_turn_rates(track)
    finite_rates = [sample.turn_rate_deg_s for sample in rates if sample.turn_rate_deg_s is not None]

    assert finite_rates
    assert all(value == pytest.approx(10.0, abs=0.6) for value in finite_rates)


def test_turn_rate_does_not_bridge_large_gaps_and_has_empty_edges() -> None:
    track = _track([(5, 10)])
    timestamps = pd.to_datetime(track["utc"], utc=True, format="mixed")
    track.loc[6:, "utc"] = (
        timestamps[6:] + timedelta(seconds=MAX_SAMPLE_GAP_SECONDS + 5)
    ).map(lambda value: value.isoformat())

    rates = calculate_local_turn_rates(track)

    assert rates[0].turn_rate_deg_s is None
    assert rates[-1].turn_rate_deg_s is None
    assert all(
        not (rates[index].elapsed_seconds < rates[6].elapsed_seconds < rates[index + 1].elapsed_seconds)
        for index in range(len(rates) - 1)
    )


@pytest.mark.parametrize(
    ("rate", "expected_sign"),
    [(15.0, 1), (-15.0, -1)],
)
def test_detects_stable_turn_stable_maneuver(rate: float, expected_sign: int) -> None:
    result = detect_maneuvers(_track([(5, 0), (7, rate), (5, 0)]))

    assert result.status == "available"
    assert len(result.maneuvers) == 1
    maneuver = result.maneuvers[0]
    assert maneuver.heading_change_deg * expected_sign >= 45
    assert maneuver.start_time < maneuver.center_time < maneuver.end_time
    assert maneuver.peak_turn_rate_deg_s > 0


def test_detects_north_crossing_without_optional_context() -> None:
    track = _track(
        [(5, 0), (7, 15), (5, 0)],
        initial_heading=330,
        heel=None,
        cog=None,
        sog=None,
    )

    result = detect_maneuvers(track)

    assert result.status == "available"
    assert len(result.maneuvers) == 1
    assert 80 <= result.maneuvers[0].heading_change_deg <= 120


def test_center_time_uses_heading_midpoint_not_temporal_midpoint() -> None:
    track = _track([(5, 0), (2, 30), (8, 5), (5, 0)])

    maneuver = detect_maneuvers(track).maneuvers[0]
    rate_samples = calculate_local_turn_rates(track)
    start = pd.Timestamp(maneuver.start_time)
    center = pd.Timestamp(maneuver.center_time)
    end = pd.Timestamp(maneuver.end_time)
    temporal_midpoint = start + (end - start) / 2
    start_index = next(
        index for index, sample in enumerate(rate_samples)
        if sample.timestamp == maneuver.start_time
    )
    center_index = next(
        index for index, sample in enumerate(rate_samples)
        if sample.timestamp == maneuver.center_time
    )
    end_index = next(
        index for index, sample in enumerate(rate_samples)
        if sample.timestamp == maneuver.end_time
    )
    changes = [
        signed_angular_difference(first.smoothed_heading, second.smoothed_heading)
        for first, second in zip(
            rate_samples[start_index:end_index],
            rate_samples[start_index + 1:end_index + 1],
        )
    ]
    center_change = sum(changes[:center_index - start_index])

    assert center < temporal_midpoint - timedelta(seconds=1)
    assert center_change == pytest.approx(sum(changes) / 2, abs=5)


@pytest.mark.parametrize(
    "track",
    [
        _track([(12, 0)], initial_heading=40),
        pd.DataFrame({
            "utc": pd.date_range("2031-01-01", periods=30, freq="500ms", tz="UTC"),
            "hdg": [40 + (1 if index % 2 else -1) for index in range(30)],
        }),
        _track([(5, 0), (3, 10), (5, 0)]),
        _track([(5, 0), (0.5, 100), (5, 0)]),
        _track([(5, 0), (36, 10), (5, 0)]),
    ],
)
def test_rejects_non_maneuver_heading_patterns(track: pd.DataFrame) -> None:
    result = detect_maneuvers(track)

    assert result.status == "available"
    assert result.maneuvers == ()


def test_rejects_alternating_rotation_and_gapped_candidate() -> None:
    alternating = _track([(5, 0), (2, 15), (2, -15), (2, 15), (2, -15), (5, 0)])
    gapped = _track([(5, 0), (7, 15), (5, 0)])
    timestamps = pd.to_datetime(gapped["utc"], utc=True, format="mixed")
    gapped.loc[16:, "utc"] = (
        timestamps[16:] + timedelta(seconds=10)
    ).map(lambda value: value.isoformat())

    assert detect_maneuvers(alternating).maneuvers == ()
    assert detect_maneuvers(gapped).maneuvers == ()


def test_missing_and_insufficient_hdg_are_explicitly_unavailable() -> None:
    timestamps = pd.date_range("2031-01-01", periods=40, freq="500ms", tz="UTC")
    missing = pd.DataFrame({"utc": timestamps, "hdg": [None] * 40})
    mostly_missing = pd.DataFrame({
        "utc": timestamps,
        "hdg": [40.0, 41.0] + [None] * 38,
    })

    assert detect_maneuvers(missing).reason == "missing_hdg"
    assert detect_maneuvers(mostly_missing).reason == "insufficient_hdg"
    assert detect_maneuvers(_track([(3, 0)])).reason == "insufficient_hdg"


def test_detected_maneuvers_do_not_overlap() -> None:
    track = _track([
        (5, 0),
        (7, 15),
        (5, 0),
        (7, -15),
        (5, 0),
    ])
    result = detect_maneuvers(track)

    assert len(result.maneuvers) == 2
    assert result.maneuvers[0].end_time < result.maneuvers[1].start_time
    timestamps = set(track["utc"].map(
        lambda value: pd.Timestamp(value).isoformat().replace("+00:00", "Z")
    ))
    for maneuver in result.maneuvers:
        assert {
            maneuver.start_time,
            maneuver.center_time,
            maneuver.end_time,
        } <= timestamps
