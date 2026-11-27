"""Provider-independent segmentation of course-element position series (#242).

A tracked course element (committee boat, pin, mark) is laid, relocated,
recovered and sometimes re-laid within one race, so a time-averaged position is
wrong. Each series is split into *stable intervals* — every sample within a
bounded dispersion of a common position for a minimum duration — with the
median as the representative position. Remaining stretches are reported as
*relocation* and never yield a position.

Pure functions only: no I/O, persistence or provider knowledge.
"""

from dataclasses import dataclass
import math
from statistics import median
from typing import Literal, Sequence

from app.normalization.track_normalizer import EARTH_RADIUS_METRES


# D4 (approved 2026-11-26): dispersion <= 15 m for >= 120 s. Code-configurable.
STABLE_MAX_DISPERSION_METRES = 15.0
STABLE_MIN_DURATION_SECONDS = 120
# A stable interval never bridges a silence longer than its minimum duration:
# an unobserved relocation-and-return could hide inside a longer gap.
STABLE_MAX_SAMPLE_GAP_SECONDS = STABLE_MIN_DURATION_SECONDS

# Duplicate trackers carry the same object: their positions at shared
# timestamps agree within the D4 dispersion on most of the shorter series.
DUPLICATE_MAX_DISTANCE_METRES = STABLE_MAX_DISPERSION_METRES
DUPLICATE_DISTANCE_PERCENTILE = 95
DUPLICATE_MIN_SHARED_FRACTION = 0.5

NS_PER_SECOND = 1_000_000_000


@dataclass(frozen=True)
class Segment:
    kind: Literal["stable", "relocation"]
    start_ns: int
    end_ns: int
    sample_count: int
    # Only stable intervals carry a representative position and its dispersion.
    lat: float | None = None
    lon: float | None = None
    dispersion_m: float | None = None


def distance_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians((lon2 - lon1 + 180) % 360 - 180)
    haversine = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    haversine = min(1.0, max(0.0, haversine))
    return 2 * EARTH_RADIUS_METRES * math.asin(math.sqrt(haversine))


def _median_position(samples: Sequence) -> tuple[float, float]:
    # Component-wise median: robust to swing and GPS spikes at course scale.
    return median(s[1] for s in samples), median(s[2] for s in samples)


def _max_distance(samples: Sequence, lat: float, lon: float) -> float:
    return max(distance_metres(s[1], s[2], lat, lon) for s in samples)


def segment_track(
    samples: Sequence,
    *,
    max_dispersion_m: float = STABLE_MAX_DISPERSION_METRES,
    min_duration_s: float = STABLE_MIN_DURATION_SECONDS,
    max_gap_s: float = STABLE_MAX_SAMPLE_GAP_SECONDS,
) -> list[Segment]:
    """Split one strictly time-ordered series of (utc_ns, lat, lon) samples.

    Deterministic greedy scan: from the earliest unassigned sample, the first
    window spanning ``min_duration_s`` without a gap above ``max_gap_s`` seeds
    an interval when all its samples lie within ``max_dispersion_m`` of the
    window median (the anchor). The interval then extends while each next
    sample stays within ``max_dispersion_m`` of that anchor and no gap exceeds
    ``max_gap_s``. The interval is then trimmed at its end until every member
    lies within ``max_dispersion_m`` of the interval's own median, which is its
    representative position; back-to-back intervals whose union still satisfies
    that rule are merged. Unassigned samples form relocation segments.
    """
    min_duration_ns = int(min_duration_s * NS_PER_SECOND)
    max_gap_ns = int(max_gap_s * NS_PER_SECOND)
    n = len(samples)
    stable: list[tuple[int, int]] = []  # inclusive index ranges
    i = 0
    while i < n:
        seed_end, next_start = _seed_window(samples, i, min_duration_ns, max_gap_ns)
        if seed_end is None:
            i = next_start
            continue
        window = samples[i : seed_end + 1]
        anchor_lat, anchor_lon = _median_position(window)
        if _max_distance(window, anchor_lat, anchor_lon) > max_dispersion_m:
            i = next_start
            continue
        j = seed_end + 1
        while (
            j < n
            and samples[j][0] - samples[j - 1][0] <= max_gap_ns
            and distance_metres(samples[j][1], samples[j][2], anchor_lat, anchor_lon)
            <= max_dispersion_m
        ):
            j += 1
        # The interval's own median, not the seed anchor, must satisfy D4.
        last = _largest_valid_end(samples, i, seed_end, j - 1, max_dispersion_m)
        stable.append((i, last))
        i = last + 1
    stable = _merge_adjacent(samples, stable, max_dispersion_m, max_gap_ns)

    segments: list[Segment] = []
    cursor = 0
    for first, last in stable:
        if first > cursor:
            segments.append(_relocation(samples, cursor, first - 1))
        members = samples[first : last + 1]
        lat, lon = _median_position(members)
        segments.append(
            Segment(
                kind="stable",
                start_ns=samples[first][0],
                end_ns=samples[last][0],
                sample_count=len(members),
                lat=lat,
                lon=lon,
                dispersion_m=round(_max_distance(members, lat, lon), 1),
            )
        )
        cursor = last + 1
    if cursor < n:
        segments.append(_relocation(samples, cursor, n - 1))
    return segments


