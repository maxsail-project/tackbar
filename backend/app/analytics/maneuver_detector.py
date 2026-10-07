"""Deterministic HDG-based neutral maneuver detection."""

from dataclasses import dataclass
from math import atan2, cos, degrees, isfinite, radians, sin

import pandas as pd

from app.analytics.circular_angles import signed_angular_difference


# Provisional detector parameters. These are centralized for real-sailing
# validation and are not product-level configuration or stable requirements.
SMOOTHING_HALF_WINDOW_SECONDS = 1.0
TURN_RATE_HALF_WINDOW_SECONDS = 1.0
STABLE_TURN_RATE_DEG_S = 3.0
TURN_ENTRY_RATE_DEG_S = 8.0
TURN_ENTRY_PERSISTENCE_SECONDS = 1.0
TURN_EXIT_STABILITY_SECONDS = 1.5
PRIOR_STABILITY_SECONDS = 1.5
MIN_HEADING_CHANGE_DEG = 45.0
MIN_MANEUVER_DURATION_SECONDS = 3.0
MAX_MANEUVER_DURATION_SECONDS = 30.0
MAX_SAMPLE_GAP_SECONDS = 1.5
MIN_VALID_HDG_SAMPLES = 20
MIN_DIRECTION_COHERENCE = 0.7
MIN_DIRECTIONAL_ROTATION_SAMPLES = 4
MAX_ADJACENT_HEADING_CHANGE_DEG = 90.0


@dataclass(frozen=True)
class Maneuver:
    start_time: str
    center_time: str
    end_time: str
    heading_change_deg: float
    peak_turn_rate_deg_s: float
    peak_turn_rate_time: str

    def to_dict(self) -> dict[str, str | float]:
        return {
            "start_time": self.start_time,
            "center_time": self.center_time,
            "end_time": self.end_time,
            "heading_change_deg": self.heading_change_deg,
            "peak_turn_rate_deg_s": self.peak_turn_rate_deg_s,
            "peak_turn_rate_time": self.peak_turn_rate_time,
        }


@dataclass(frozen=True)
class ManeuverDetectionResult:
    status: str
    maneuvers: tuple[Maneuver, ...]
    reason: str | None = None


@dataclass(frozen=True)
class TurnRateSample:
    timestamp: str
    elapsed_seconds: float
    heading: float
    smoothed_heading: float
    turn_rate_deg_s: float | None


def detect_maneuvers(track: pd.DataFrame) -> ManeuverDetectionResult:
    if "hdg" not in track or "utc" not in track:
        return ManeuverDetectionResult("unavailable", (), "missing_hdg")

    segments, valid_heading_count = _valid_heading_segments(track)
    if valid_heading_count == 0:
        return ManeuverDetectionResult("unavailable", (), "missing_hdg")

    eligible_segments = [
        segment
        for segment in segments
        if len(segment) >= MIN_VALID_HDG_SAMPLES
        and segment[-1][0] - segment[0][0] >= (
            PRIOR_STABILITY_SECONDS
            + TURN_ENTRY_PERSISTENCE_SECONDS
            + MIN_MANEUVER_DURATION_SECONDS
            + TURN_EXIT_STABILITY_SECONDS
        )
    ]
    if not eligible_segments:
        return ManeuverDetectionResult("unavailable", (), "insufficient_hdg")

    maneuvers: list[Maneuver] = []
    for segment in eligible_segments:
        rate_samples = _calculate_segment_turn_rates(segment)
        maneuvers.extend(_detect_segment_maneuvers(rate_samples))

    return ManeuverDetectionResult("available", tuple(maneuvers))


def calculate_local_turn_rates(track: pd.DataFrame) -> list[TurnRateSample]:
    """Calculate the detector's local HDG turn-rate signal for valid runs."""
    segments, _ = _valid_heading_segments(track)
    return [
        sample
        for segment in segments
        for sample in _calculate_segment_turn_rates(segment)
    ]


