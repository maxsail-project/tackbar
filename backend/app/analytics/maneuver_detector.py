"""Deterministic multisensor neutral maneuver detection."""

from dataclasses import dataclass
from math import atan2, cos, degrees, isfinite, radians, sin
from statistics import median

import pandas as pd

from app.analytics.circular_angles import signed_angular_difference


# Provisional detector parameters. These remain centralized for real-sailing
# validation and are not product-level configuration or stable requirements.
SMOOTHING_HALF_WINDOW_SECONDS = 1.0
TURN_RATE_HALF_WINDOW_SECONDS = 1.0
CANDIDATE_SEED_TURN_RATE_DEG_S = 4.0
CANDIDATE_CONTINUATION_TURN_RATE_DEG_S = 0.5
MAX_CANDIDATE_INTERRUPTION_SECONDS = 3.0
MAX_STABLE_INTERRUPTION_SECONDS = 1.5
STABLE_TURN_RATE_DEG_S = 3.0
SUPPORT_CONTEXT_SECONDS = 2.0
MIN_HEADING_CHANGE_DEG = 30.0
MIN_CORRECTED_CORE_HEADING_CHANGE_DEG = 35.0
STANDARD_HEADING_CHANGE_DEG = 45.0
MIN_MANEUVER_DURATION_SECONDS = 3.0
MAX_MANEUVER_DURATION_SECONDS = 30.0
MAX_SAMPLE_GAP_SECONDS = 1.5
MIN_VALID_HDG_SAMPLES = 20
MIN_DIRECTION_COHERENCE = 0.55
SUPPORTED_DIRECTION_COHERENCE = 0.60
MULTISENSOR_DIRECTION_COHERENCE = 0.65
STRONG_DIRECTION_COHERENCE = 0.80
STRONG_HEADING_CHANGE_DEG = 60.0
STRONG_PEAK_TURN_RATE_DEG_S = 8.0
VERY_STRONG_DIRECTION_COHERENCE = 0.90
VERY_STRONG_HEADING_CHANGE_DEG = 75.0
MIN_DIRECTIONAL_ROTATION_SAMPLES = 4
MAX_ADJACENT_HEADING_CHANGE_DEG = 90.0
MIN_COG_SUPPORT_CHANGE_DEG = 20.0
MIN_COG_SUPPORT_COHERENCE = 0.35
MIN_MULTISENSOR_COG_COHERENCE = 0.30
MIN_COG_SUPPORT_SAMPLES = 5
MIN_HEEL_EXCURSION_DEG = 5.0
MIN_HEEL_TRANSITION_DEG = 3.0
MIN_SOG_RANGE_KNOTS = 0.75
MIN_SOG_TRANSITION_KNOTS = 0.5
MIN_SUPPORT_SAMPLES = 5
MIN_TRANSITION_SAMPLES = 3


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
    cog: float | None
    heel: float | None
    sog: float | None
    trim: float | None


@dataclass(frozen=True)
class ManeuverCandidateAssessment:
    """Ephemeral detector evidence for tests and local expert validation."""

    start_time: str
    center_time: str
    end_time: str
    heading_change_deg: float
    directional_coherence: float
    candidate_directional_coherence: float
    peak_turn_rate_deg_s: float
    cog_change_deg: float | None
    cog_directional_coherence: float | None
    cog_support: bool
    heel_excursion_deg: float | None
    heel_transition_deg: float | None
    heel_support: bool
    sog_local_range_knots: float | None
    sog_transition_knots: float | None
    sog_support: bool
    trim_excursion_deg: float | None
    trim_transition_deg: float | None
    prior_stability_support: bool
    accepted: bool
    reason: str
    acceptance_rule: str | None


RawSegmentSample = tuple[
    float,
    str,
    float,
    float | None,
    float | None,
    float | None,
    float | None,
]


def detect_maneuvers(track: pd.DataFrame) -> ManeuverDetectionResult:
    prepared = _prepare_detection(track)
    if isinstance(prepared, ManeuverDetectionResult):
        return prepared

    maneuvers: list[Maneuver] = []
    for samples in prepared:
        detected, _ = _detect_segment_maneuvers(samples)
        maneuvers.extend(detected)
    return ManeuverDetectionResult("available", tuple(maneuvers))


