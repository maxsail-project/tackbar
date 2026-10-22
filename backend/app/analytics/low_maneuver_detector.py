"""Isolated LOW Phases baseline from Issue #112; never selects or persists analytics.

Only canonical UTC, COG and SOG are consumed, including on rich tracks. An empty
tuple means no accepted candidates, not a production availability assessment.
Production selection and unavailable reasons belong to the integration increment.
"""

from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from math import atan2, cos, degrees, fsum, hypot, isfinite, radians, sin
from statistics import median
from typing import ClassVar

import pandas as pd

from app.analytics.circular_angles import signed_angular_difference


# Recorded Phases PoC parameters: preserve until separately reviewed tuning.
SMOOTHING_HALF_WINDOW_SECONDS = 2.0
TURN_RATE_HALF_WINDOW_SECONDS = 2.0
MIN_SEED_TURN_RATE_DEG_S = 2.0
MIN_SOG_KNOTS = 1.5
MAX_SEED_GAP_SECONDS = 3.0
MIN_DURATION_SECONDS = 3.0
MAX_DURATION_SECONDS = 35.0
CONTEXT_INNER_SECONDS = 2.0
CONTEXT_OUTER_SECONDS = 10.0
MIN_CONTEXT_SAMPLES = 3
MIN_COG_CHANGE_DEG = 35.0
MIN_DIRECTIONAL_COHERENCE = 0.65
MAX_SAMPLE_GAP_SECONDS = 10.0


@dataclass(frozen=True)
class LowManeuverCandidate:
    """Neutral, ephemeral COG candidate, separate from the HDG event contract."""

    start_time: str
    center_time: str
    end_time: str
    cog_change_deg: float
    detector_mode: ClassVar[str] = "LOW"
    signal_basis: ClassVar[tuple[str, ...]] = ("cog", "sog")


@dataclass(frozen=True)
class _Sample:
    time: float
    timestamp: str
    cog: float
    sog: float


def detect_low_maneuvers(track: pd.DataFrame) -> tuple[LowManeuverCandidate, ...]:
    """Evaluate every usable run without changing the track or normal artifacts.

    Invalid/missing UTC, COG or SOG breaks evidence, as do non-increasing times
    and gaps >10 s. No sorting, interpolation, GPS calculation or HDG fallback
    occurs. Finite COG is circularly normalized; negative SOG is invalid. Zero
    and low SOG cannot seed turns; interval SOG must also pass the PoC median.
    Missing stationary bearings stay missing, never filled from nearby samples.
    """
    if not {"utc", "cog", "sog"}.issubset(track.columns):
        return ()
    return tuple(
        candidate
        for run in _continuous_runs(track)
        for candidate in _detect_run(run)
    )


def _continuous_runs(track: pd.DataFrame) -> list[list[_Sample]]:
    timestamps = pd.to_datetime(track["utc"], utc=True, errors="coerce", format="mixed")
    cogs = pd.to_numeric(track["cog"], errors="coerce")
    sogs = pd.to_numeric(track["sog"], errors="coerce")
    runs: list[list[_Sample]] = []
    current: list[_Sample] = []
    for timestamp, cog, sog in zip(timestamps, cogs, sogs):
        if (
            pd.isna(timestamp) or pd.isna(cog) or pd.isna(sog)
            or not isfinite(float(cog)) or not isfinite(float(sog)) or sog < 0
        ):
            if current:
                runs.append(current)
                current = []
            continue
        time = timestamp.timestamp()
        if current and (
            time <= current[-1].time
            or time - current[-1].time > MAX_SAMPLE_GAP_SECONDS
        ):
            runs.append(current)
            current = []
        current.append(_Sample(
            time, timestamp.isoformat().replace("+00:00", "Z"), float(cog) % 360, float(sog),
        ))
    if current:
        runs.append(current)
    return runs


def _circular_mean(values: list[float]) -> float | None:
    if not values:
        return None
    sine = fsum(sin(radians(value)) for value in values)
    cosine = fsum(cos(radians(value)) for value in values)
    # Numerical degeneracy (e.g. antipodal evidence), not a GPS noise threshold.
    if hypot(sine, cosine) <= 1e-12 * len(values):
        return None
    return degrees(atan2(sine, cosine)) % 360


def _nearest(times: list[float], target: float) -> int:
    """Use a real sample nearest the +/-2 s target; ties choose earlier UTC."""
    index = bisect_left(times, target)
    return min(
        (i for i in (index - 1, index) if 0 <= i < len(times)),
        key=lambda i: (abs(times[i] - target), i),
    )


def _detect_run(run: list[_Sample]) -> list[LowManeuverCandidate]:
    times = [sample.time for sample in run]
    smoothed = [
        _circular_mean([
            sample.cog for sample in run[
                bisect_left(times, time - SMOOTHING_HALF_WINDOW_SECONDS):
                bisect_right(times, time + SMOOTHING_HALF_WINDOW_SECONDS)
            ]
        ])
        for time in times
    ]
    groups: list[list[int]] = []
    for index, sample in enumerate(run):
        left = _nearest(times, sample.time - TURN_RATE_HALF_WINDOW_SECONDS)
        right = _nearest(times, sample.time + TURN_RATE_HALF_WINDOW_SECONDS)
        if left == right or smoothed[left] is None or smoothed[right] is None:
            continue
        rate = signed_angular_difference(
            smoothed[left], smoothed[right],
        ) / (times[right] - times[left])
        if abs(rate) < MIN_SEED_TURN_RATE_DEG_S or sample.sog < MIN_SOG_KNOTS:
            continue
        if not groups or sample.time - times[groups[-1][-1]] > MAX_SEED_GAP_SECONDS:
            groups.append([])
        groups[-1].append(index)

    candidates = []
    for group in groups:
        start, end = group[0], group[-1]
        duration = times[end] - times[start]
        if not MIN_DURATION_SECONDS <= duration <= MAX_DURATION_SECONDS:
            continue
        pre = smoothed[
            bisect_left(times, times[start] - CONTEXT_OUTER_SECONDS):
            bisect_right(times, times[start] - CONTEXT_INNER_SECONDS)
        ]
        post = smoothed[
            bisect_left(times, times[end] + CONTEXT_INNER_SECONDS):
            bisect_right(times, times[end] + CONTEXT_OUTER_SECONDS)
        ]
        pre_valid = [value for value in pre if value is not None]
        post_valid = [value for value in post if value is not None]
        if min(len(pre_valid), len(post_valid)) < MIN_CONTEXT_SAMPLES:
            continue
        before, after = _circular_mean(pre_valid), _circular_mean(post_valid)
        if before is None or after is None:
            continue
        change = signed_angular_difference(before, after)
        if abs(change) < MIN_COG_CHANGE_DEG:
            continue
        interval = smoothed[start:end + 1]
        if any(value is None for value in interval):
            continue
        increments = [
            signed_angular_difference(a, b)
            for a, b in zip(interval, interval[1:])
        ]
        rotation = fsum(abs(value) for value in increments)
        if rotation == 0 or abs(fsum(increments)) / rotation < MIN_DIRECTIONAL_COHERENCE:
            continue
        if median(sample.sog for sample in run[start:end + 1]) < MIN_SOG_KNOTS:
            continue
        accumulated = 0.0
        center = start
        for offset, increment in enumerate(increments, 1):
            accumulated += abs(increment)
            if accumulated >= rotation / 2:
                center = start + offset
                break
        candidates.append(LowManeuverCandidate(
            run[start].timestamp, run[center].timestamp, run[end].timestamp, change,
        ))
    return candidates
