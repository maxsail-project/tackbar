"""Small circular-angle helpers shared by sailing analytics."""

from collections.abc import Iterable
from math import isfinite


def signed_angular_difference(start_degrees: float, end_degrees: float) -> float:
    """Return the shortest signed rotation from start to end in [-180, 180)."""
    if not isfinite(start_degrees) or not isfinite(end_degrees):
        raise ValueError("Angles must be finite")
    return (end_degrees - start_degrees + 180.0) % 360.0 - 180.0


def accumulated_signed_heading_change(headings: Iterable[float]) -> float:
    values = list(headings)
    return sum(
        signed_angular_difference(first, second)
        for first, second in zip(values, values[1:])
    )