def analyze_maneuver_candidates(
    track: pd.DataFrame,
) -> tuple[ManeuverCandidateAssessment, ...]:
    """Return non-persisted candidate evidence for local expert review."""
    prepared = _prepare_detection(track)
    if isinstance(prepared, ManeuverDetectionResult):
        return ()

    assessments: list[ManeuverCandidateAssessment] = []
    for samples in prepared:
        _, segment_assessments = _detect_segment_maneuvers(samples)
        assessments.extend(segment_assessments)
    return tuple(assessments)


def _prepare_detection(
    track: pd.DataFrame,
) -> list[list[TurnRateSample]] | ManeuverDetectionResult:
    if "hdg" not in track or "utc" not in track:
        return ManeuverDetectionResult("unavailable", (), "missing_hdg")

    segments, valid_heading_count = _valid_heading_segments(track)
    if valid_heading_count == 0:
        return ManeuverDetectionResult("unavailable", (), "missing_hdg")

    eligible_segments = [
        segment
        for segment in segments
        if len(segment) >= MIN_VALID_HDG_SAMPLES
        and segment[-1][0] - segment[0][0] >= MIN_MANEUVER_DURATION_SECONDS
    ]
    if not eligible_segments:
        return ManeuverDetectionResult("unavailable", (), "insufficient_hdg")

    return [
        _calculate_segment_turn_rates(segment)
        for segment in eligible_segments
    ]


def calculate_local_turn_rates(track: pd.DataFrame) -> list[TurnRateSample]:
    """Calculate the detector's local HDG turn-rate signal for valid runs."""
    segments, _ = _valid_heading_segments(track)
    return [
        sample
        for segment in segments
        for sample in _calculate_segment_turn_rates(segment)
    ]


def _optional_numbers(track: pd.DataFrame, column: str) -> pd.Series:
    if column not in track:
        return pd.Series([None] * len(track), index=track.index, dtype="object")
    return pd.to_numeric(track[column], errors="coerce")


def _optional_finite(value: object) -> float | None:
    if pd.isna(value):
        return None
    number = float(value)
    return number if isfinite(number) else None


def _valid_heading_segments(
    track: pd.DataFrame,
) -> tuple[list[list[RawSegmentSample]], int]:
    timestamps = pd.to_datetime(
        track["utc"],
        utc=True,
        errors="coerce",
        format="mixed",
    )
    headings = pd.to_numeric(track["hdg"], errors="coerce")
    cogs = _optional_numbers(track, "cog")
    heels = _optional_numbers(track, "heel")
    sogs = _optional_numbers(track, "sog")
    trims = _optional_numbers(track, "trim")
    segments: list[list[RawSegmentSample]] = []
    current: list[RawSegmentSample] = []
    valid_heading_count = 0

    for timestamp, heading, cog, heel, sog, trim in zip(
        timestamps,
        headings,
        cogs,
        heels,
        sogs,
        trims,
    ):
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
            _optional_finite(cog),
            _optional_finite(heel),
            _optional_finite(sog),
            _optional_finite(trim),
        ))
        valid_heading_count += 1

    if current:
        segments.append(current)
    return segments, valid_heading_count


def _calculate_segment_turn_rates(
    segment: list[RawSegmentSample],
) -> list[TurnRateSample]:
    times = [sample[0] for sample in segment]
    timestamps = [sample[1] for sample in segment]
    headings = [sample[2] for sample in segment]
    cogs = [sample[3] for sample in segment]
    heels = [sample[4] for sample in segment]
    sogs = [sample[5] for sample in segment]
    trims = [sample[6] for sample in segment]
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

        if left < index and right < len(times) and times[left] <= left_target:
            duration = smoothed_times[right] - smoothed_times[left]
            rates[index] = signed_angular_difference(
                smoothed[left],
                smoothed[right],
            ) / duration

    return [
        TurnRateSample(
            timestamp,
            time,
            raw_heading,
            heading,
            rate,
            cog,
            heel,
            sog,
            trim,
        )
        for timestamp, time, raw_heading, heading, rate, cog, heel, sog, trim in zip(
            timestamps,
            times,
            headings,
            smoothed,
            rates,
            cogs,
            heels,
            sogs,
            trims,
        )
    ]


