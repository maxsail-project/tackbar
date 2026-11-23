"""Gap summary of a canonical normalized track, for any source (Issue #218, D5/D6).

A gap is a positive adjacent canonical UTC interval strictly greater than 10 seconds.
The summary records the real recorded endpoints only; nothing is interpolated.
"""

from collections.abc import Iterable

import pandas as pd

from app.models import TrackGap, TrackGapSummary


GAP_THRESHOLD_SECONDS = 10
NS_PER_SECOND = 1_000_000_000


def summarize_track_gaps(utc_values: Iterable[str]) -> TrackGapSummary:
    """Summarize canonical UTC text values in canonical track order."""
    values = [str(value) for value in utc_values]
    nanoseconds = (
        pd.to_datetime(pd.Series(values, dtype="object"), utc=True, format="ISO8601")
        .dt.as_unit("ns")
        .astype("int64")
        .tolist()
    )
    threshold_ns = GAP_THRESHOLD_SECONDS * NS_PER_SECOND
    intervals = []
    total_ns = 0
    for index in range(1, len(values)):
        elapsed_ns = nanoseconds[index] - nanoseconds[index - 1]
        if elapsed_ns > threshold_ns:
            intervals.append(TrackGap(start=values[index - 1], end=values[index]))
            total_ns += elapsed_ns
    return TrackGapSummary(
        count=len(intervals),
        total_seconds=total_ns / NS_PER_SECOND,
        intervals=tuple(intervals),
    )
