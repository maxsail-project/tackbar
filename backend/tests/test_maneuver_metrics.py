from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app.analytics.maneuver_detector import Maneuver
from app.analytics.maneuver_metrics import calculate_maneuver_metrics


START = datetime(2031, 1, 1, 10, 0, tzinfo=timezone.utc)


def _maneuver(start: float = 30.0, end: float = 40.0) -> Maneuver:
    timestamp = lambda seconds: (START + timedelta(seconds=seconds)).isoformat()
    return Maneuver(
        start_time=timestamp(start),
        center_time=timestamp((start + end) / 2),
        end_time=timestamp(end),
        heading_change_deg=80.0,
        peak_turn_rate_deg_s=12.0,
        peak_turn_rate_time=timestamp((start + end) / 2),
    )


def _track(samples: list[tuple[float, object]]) -> pd.DataFrame:
    return pd.DataFrame({
        "utc": [START + timedelta(seconds=seconds) for seconds, _ in samples],
        "sog": [sog for _, sog in samples],
    })


def test_calculates_duration_sog_windows_recovery_and_irregular_loss() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (5, 5.0),
        (10, 5.2),
        (15, float("nan")),
        (20, float("inf")),
        (22, 5.4),
        (30, 5.2),
        (35, 3.2),
        (40, 4.0),
        (46, 4.8),
        (50, 5.0),
        (65, 5.0),
        (75, 5.2),
        (85, 5.4),
    ]), _maneuver())

    assert metrics.duration_s == 10.0
    assert metrics.sog_entry_kn == 5.2
    assert metrics.sog_min_kn == 3.2
    assert metrics.sog_exit_kn == 5.2
    assert metrics.recovery_time_s == 10.0
    assert metrics.speed_loss_distance_m == pytest.approx(19 * 0.514444)
    assert metrics.speed_loss_time_s == pytest.approx(19 / 5.2)


def test_loss_uses_constant_entry_reference_and_actual_irregular_intervals(
) -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 6.0),
        (20, 6.0),
        (30, 6.0),
        (35, 4.0),
        (40, 4.5),
        (46, 5.0),
        (50, 5.2),
        (65, 5.4),
        (75, 5.4),
    ]), _maneuver())

    assert metrics.sog_entry_kn == 6.0
    assert metrics.sog_exit_kn == 5.4
    assert metrics.recovery_time_s == 10.0
    assert metrics.speed_loss_distance_m == pytest.approx(24.85 * 0.514444)
    assert metrics.speed_loss_time_s == pytest.approx(24.85 / 6.0)


def test_sog_above_entry_does_not_create_negative_loss() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 5.0),
        (20, 5.0),
        (30, 5.0),
        (35, 3.0),
        (40, 6.0),
        (65, 5.0),
        (75, 5.0),
    ]), _maneuver(end=35.0))

    expected_knot_seconds = 5.0 + (10.0 / 3.0)
    assert metrics.recovery_time_s == 5.0
    assert metrics.speed_loss_distance_m == pytest.approx(
        expected_knot_seconds * 0.514444
    )
    assert metrics.speed_loss_time_s == pytest.approx(
        expected_knot_seconds / 5.0
    )


def test_non_comparable_speed_regime_suppresses_recovery_and_loss() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 5.2),
        (30, 5.2),
        (35, 3.0),
        (40, 4.0),
        (45, 7.0),
        (65, 6.8),
    ]), _maneuver())

    assert metrics.sog_entry_kn == 5.2
    assert metrics.sog_exit_kn == 6.8
    assert metrics.recovery_time_s is None
    assert metrics.speed_loss_distance_m is None
    assert metrics.speed_loss_time_s is None


def test_missing_exit_regime_suppresses_recovery_and_loss() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 5.0),
        (30, 5.0),
        (40, 3.0),
        (100, 4.7),
        (101, 5.0),
    ]), _maneuver())

    assert metrics.sog_exit_kn is None
    assert metrics.recovery_time_s is None
    assert metrics.speed_loss_distance_m is None
    assert metrics.speed_loss_time_s is None


def test_comparable_exit_window_itself_supplies_recovery_within_sixty_seconds(
) -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 5.0),
        (30, 5.0),
        (40, 3.0),
        (65, 5.0),
    ]), _maneuver())

    assert metrics.sog_exit_kn == 5.0
    assert metrics.recovery_time_s == 25.0


def test_missing_or_invalid_sog_is_unavailable_without_invented_values() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, None),
        (30, "invalid"),
        (40, float("nan")),
        (65, float("inf")),
        (70, -1.0),
    ]), _maneuver())

    assert metrics.to_dict() == {
        "duration_s": 10.0,
        "sog_entry_kn": None,
        "sog_min_kn": None,
        "sog_exit_kn": None,
        "recovery_time_s": None,
        "speed_loss_distance_m": None,
        "speed_loss_time_s": None,
    }


def test_loss_is_unavailable_when_valid_samples_cannot_form_an_interval() -> None:
    metrics = calculate_maneuver_metrics(_track([
        (10, 5.0),
        (30, None),
        (40, None),
        (50, 5.0),
        (65, 5.0),
    ]), _maneuver())

    assert metrics.recovery_time_s == 10.0
    assert metrics.speed_loss_distance_m is None
    assert metrics.speed_loss_time_s is None