def _detect_segment_maneuvers(
    samples: list[TurnRateSample],
) -> tuple[list[Maneuver], list[ManeuverCandidateAssessment]]:
    maneuvers: list[Maneuver] = []
    assessments: list[ManeuverCandidateAssessment] = []
    index = 0

    while index < len(samples):
        rate = samples[index].turn_rate_deg_s
        if rate is None or abs(rate) < CANDIDATE_SEED_TURN_RATE_DEG_S:
            index += 1
            continue

        direction = 1 if rate > 0 else -1
        start_index = index
        while start_index > 0:
            previous_rate = samples[start_index - 1].turn_rate_deg_s
            if (
                previous_rate is None
                or previous_rate * direction
                < CANDIDATE_CONTINUATION_TURN_RATE_DEG_S
            ):
                break
            start_index -= 1

        end_index = index
        last_directional_index = index
        stable_start_time: float | None = None
        probe_index = index + 1
        while probe_index < len(samples):
            probe_rate = samples[probe_index].turn_rate_deg_s
            if probe_rate is None:
                break
            if abs(probe_rate) <= CANDIDATE_CONTINUATION_TURN_RATE_DEG_S:
                if stable_start_time is None:
                    stable_start_time = samples[probe_index].elapsed_seconds
                elif (
                    samples[probe_index].elapsed_seconds - stable_start_time
                    >= MAX_STABLE_INTERRUPTION_SECONDS
                ):
                    break
            elif (
                probe_rate * direction
                >= CANDIDATE_CONTINUATION_TURN_RATE_DEG_S
            ):
                end_index = probe_index
                last_directional_index = probe_index
                stable_start_time = None
            elif (
                samples[probe_index].elapsed_seconds
                - samples[last_directional_index].elapsed_seconds
                > MAX_CANDIDATE_INTERRUPTION_SECONDS
            ):
                break
            else:
                stable_start_time = None
            probe_index += 1

        if end_index > start_index:
            maneuver, assessment = _assess_candidate(
                samples,
                start_index,
                end_index,
                direction,
            )
            assessments.append(assessment)
            if maneuver is not None:
                maneuvers.append(maneuver)

        index = max(index + 1, end_index + 1)

    return maneuvers, assessments


def _angular_metrics(
    values: list[float | None],
) -> tuple[float, float, float]:
    deltas = [
        signed_angular_difference(first, second)
        for first, second in zip(values, values[1:])
        if first is not None and second is not None
    ]
    change = sum(deltas)
    rotation = sum(abs(delta) for delta in deltas)
    coherence = abs(change) / rotation if rotation else 0.0
    return change, rotation, coherence


def _context_values(
    samples: list[TurnRateSample],
    start_time: float,
    end_time: float,
    field: str,
) -> list[float]:
    return [
        value
        for sample in samples
        if start_time <= sample.elapsed_seconds <= end_time
        and (value := getattr(sample, field)) is not None
    ]


def _transition_magnitude(
    samples: list[TurnRateSample],
    start_index: int,
    end_index: int,
    field: str,
) -> float | None:
    start_time = samples[start_index].elapsed_seconds
    end_time = samples[end_index].elapsed_seconds
    before = _context_values(
        samples,
        start_time - SUPPORT_CONTEXT_SECONDS,
        start_time,
        field,
    )
    after = _context_values(
        samples,
        end_time,
        end_time + SUPPORT_CONTEXT_SECONDS,
        field,
    )
    if (
        len(before) < MIN_TRANSITION_SAMPLES
        or len(after) < MIN_TRANSITION_SAMPLES
    ):
        return None
    return abs(median(after) - median(before))