def _valid_heading_segments(
    track: pd.DataFrame,
) -> tuple[list[list[tuple[float, str, float]]], int]:
    timestamps = pd.to_datetime(
        track["utc"],
        utc=True,
        errors="coerce",
        format="mixed",
    )
    headings = pd.to_numeric(track["hdg"], errors="coerce")
    segments: list[list[tuple[float, str, float]]] = []
    current: list[tuple[float, str, float]] = []
    valid_heading_count = 0

    for timestamp, heading in zip(timestamps, headings):
        if pd.isna(timestamp) or pd.isna(heading) or not isfinite(float(heading)):
            if current:
                segments.append(current)
                current = []
            continue

        elapsed_seconds = timestamp.timestamp()
        if current and (
            elapsed_seconds <= current[-1][0]
            or elapsed_seconds - current[-1][0] > MAX_SAMPLE_GAP_SECONDS
        ):
            segments.append(current)
            current = []

        current.append((
            elapsed_seconds,
            timestamp.isoformat().replace("+00:00", "Z"),
            float(heading) % 360.0,
        ))
        valid_heading_count += 1

    if current:
        segments.append(current)
    return segments, valid_heading_count


def _calculate_segment_turn_rates(
    segment: list[tuple[float, str, float]],
) -> list[TurnRateSample]:
    times = [sample[0] for sample in segment]
    timestamps = [sample[1] for sample in segment]
    headings = [sample[2] for sample in segment]
    sine_prefix = [0.0]
    cosine_prefix = [0.0]
    time_prefix = [0.0]
    for time, heading in zip(times, headings):
        sine_prefix.append(sine_prefix[-1] + sin(radians(heading)))
        cosine_prefix.append(cosine_prefix[-1] + cos(radians(heading)))
        time_prefix.append(time_prefix[-1] + time)

    smoothed: list[float] = []
    smoothed_times: list[float] = []
    window_left = 0
    window_right = 0
    for index, time in enumerate(times):
        while times[window_left] < time - SMOOTHING_HALF_WINDOW_SECONDS:
            window_left += 1
        window_right = max(window_right, index)
        while (
            window_right + 1 < len(times)
            and times[window_right + 1]
            <= time + SMOOTHING_HALF_WINDOW_SECONDS
        ):
            window_right += 1
        right_exclusive = window_right + 1
        sine_total = sine_prefix[right_exclusive] - sine_prefix[window_left]
        cosine_total = cosine_prefix[right_exclusive] - cosine_prefix[window_left]
        smoothed.append(degrees(atan2(sine_total, cosine_total)) % 360.0)
        smoothed_times.append(
            (time_prefix[right_exclusive] - time_prefix[window_left])
            / (right_exclusive - window_left)
        )

    rates: list[float | None] = [None] * len(segment)
    left = 0
    right = 0
    for index, time in enumerate(times):
        left_target = time - TURN_RATE_HALF_WINDOW_SECONDS
        while left + 1 < index and times[left + 1] <= left_target:
            left += 1

        right = max(right, index + 1)
        right_target = time + TURN_RATE_HALF_WINDOW_SECONDS
        while right < len(times) and times[right] < right_target:
            right += 1

        if (
            left < index
            and right < len(times)
            and times[left] <= left_target
        ):
            duration = smoothed_times[right] - smoothed_times[left]
            rates[index] = signed_angular_difference(
                smoothed[left],
                smoothed[right],
            ) / duration

    return [
        TurnRateSample(timestamp, time, raw_heading, heading, rate)
        for timestamp, time, raw_heading, heading, rate in zip(
            timestamps,
            times,
            headings,
            smoothed,
            rates,
        )
    ]


