from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app.analytics.circular_angles import (
    accumulated_signed_heading_change,
    signed_angular_difference,
)
from app.analytics.maneuver_detector import (
    CANDIDATE_SEED_TURN_RATE_DEG_S,
    MAX_SAMPLE_GAP_SECONDS,
    analyze_maneuver_candidates,
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


def _with_multisensor_support(
    track: pd.DataFrame,
    *,
    sog_start: float = 6.0,
    sog_end: float = 4.0,
) -> pd.DataFrame:
    supported = track.copy()
    denominator = max(len(supported) - 1, 1)
    progress = [index / denominator for index in range(len(supported))]
    supported["cog"] = supported["hdg"]
    supported["heel"] = [-8.0 + 16.0 * value for value in progress]
    supported["sog"] = [
        sog_start + (sog_end - sog_start) * value
        for value in progress
    ]
    return supported


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


def test_gradual_entry_is_detected_with_multisensor_support() -> None:
    track = _with_multisensor_support(
        _track([(5, 0), (4, 5), (4, 7), (5, 0)])
    )
    rate_samples = calculate_local_turn_rates(track)

    result = detect_maneuvers(track)

    assert result.status == "available"
    assert len(result.maneuvers) == 1
    maneuver = result.maneuvers[0]
    start_index = next(
        index
        for index, sample in enumerate(rate_samples)
        if sample.timestamp == maneuver.start_time
    )
    assert any(
        sample.turn_rate_deg_s is not None
        and abs(sample.turn_rate_deg_s) < CANDIDATE_SEED_TURN_RATE_DEG_S
        for sample in rate_samples[start_index + 1:]
        if sample.timestamp <= maneuver.end_time
    )
    assert maneuver.heading_change_deg >= 45


def test_sustained_four_point_five_degree_turn_can_become_a_candidate() -> None:
    track = _with_multisensor_support(
        _track([(5, 0), (10, 4.5), (5, 0)])
    )

    result = detect_maneuvers(track)

    assert len(result.maneuvers) == 1
    assert result.maneuvers[0].heading_change_deg >= 45


def test_candidate_below_old_coherence_threshold_survives_strong_support() -> None:
    track = _with_multisensor_support(
        _track([(5, 0), (3, 15), (1, -38), (3, 15), (5, 0)])
    )

    assessments = analyze_maneuver_candidates(track)
    accepted = [assessment for assessment in assessments if assessment.accepted]

    assert len(accepted) == 1
    assert 0.55 <= accepted[0].directional_coherence < 0.7
    assert accepted[0].cog_support
    assert accepted[0].heel_support
    assert accepted[0].sog_support


def test_heel_supports_direction_but_cannot_create_a_maneuver() -> None:
    supported = _with_multisensor_support(_track([(5, 0), (7, 10), (5, 0)]))
    heel_only = _with_multisensor_support(_track([(17, 0)]))

    assessment = next(
        item for item in analyze_maneuver_candidates(supported)
        if item.accepted
    )

    assert assessment.heel_support
    assert detect_maneuvers(heel_only).maneuvers == ()


def test_heel_excursion_can_support_without_crossing_zero() -> None:
    track = _track([(5, 0), (7, 10), (5, 0)], sog=5.0)
    track["heel"] = [
        2.0 + 8.0 * index / (len(track) - 1)
        for index in range(len(track))
    ]

    assessment = next(
        item for item in analyze_maneuver_candidates(track)
        if item.accepted
    )

    assert assessment.heel_support


@pytest.mark.parametrize(
    ("sog_start", "sog_end"),
    [(7.0, 4.0), (4.0, 7.0)],
)
def test_sog_loss_and_acceleration_are_both_compatible_support(
    sog_start: float,
    sog_end: float,
) -> None:
    track = _with_multisensor_support(
        _track([(5, 0), (7, 10), (5, 0)]),
        sog_start=sog_start,
        sog_end=sog_end,
    )

    assessment = next(
        item for item in analyze_maneuver_candidates(track)
        if item.accepted
    )

    assert assessment.sog_support
    assert len(detect_maneuvers(track).maneuvers) == 1


def test_stable_sog_does_not_veto_a_strong_directional_maneuver() -> None:
    track = _track([(5, 0), (7, 15), (5, 0)], sog=5.0)

    assert len(detect_maneuvers(track).maneuvers) == 1


def test_very_strong_direction_at_segment_start_needs_no_optional_support() -> None:
    track = _track([(10, 15), (5, 0)], sog=5.0)

    accepted = [
        item for item in analyze_maneuver_candidates(track)
        if item.accepted
    ]

    assert len(accepted) == 1
    assert not accepted[0].prior_stability_support
    assert not accepted[0].cog_support
    assert not accepted[0].heel_support
    assert not accepted[0].sog_support


def test_prior_stability_is_supporting_evidence_not_a_veto() -> None:
    track = _with_multisensor_support(
        _track([(4, 6), (7, 10), (5, 0)])
    )

    accepted = [
        item for item in analyze_maneuver_candidates(track)
        if item.accepted
    ]

    assert len(accepted) == 1
    assert not accepted[0].prior_stability_support
    assert len(detect_maneuvers(track).maneuvers) == 1


def test_noisy_directional_candidate_without_combined_support_is_rejected() -> None:
    track = _track([(4, 6), (3, 15), (1, -38), (3, 15), (4, 6)])

    assessments = analyze_maneuver_candidates(track)

    assert any(
        assessment.reason == "insufficient_support"
        for assessment in assessments
    )
    assert detect_maneuvers(track).maneuvers == ()


def test_single_heel_and_sog_outliers_do_not_create_support() -> None:
    track = _track([(4, 6), (3, 15), (1, -35), (3, 15), (4, 6)])
    track["heel"] = 0.0
    track["sog"] = 5.0
    track.loc[len(track) // 2, "heel"] = 30.0
    track.loc[len(track) // 2, "sog"] = 12.0

    assessments = analyze_maneuver_candidates(track)
    relevant = max(
        assessments,
        key=lambda assessment: abs(assessment.heading_change_deg),
    )

    assert not relevant.heel_support
    assert not relevant.sog_support
    assert not relevant.accepted


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


def test_cog_agreement_is_circular_through_north() -> None:
    track = _track([(5, 0), (7, 15), (5, 0)], initial_heading=330)
    track["cog"] = track["hdg"]

    assessment = next(
        item for item in analyze_maneuver_candidates(track)
        if item.accepted
    )

    assert assessment.cog_support
    assert assessment.cog_change_deg is not None
    assert 80 <= assessment.cog_change_deg <= 120


def test_two_isolated_cog_samples_do_not_create_support() -> None:
    track = _track([(7, 10), (5, 0)])
    track["cog"] = None
    track.loc[8, "cog"] = 0.0
    track.loc[9, "cog"] = 30.0

    relevant = max(
        analyze_maneuver_candidates(track),
        key=lambda item: abs(item.heading_change_deg),
    )

    assert relevant.cog_change_deg == 30.0
    assert not relevant.cog_support
    assert not relevant.accepted


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
    target_change = sum(changes) / 2
    expected_center_offset = min(
        range(1, len(changes)),
        key=lambda offset: abs(sum(changes[:offset]) - target_change),
    )

    assert center < temporal_midpoint - timedelta(seconds=1)
    assert center_change == pytest.approx(sum(changes) / 2, abs=5)
    assert center_index == start_index + expected_center_offset


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