def _robust_bounds(values: list[float]) -> tuple[float, float] | None:
    if len(values) < MIN_SUPPORT_SAMPLES:
        return None
    ordered = sorted(values)
    trim_count = max(1, len(ordered) // 10)
    return ordered[trim_count], ordered[-trim_count - 1]


def _center_index_for_rotation(
    deltas: list[float],
    start_index: int,
    end_index: int,
) -> int:
    target_change = sum(deltas) / 2.0
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
    return center_index


def _directional_core_bounds(
    samples: list[TurnRateSample],
    candidate_start_index: int,
    candidate_end_index: int,
    direction: int,
) -> tuple[int, int]:
    """Return the dominant coherent rotation inside one candidate region."""
    deltas = [
        signed_angular_difference(first.smoothed_heading, second.smoothed_heading)
        for first, second in zip(
            samples[candidate_start_index:candidate_end_index],
            samples[candidate_start_index + 1:candidate_end_index + 1],
        )
    ]
    candidate_duration = (
        samples[candidate_end_index].elapsed_seconds
        - samples[candidate_start_index].elapsed_seconds
    )
    continuously_directional = all(
        sample.turn_rate_deg_s is not None
        and sample.turn_rate_deg_s * direction
        >= CANDIDATE_CONTINUATION_TURN_RATE_DEG_S
        for sample in samples[candidate_start_index:candidate_end_index + 1]
    )
    if (
        candidate_duration > MAX_MANEUVER_DURATION_SECONDS
        and continuously_directional
    ):
        return candidate_start_index, candidate_end_index

    signed_prefix = [0.0]
    absolute_prefix = [0.0]
    for delta in deltas:
        signed_prefix.append(signed_prefix[-1] + delta)
        absolute_prefix.append(absolute_prefix[-1] + abs(delta))

    best_bounds: tuple[int, int] | None = None
    best_score: tuple[float, float, float, int] | None = None
    for start_offset in range(len(deltas)):
        core_start_index = candidate_start_index + start_offset
        for end_offset in range(start_offset + 1, len(deltas) + 1):
            core_end_index = candidate_start_index + end_offset
            duration = (
                samples[core_end_index].elapsed_seconds
                - samples[core_start_index].elapsed_seconds
            )
            if duration < MIN_MANEUVER_DURATION_SECONDS:
                continue
            if duration > MAX_MANEUVER_DURATION_SECONDS:
                break

            heading_change = (
                signed_prefix[end_offset] - signed_prefix[start_offset]
            )
            if heading_change * direction <= 0:
                continue
            total_rotation = (
                absolute_prefix[end_offset] - absolute_prefix[start_offset]
            )
            if total_rotation == 0:
                continue
            coherence = abs(heading_change) / total_rotation
            if coherence < MIN_DIRECTION_COHERENCE:
                continue

            score = (
                abs(heading_change),
                coherence,
                -duration,
                -core_start_index,
            )
            if best_score is None or score > best_score:
                best_score = score
                best_bounds = core_start_index, core_end_index

    return best_bounds or (candidate_start_index, candidate_end_index)


def _assess_candidate(
    samples: list[TurnRateSample],
    candidate_start_index: int,
    candidate_end_index: int,
    direction: int,
) -> tuple[Maneuver | None, ManeuverCandidateAssessment]:
    candidate_deltas = [
        signed_angular_difference(first.smoothed_heading, second.smoothed_heading)
        for first, second in zip(
            samples[candidate_start_index:candidate_end_index],
            samples[candidate_start_index + 1:candidate_end_index + 1],
        )
    ]
    candidate_change = sum(candidate_deltas)
    candidate_rotation = sum(abs(delta) for delta in candidate_deltas)
    candidate_coherence = (
        abs(candidate_change) / candidate_rotation
        if candidate_rotation else 0.0
    )
    start_index, end_index = _directional_core_bounds(
        samples,
        candidate_start_index,
        candidate_end_index,
        direction,
    )
    duration = (
        samples[end_index].elapsed_seconds
        - samples[start_index].elapsed_seconds
    )
    deltas = [
        signed_angular_difference(first.smoothed_heading, second.smoothed_heading)
        for first, second in zip(
            samples[start_index:end_index],
            samples[start_index + 1:end_index + 1],
        )
    ]
    heading_change = sum(deltas)
    total_rotation = sum(abs(delta) for delta in deltas)
    coherence = abs(heading_change) / total_rotation if total_rotation else 0.0
    center_index = _center_index_for_rotation(deltas, start_index, end_index)
    peak_index = max(
        range(start_index, end_index + 1),
        key=lambda sample_index: abs(
            samples[sample_index].turn_rate_deg_s or 0.0
        ),
    )
    peak_rate = abs(samples[peak_index].turn_rate_deg_s or 0.0)

    raw_deltas = [
        signed_angular_difference(first.heading, second.heading)
        for first, second in zip(
            samples[start_index:end_index],
            samples[start_index + 1:end_index + 1],
        )
    ]
    directional_samples = sum(
        delta * direction >= 1.0 for delta in raw_deltas
    )

    cog_values = [
        sample.cog for sample in samples[start_index:end_index + 1]
    ]
    cog_change, _, cog_coherence = _angular_metrics(cog_values)
    cog_sample_count = sum(value is not None for value in cog_values)
    cog_pair_count = sum(
        first is not None and second is not None
        for first, second in zip(cog_values, cog_values[1:])
    )
    cog_values_present = cog_sample_count > 0
    cog_agreement = (
        cog_sample_count >= MIN_COG_SUPPORT_SAMPLES
        and cog_pair_count >= MIN_COG_SUPPORT_SAMPLES - 1
        and cog_change * direction >= MIN_COG_SUPPORT_CHANGE_DEG
    )
    cog_support = cog_agreement and cog_coherence >= MIN_COG_SUPPORT_COHERENCE

    start_time = samples[start_index].elapsed_seconds
    end_time = samples[end_index].elapsed_seconds
    heel_values = _context_values(
        samples,
        start_time - SUPPORT_CONTEXT_SECONDS,
        end_time + SUPPORT_CONTEXT_SECONDS,
        "heel",
    )
    heel_bounds = _robust_bounds(heel_values)
    heel_excursion = (
        heel_bounds[1] - heel_bounds[0]
        if heel_bounds is not None else None
    )
    heel_transition = _transition_magnitude(
        samples,
        start_index,
        end_index,
        "heel",
    )
    heel_crossing = bool(
        heel_bounds is not None
        and heel_bounds[0] < 0 < heel_bounds[1]
        and heel_excursion is not None
        and heel_excursion >= MIN_HEEL_TRANSITION_DEG
    )
    heel_support = (
        heel_excursion is not None
        and (
            heel_excursion >= MIN_HEEL_EXCURSION_DEG
            or (
                heel_transition is not None
                and heel_transition >= MIN_HEEL_TRANSITION_DEG
            )
            or heel_crossing
        )
    )

    sog_values = _context_values(
        samples,
        start_time - SUPPORT_CONTEXT_SECONDS,
        end_time + SUPPORT_CONTEXT_SECONDS,
        "sog",
    )
    sog_bounds = _robust_bounds(sog_values)
    sog_range = (
        sog_bounds[1] - sog_bounds[0]
        if sog_bounds is not None else None
    )
    sog_transition = _transition_magnitude(
        samples,
        start_index,
        end_index,
        "sog",
    )
    sog_support = (
        sog_range is not None
        and (
            sog_range >= MIN_SOG_RANGE_KNOTS
            or (
                sog_transition is not None
                and sog_transition >= MIN_SOG_TRANSITION_KNOTS
            )
        )
    )

    trim_values = _context_values(
        samples,
        start_time - SUPPORT_CONTEXT_SECONDS,
        end_time + SUPPORT_CONTEXT_SECONDS,
        "trim",
    )
    trim_bounds = _robust_bounds(trim_values)
    trim_excursion = (
        trim_bounds[1] - trim_bounds[0]
        if trim_bounds is not None else None
    )
    trim_transition = _transition_magnitude(
        samples,
        start_index,
        end_index,
        "trim",
    )

    prior_rates = [
        abs(sample.turn_rate_deg_s)
        for sample in samples
        if sample.turn_rate_deg_s is not None
        and start_time - SUPPORT_CONTEXT_SECONDS
        <= sample.elapsed_seconds < start_time
    ]
    prior_stability_support = bool(
        prior_rates and max(prior_rates) <= STABLE_TURN_RATE_DEG_S
    )
    support_count = sum((
        cog_support,
        heel_support,
        sog_support,
        prior_stability_support,
    ))

    reason = "accepted"
    acceptance_rule: str | None = None
    if not MIN_MANEUVER_DURATION_SECONDS <= duration <= MAX_MANEUVER_DURATION_SECONDS:
        reason = "duration"
    elif abs(heading_change) < MIN_HEADING_CHANGE_DEG:
        reason = "directional_change"
    elif total_rotation == 0 or coherence < MIN_DIRECTION_COHERENCE:
        reason = "directional_coherence"
    elif any(abs(delta) > MAX_ADJACENT_HEADING_CHANGE_DEG for delta in raw_deltas):
        reason = "adjacent_heading_jump"
    elif directional_samples < MIN_DIRECTIONAL_ROTATION_SAMPLES:
        reason = "directional_samples"
    elif not start_index < center_index < end_index:
        reason = "center_time"
    else:
        multisensor_direction = (
            abs(heading_change) < STANDARD_HEADING_CHANGE_DEG
            and (
                coherence >= MULTISENSOR_DIRECTION_COHERENCE
                or abs(heading_change) >= MIN_CORRECTED_CORE_HEADING_CHANGE_DEG
            )
            and peak_rate >= STRONG_PEAK_TURN_RATE_DEG_S
            and cog_agreement
            and cog_coherence >= MIN_MULTISENSOR_COG_COHERENCE
            and heel_support
            and sog_support
        )
        very_strong_direction = (
            abs(heading_change) >= VERY_STRONG_HEADING_CHANGE_DEG
            and coherence >= VERY_STRONG_DIRECTION_COHERENCE
            and peak_rate >= STRONG_PEAK_TURN_RATE_DEG_S
        )
        strong_direction = (
            abs(heading_change) >= STRONG_HEADING_CHANGE_DEG
            and coherence >= STRONG_DIRECTION_COHERENCE
            and peak_rate >= STRONG_PEAK_TURN_RATE_DEG_S
        )
        supported_direction = (
            coherence >= SUPPORTED_DIRECTION_COHERENCE
            and support_count >= 2
        )
        relaxed_direction = support_count >= 3
        if multisensor_direction:
            acceptance_rule = "multisensor_direction"
        elif (
            abs(heading_change) >= STANDARD_HEADING_CHANGE_DEG
            and very_strong_direction
        ):
            acceptance_rule = "very_strong_direction"
        elif (
            abs(heading_change) >= STANDARD_HEADING_CHANGE_DEG
            and strong_direction
            and support_count >= 1
        ):
            acceptance_rule = "strong_direction_with_support"
        elif (
            abs(heading_change) >= STANDARD_HEADING_CHANGE_DEG
            and supported_direction
        ):
            acceptance_rule = "supported_direction"
        elif (
            abs(heading_change) >= STANDARD_HEADING_CHANGE_DEG
            and relaxed_direction
        ):
            acceptance_rule = "combined_support"
        else:
            reason = "insufficient_support"

    accepted = reason == "accepted"
    assessment = ManeuverCandidateAssessment(
        start_time=samples[start_index].timestamp,
        center_time=samples[center_index].timestamp,
        end_time=samples[end_index].timestamp,
        heading_change_deg=round(heading_change, 3),
        directional_coherence=round(coherence, 3),
        candidate_directional_coherence=round(candidate_coherence, 3),
        peak_turn_rate_deg_s=round(peak_rate, 3),
        cog_change_deg=round(cog_change, 3) if cog_values_present else None,
        cog_directional_coherence=(
            round(cog_coherence, 3) if cog_values_present else None
        ),
        cog_support=cog_support,
        heel_excursion_deg=(
            round(heel_excursion, 3) if heel_excursion is not None else None
        ),
        heel_transition_deg=(
            round(heel_transition, 3) if heel_transition is not None else None
        ),
        heel_support=heel_support,
        sog_local_range_knots=(
            round(sog_range, 3) if sog_range is not None else None
        ),
        sog_transition_knots=(
            round(sog_transition, 3) if sog_transition is not None else None
        ),
        sog_support=sog_support,
        trim_excursion_deg=(
            round(trim_excursion, 3) if trim_excursion is not None else None
        ),
        trim_transition_deg=(
            round(trim_transition, 3) if trim_transition is not None else None
        ),
        prior_stability_support=prior_stability_support,
        accepted=accepted,
        reason=reason,
        acceptance_rule=acceptance_rule,
    )
    if not accepted:
        return None, assessment

    return Maneuver(
        start_time=samples[start_index].timestamp,
        center_time=samples[center_index].timestamp,
        end_time=samples[end_index].timestamp,
        heading_change_deg=round(heading_change, 3),
        peak_turn_rate_deg_s=round(peak_rate, 3),
        peak_turn_rate_time=samples[peak_index].timestamp,
    ), assessment