def _is_compact(samples: Sequence, first: int, last: int, max_dispersion_m: float) -> bool:
    members = samples[first : last + 1]
    lat, lon = _median_position(members)
    return _max_distance(members, lat, lon) <= max_dispersion_m


def _largest_valid_end(
    samples: Sequence, first: int, valid_end: int, candidate_end: int, max_dispersion_m: float
) -> int:
    """Largest end in ``[valid_end, candidate_end]`` whose members lie within the
    dispersion of their own median. ``valid_end`` is known to be compact (the
    seed window). Binary search, then a guaranteed-valid step-down."""
    if _is_compact(samples, first, candidate_end, max_dispersion_m):
        return candidate_end
    lo, hi = valid_end, candidate_end - 1
    while lo < hi:
        middle = (lo + hi + 1) // 2
        if _is_compact(samples, first, middle, max_dispersion_m):
            lo = middle
        else:
            hi = middle - 1
    while lo > valid_end and not _is_compact(samples, first, lo, max_dispersion_m):
        lo -= 1
    return lo


def _merge_adjacent(
    samples: Sequence,
    intervals: list[tuple[int, int]],
    max_dispersion_m: float,
    max_gap_ns: int,
) -> list[tuple[int, int]]:
    """Merge back-to-back stable intervals whose union is itself compact, so a
    trim split does not fragment one laid position."""
    merged: list[tuple[int, int]] = []
    for first, last in intervals:
        if (
            merged
            and merged[-1][1] + 1 == first
            and samples[first][0] - samples[first - 1][0] <= max_gap_ns
            and _is_compact(samples, merged[-1][0], last, max_dispersion_m)
        ):
            merged[-1] = (merged[-1][0], last)
        else:
            merged.append((first, last))
    return merged


def _seed_window(
    samples: Sequence, start: int, min_duration_ns: int, max_gap_ns: int
) -> tuple[int | None, int]:
    """Return ``(seed_end, next_start)``.

    ``seed_end`` is the first index reaching ``min_duration`` after ``start``
    with no gap above ``max_gap`` in between. When a gap interrupts the window,
    no interval can start before it: ``seed_end`` is None and ``next_start`` is
    the sample after the gap. When the series ends first, both are terminal.
    """
    for k in range(start + 1, len(samples)):
        if samples[k][0] - samples[k - 1][0] > max_gap_ns:
            return None, k
        if samples[k][0] - samples[start][0] >= min_duration_ns:
            return k, start + 1
    return None, len(samples)


def _relocation(samples: Sequence, first: int, last: int) -> Segment:
    return Segment(
        kind="relocation",
        start_ns=samples[first][0],
        end_ns=samples[last][0],
        sample_count=last - first + 1,
    )


def is_stationary(
    samples: Sequence,
    *,
    max_dispersion_m: float = STABLE_MAX_DISPERSION_METRES,
    min_duration_s: float = STABLE_MIN_DURATION_SECONDS,
) -> bool:
    """A tracker that never moved: the whole series lies within the dispersion
    of its median for at least the minimum duration."""
    if len(samples) < 2:
        return False
    if samples[-1][0] - samples[0][0] < min_duration_s * NS_PER_SECOND:
        return False
    lat, lon = _median_position(samples)
    return _max_distance(samples, lat, lon) <= max_dispersion_m


def are_duplicates(
    first: Sequence,
    second: Sequence,
    *,
    max_distance_m: float = DUPLICATE_MAX_DISTANCE_METRES,
    percentile: int = DUPLICATE_DISTANCE_PERCENTILE,
    min_shared_fraction: float = DUPLICATE_MIN_SHARED_FRACTION,
) -> bool:
    """Two trackers on the same object: on whole-second timestamps shared by
    both series, the nearest-rank ``percentile`` of their distances is within
    ``max_distance_m``, and the shared seconds cover at least
    ``min_shared_fraction`` of the shorter series."""
    by_second = {s[0] // NS_PER_SECOND: s for s in second}
    distances = sorted(
        distance_metres(s[1], s[2], other[1], other[2])
        for s in first
        if (other := by_second.get(s[0] // NS_PER_SECOND)) is not None
    )
    shorter = min(len(first), len(second))
    if not distances or len(distances) < min_shared_fraction * shorter:
        return False
    rank = math.ceil(percentile / 100 * len(distances)) - 1
    return distances[rank] <= max_distance_m
