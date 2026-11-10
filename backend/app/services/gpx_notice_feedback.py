"""Allowlisted, public-safe GPX validation feedback from controlled parser errors."""

import re
from decimal import Decimal, InvalidOperation

from app.services.vakaros_notice_feedback import safe_vakaros_feedback


SIMPLE_ERRORS = {
    "GPX trackpoint has an invalid timezone offset": "chronology",
    "GPX trackpoint has an invalid timestamp": "chronology",
    "GPX timestamps must be strictly increasing in source order": "chronology",
    "GPX requires exactly one track": "structure",
    "GPX requires exactly one nonempty segment": "structure",
    "GPX contains misplaced trackpoints": "structure",
    "GPX trackpoint requires valid coordinates": "coordinates",
    "GPX trackpoint requires finite WGS84 coordinates": "coordinates",
}
LIMITS = {"median": 2, "P95": 5, "maximum adjacent gap": 10}
METRIC = re.compile(r"(median|P95|maximum adjacent gap) (0|[1-9][0-9]{0,11})(?:\.([0-9]{1,10}))? s > (2|5|10) s")
QUALITY_PREFIX = "GPX temporal quality failed: "


HINTED_ERRORS = {
    "GPX trackpoint requires an explicit timezone-aware timestamp": {"timezone", "chronology"},
    "GPX requires 2 to 100000 trackpoints": {"structure"},
}


def classify_gpx_error(error: str, hint: str | None = None) -> dict | None:
    if isinstance(hint, str) and hint in HINTED_ERRORS.get(error, set()):
        return {"category": hint}
    category = SIMPLE_ERRORS.get(error)
    if category is not None:
        return {"category": category}
    if not error.startswith(QUALITY_PREFIX):
        return None
    parts = error[len(QUALITY_PREFIX):].split("; ")
    metrics = {}
    for part in parts:
        match = METRIC.fullmatch(part)
        if match is None:
            return None
        name, whole, fractional, limit = match.groups()
        value = whole + ("." + fractional if fractional is not None else "")
        try:
            observed = Decimal(value)
        except InvalidOperation:
            return None
        if name in metrics or int(limit) != LIMITS[name] or observed <= LIMITS[name]:
            return None
        metrics[name] = value
    if not metrics or list(metrics) != [name for name in LIMITS if name in metrics]:
        return None
    return {"category": "quality", "metrics": metrics}


def safe_feedback(value: object) -> dict | None:
    """Validate persisted context before any public use; unknown data fails closed."""
    if not isinstance(value, dict):
        return None
    category = value.get("category")
    if not isinstance(category, str):
        return None
    if category == "file_too_large" and set(value) == {"category"}:
        return {"category": category}
    if category.startswith("vakaros_"):
        return safe_vakaros_feedback(value)
    if category in {"timezone", "chronology", "structure", "coordinates"} and set(value) == {"category"}:
        return {"category": category}
    if category != "quality" or set(value) != {"category", "metrics"}:
        return None
    metrics = value["metrics"]
    if not isinstance(metrics, dict) or not metrics or set(metrics) - set(LIMITS):
        return None
    if list(metrics) != [name for name in LIMITS if name in metrics]:
        return None
    for name, observed in metrics.items():
        if not isinstance(observed, str) or not re.fullmatch(r"(0|[1-9][0-9]{0,11})(?:\.[0-9]{1,10})?", observed):
            return None
        if Decimal(observed) <= LIMITS[name]:
            return None
    ordered = [Decimal(metrics[name]) for name in LIMITS if name in metrics]
    if ordered != sorted(ordered):
        return None
    return {"category": "quality", "metrics": dict(metrics)}
