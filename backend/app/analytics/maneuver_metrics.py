"""Complementary SOG debrief metrics for accepted maneuver events."""

from dataclasses import dataclass
from math import isfinite
from statistics import median

import pandas as pd

from app.analytics.maneuver_detector import Maneuver


KNOTS_TO_METRES_PER_SECOND = 0.514444
ENTRY_WINDOW_SECONDS = (25.0, 8.0)
EXIT_WINDOW_SECONDS = (25.0, 45.0)
RECOVERY_LIMIT_SECONDS = 60.0


@dataclass(frozen=True)
class ManeuverDebriefMetrics:
    duration_s: float
    sog_entry_kn: float | None
    sog_min_kn: float | None
    sog_exit_kn: float | None
    recovery_time_s: float | None
    speed_loss_distance_m: float | None
    speed_loss_time_s: float | None

    def to_dict(self) -> dict[str, float | None]:
        return {
            "duration_s": self.duration_s,
            "sog_entry_kn": self.sog_entry_kn,
            "sog_min_kn": self.sog_min_kn,
            "sog_exit_kn": self.sog_exit_kn,
            "recovery_time_s": self.recovery_time_s,
            "speed_loss_distance_m": self.speed_loss_distance_m,
            "speed_loss_time_s": self.speed_loss_time_s,
        }


SogSample = tuple[float, float]


def calculate_maneuver_metrics(
    track: pd.DataFrame,
    maneuver: Maneuver,
) -> ManeuverDebriefMetrics:
    start = pd.Timestamp(maneuver.start_time).timestamp()
    end = pd.Timestamp(maneuver.end_time).timestamp()
    samples = _valid_sog_samples(track)

    entry_values = _values_between(
        samples,
        start - ENTRY_WINDOW_SECONDS[0],
        start - ENTRY_WINDOW_SECONDS[1],
    )
    maneuver_values = _values_between(samples, start, end)
    exit_values = _values_between(
        samples,
        end + EXIT_WINDOW_SECONDS[0],
        end + EXIT_WINDOW_SECONDS[1],
    )
    sog_entry = median(entry_values) if entry_values else None
    sog_min = min(maneuver_values) if maneuver_values else None
    sog_exit = median(exit_values) if exit_values else None

    recovery_sample = None
    if _is_comparable_speed_regime(sog_entry, sog_exit):
        recovery_sample = next(
            (
                sample
                for sample in samples
                if end <= sample[0] <= end + RECOVERY_LIMIT_SECONDS
                and sample[1] >= 0.95 * sog_exit
            ),
            None,
        )

    recovery_time = (
        recovery_sample[0] - end if recovery_sample is not None else None
    )
    loss_distance = None
    loss_time = None
    if (
        recovery_sample is not None
        and sog_entry is not None
        and sog_exit is not None
    ):
        loss_distance = _speed_loss_distance(
            samples, start, recovery_sample[0], sog_entry, sog_exit
        )
        reference_speed_m_s = (
            (sog_entry + sog_exit) / 2.0 * KNOTS_TO_METRES_PER_SECOND
        )
        if reference_speed_m_s > 0 and isfinite(reference_speed_m_s):
            if loss_distance is not None:
                loss_time = loss_distance / reference_speed_m_s
        else:
            loss_distance = None

    return ManeuverDebriefMetrics(
        duration_s=end - start,
        sog_entry_kn=sog_entry,
        sog_min_kn=sog_min,
        sog_exit_kn=sog_exit,
        recovery_time_s=recovery_time,
        speed_loss_distance_m=loss_distance,
        speed_loss_time_s=loss_time,
    )


def _valid_sog_samples(track: pd.DataFrame) -> list[SogSample]:
    if "utc" not in track or "sog" not in track:
        return []
    timestamps = pd.to_datetime(
        track["utc"], utc=True, errors="coerce", format="mixed"
    )
    sogs = pd.to_numeric(track["sog"], errors="coerce")
    samples = [
        (timestamp.timestamp(), float(sog))
        for timestamp, sog in zip(timestamps, sogs)
        if not pd.isna(timestamp)
        and not pd.isna(sog)
        and isfinite(float(sog))
        and float(sog) >= 0
    ]
    return sorted(samples)


def _values_between(
    samples: list[SogSample], start: float, end: float
) -> list[float]:
    return [value for timestamp, value in samples if start <= timestamp <= end]


def _is_comparable_speed_regime(
    sog_entry: float | None, sog_exit: float | None
) -> bool:
    if sog_entry is None or sog_exit is None:
        return False
    return abs(sog_exit - sog_entry) <= max(0.75, 0.15 * sog_entry)


def _speed_loss_distance(
    samples: list[SogSample],
    start: float,
    recovery: float,
    sog_entry: float,
    sog_exit: float,
) -> float | None:
    actual = [sample for sample in samples if start <= sample[0] <= recovery]
    if len(actual) < 2:
        return None
    reference_duration = recovery - start

    def deficit(sample: SogSample) -> float:
        timestamp, sog = sample
        fraction = (
            (timestamp - start) / reference_duration
            if reference_duration > 0 else 1.0
        )
        reference = sog_entry + (sog_exit - sog_entry) * fraction
        return reference - sog

    knot_seconds = sum(
        _positive_linear_area(
            deficit(first), deficit(second), second[0] - first[0]
        )
        for first, second in zip(actual, actual[1:])
        if second[0] > first[0]
    )
    return knot_seconds * KNOTS_TO_METRES_PER_SECOND


def _positive_linear_area(first: float, second: float, duration: float) -> float:
    if first <= 0 and second <= 0:
        return 0.0
    if first >= 0 and second >= 0:
        return (first + second) / 2.0 * duration
    positive = max(first, second)
    return 0.5 * positive * duration * positive / abs(second - first)