def _detect_segment_maneuvers(
    samples: list[TurnRateSample],
) -> list[Maneuver]:
    maneuvers: list[Maneuver] = []
    stable_since: float | None = None
    stable_confirmed = False
    entry_start: int | None = None
    entry_sign = 0
    turning_start: int | None = None
    exit_start: int | None = None

    for index, sample in enumerate(samples):
        rate = sample.turn_rate_deg_s
        if rate is None:
            stable_since = None
            stable_confirmed = False
            entry_start = None
            turning_start = None
            exit_start = None
            continue

        absolute_rate = abs(rate)
        rate_sign = 1 if rate > 0 else -1 if rate < 0 else 0

        if turning_start is None:
            if entry_start is not None:
                if rate_sign != entry_sign or absolute_rate <= STABLE_TURN_RATE_DEG_S:
                    entry_start = None
                    stable_since = (
                        sample.elapsed_seconds
                        if absolute_rate <= STABLE_TURN_RATE_DEG_S
                        else None
                    )
                    stable_confirmed = False
                    continue
                if (
                    sample.elapsed_seconds
                    - samples[entry_start].elapsed_seconds
                    >= TURN_ENTRY_PERSISTENCE_SECONDS
                ):
                    turning_start = entry_start
                    entry_start = None
                    exit_start = None
                continue

            if absolute_rate <= STABLE_TURN_RATE_DEG_S:
                if stable_since is None:
                    stable_since = sample.elapsed_seconds
                stable_confirmed = (
                    sample.elapsed_seconds - stable_since
                    >= PRIOR_STABILITY_SECONDS
                )
                continue

            if absolute_rate >= TURN_ENTRY_RATE_DEG_S and stable_confirmed:
                entry_start = index
                entry_sign = rate_sign
                stable_since = None
                continue

            stable_since = None
            continue

        if (
            sample.elapsed_seconds
            - samples[turning_start].elapsed_seconds
            > MAX_MANEUVER_DURATION_SECONDS + TURN_EXIT_STABILITY_SECONDS
        ):
            turning_start = None
            exit_start = None
            stable_since = None
            stable_confirmed = False
            continue

        if absolute_rate <= STABLE_TURN_RATE_DEG_S:
            if exit_start is None:
                exit_start = index
            if (
                sample.elapsed_seconds
                - samples[exit_start].elapsed_seconds
                >= TURN_EXIT_STABILITY_SECONDS
            ):
                maneuver = _build_maneuver(samples, turning_start, exit_start)
                if maneuver is not None:
                    maneuvers.append(maneuver)
                stable_since = samples[exit_start].elapsed_seconds
                stable_confirmed = True
                turning_start = None
                exit_start = None
            continue

        exit_start = None

    return maneuvers


def _build_maneuver(
    samples: list[TurnRateSample],
    start_index: int,
    end_index: int,
) -> Maneuver | None:
    duration = (
        samples[end_index].elapsed_seconds
        - samples[start_index].elapsed_seconds
    )
    if not MIN_MANEUVER_DURATION_SECONDS <= duration <= MAX_MANEUVER_DURATION_SECONDS:
        return None

    deltas = [
        signed_angular_difference(first.smoothed_heading, second.smoothed_heading)
        for first, second in zip(
            samples[start_index:end_index],
            samples[start_index + 1:end_index + 1],
        )
    ]
    heading_change = sum(deltas)
    total_rotation = sum(abs(delta) for delta in deltas)
    if (
        abs(heading_change) < MIN_HEADING_CHANGE_DEG
        or total_rotation == 0
        or abs(heading_change) / total_rotation < MIN_DIRECTION_COHERENCE
    ):
        return None

    direction = 1 if heading_change > 0 else -1
    raw_deltas = [
        signed_angular_difference(first.heading, second.heading)
        for first, second in zip(
            samples[start_index:end_index],
            samples[start_index + 1:end_index + 1],
        )
    ]
    if any(
        abs(delta) > MAX_ADJACENT_HEADING_CHANGE_DEG
        for delta in raw_deltas
    ):
        return None
    directional_samples = sum(
        delta * direction >= 1.0 for delta in raw_deltas
    )
    if directional_samples < MIN_DIRECTIONAL_ROTATION_SAMPLES:
        return None

    target_change = heading_change / 2.0
    cumulative_change = 0.0
    center_index = start_index + 1
    closest_distance = float("inf")
    for offset, delta in enumerate(deltas, start=1):
        cumulative_change += delta
        candidate_index = start_index + offset
        if candidate_index >= end_index:
            break
        distance = abs(cumulative_change - target_change)
        if distance < closest_distance:
            center_index = candidate_index
            closest_distance = distance

    peak_index = max(
        range(start_index, end_index + 1),
        key=lambda index: abs(samples[index].turn_rate_deg_s or 0.0),
    )
    peak_rate = samples[peak_index].turn_rate_deg_s or 0.0
    if not start_index < center_index < end_index:
        return None

    return Maneuver(
        start_time=samples[start_index].timestamp,
        center_time=samples[center_index].timestamp,
        end_time=samples[end_index].timestamp,
        heading_change_deg=round(heading_change, 3),
        peak_turn_rate_deg_s=round(abs(peak_rate), 3),
        peak_turn_rate_time=samples[peak_index].timestamp,
    )
