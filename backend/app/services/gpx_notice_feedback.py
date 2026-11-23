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
# Stable parser order (#171, #218). The exceptional-gap total limit is 5% of the
# track duration, so its exact limit travels with the feedback in "limits".
GAP_TOTAL = "exceptional gap total"
GAP_COUNT = "exceptional gap count"
LIMITS = {
    "median": 2,
    "P95": 5,
    GAP_COUNT: 2,
    "longest exceptional gap": 90,
    GAP_TOTAL: None,
}
GAP_TOTAL_PERCENT = 5
_NUMBER = r"(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,11})?"
METRIC = re.compile(
    rf"(median|P95|longest exceptional gap) ({_NUMBER}) s > (2|5|90) s"
    rf"|({GAP_COUNT}) ([1-9][0-9]{{0,5}}) > (2)"
    rf"|({GAP_TOTAL}) ({_NUMBER}) s > ({_NUMBER}) s"
    rf" \({GAP_TOTAL_PERCENT}% of track duration ({_NUMBER}) s\)"
)
QUALITY_PREFIX = "GPX temporal quality failed: "


HINTED_ERRORS = {
    "GPX trackpoint requires an explicit timezone-aware timestamp": {"timezone", "chronology"},
    "GPX requires 2 to 100000 trackpoints": {"structure"},
}


def _parse_metric(part: str) -> tuple[str, str, Decimal] | None:
    """Return a validated (name, observed, limit) triple for one diagnostic part."""
    match = METRIC.fullmatch(part)
    if match is None:
        return None
    groups = [group for group in match.groups() if group is not None]
    name, observed, limit = groups[:3]
    try:
        limit_value = Decimal(limit)
        if name == GAP_TOTAL:
            duration = Decimal(groups[3])
            if limit_value != duration * GAP_TOTAL_PERCENT / 100 or Decimal(observed) > duration:
                return None
        elif limit_value != LIMITS[name]:
            return None
        if Decimal(observed) <= limit_value:
            return None
    except InvalidOperation:
        return None
    return name, observed, limit_value


def classify_gpx_error(error: str, hint: str | None = None) -> dict | None:
    if isinstance(hint, str) and hint in HINTED_ERRORS.get(error, set()):
        return {"category": hint}
    category = SIMPLE_ERRORS.get(error)
    if category is not None:
        return {"category": category}
    if not error.startswith(QUALITY_PREFIX):
        return None
    metrics = {}
    limits = {}
    for part in error[len(QUALITY_PREFIX):].split("; "):
        parsed = _parse_metric(part)
        if parsed is None or parsed[0] in metrics:
            return None
        name, observed, limit = parsed
        metrics[name] = observed
        if name == GAP_TOTAL:
            limits[name] = format(limit, "f")
    if list(metrics) != [name for name in LIMITS if name in metrics]:
        return None
    feedback = {"category": "quality", "metrics": metrics}
    if limits:
        feedback["limits"] = limits
    return feedback


def _safe_quality(value: dict) -> dict | None:
    metrics = value.get("metrics")
    limits = value.get("limits", {})
    if set(value) - {"limits"} != {"category", "metrics"} or not isinstance(metrics, dict) or not metrics:
        return None
    if set(metrics) - set(LIMITS) or list(metrics) != [name for name in LIMITS if name in metrics]:
        return None
    # Only the dynamic exceptional-gap total carries an explicit limit.
    if not isinstance(limits, dict) or set(limits) != {GAP_TOTAL} & set(metrics):
        return None
    if "limits" in value and not limits:
        return None
    seconds = []
    for name, observed in metrics.items():
        observed_pattern = r"[1-9][0-9]{0,5}" if name == GAP_COUNT else _NUMBER
        limit = limits[name] if name == GAP_TOTAL else str(LIMITS[name])
        if not isinstance(observed, str) or not re.fullmatch(observed_pattern, observed):
            return None
        if not isinstance(limit, str) or not re.fullmatch(_NUMBER, limit):
            return None
        if Decimal(observed) <= Decimal(limit):
            return None
        if name != GAP_COUNT:
            seconds.append(Decimal(observed))
    # Median <= P95 <= longest interval <= exceptional total for one real track.
    if seconds != sorted(seconds):
        return None
    result = {"category": "quality", "metrics": dict(metrics)}
    if limits:
        result["limits"] = dict(limits)
    return result


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
    if category != "quality":
        return None
    return _safe_quality(value)
