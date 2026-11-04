"""Issue #146.1: safe, bilingual GPX notice classification and presentation."""

import pytest

from app.services.gpx_notice_feedback import classify_gpx_error, safe_feedback
from app.services.technical_failure_notice import _body


@pytest.mark.parametrize("error,category,spanish,english", [
    ("GPX trackpoint has an invalid timezone offset", "chronology", "secuencia cronológica", "chronological sequence"),
    ("GPX timestamps must be strictly increasing in source order", "chronology", "secuencia cronológica", "chronological sequence"),
    ("GPX requires exactly one track", "structure", "una sola navegación", "one navigation track"),
    ("GPX requires exactly one nonempty segment", "structure", "un segmento", "one nonempty segment"),
    ("GPX trackpoint requires valid coordinates", "coordinates", "coordenadas no válidas", "invalid coordinates"),
    ("GPX trackpoint requires finite WGS84 coordinates", "coordinates", "coordenadas no válidas", "invalid coordinates"),
])
def test_known_simple_gpx_errors_have_bilingual_safe_messages(error, category, spanish, english):
    feedback = classify_gpx_error(error)
    assert feedback == {"category": category}
    body = _body("invalid_track", feedback)
    assert spanish in body and english in body
    assert "Detalle técnico:" in body and "Technical detail:" in body
    assert "correo nuevo" in body and "new email" in body
    assert error not in body


@pytest.mark.parametrize("error,hint,expected", [
    ("GPX trackpoint requires an explicit timezone-aware timestamp", "timezone", "timezone"),
    ("GPX trackpoint requires an explicit timezone-aware timestamp", "chronology", "chronology"),
    ("GPX trackpoint requires an explicit timezone-aware timestamp", None, None),
    ("GPX requires 2 to 100000 trackpoints", "structure", "structure"),
    ("GPX requires 2 to 100000 trackpoints", None, None),
])
def test_ambiguous_parser_text_needs_a_specific_safe_hint(error, hint, expected):
    feedback = classify_gpx_error(error, hint)
    assert feedback == ({"category": expected} if expected else None)


@pytest.mark.parametrize("error,rows", [
    ("GPX temporal quality failed: median 2.0000000005 s > 2 s", ["Median | 2.0000000005 s | ≤2 s"]),
    ("GPX temporal quality failed: P95 5.000000001 s > 5 s", ["95th percentile", "5.000000001 s | ≤5 s"]),
    ("GPX temporal quality failed: maximum adjacent gap 10.000000001 s > 10 s", ["Maximum interval | 10.000000001 s | ≤10 s"]),
    ("GPX temporal quality failed: median 5 s > 2 s; P95 11 s > 5 s; maximum adjacent gap 12 s > 10 s", ["Median | 5 s | ≤2 s", "11 s | ≤5 s", "Maximum interval | 12 s | ≤10 s"]),
])
def test_quality_message_compares_validated_violations(error, rows):
    feedback = classify_gpx_error(error)
    assert feedback["category"] == "quality"
    body = _body("invalid_track", feedback)
    assert "calidad de los datos GPS" in body and "GPS data quality" in body
    assert "navegación nueva" in body and "new sailing track" in body
    assert "1 Hz" in body and "grabación inteligente" in body and "smart recording" in body
    assert "Tu track | Requisito de TackBar" in body
    assert "Your track | TackBar requirement" in body
    if "P95" in feedback["metrics"]:
        assert "95% of intervals are no longer than this" in body
    for row in rows:
        assert row in body


@pytest.mark.parametrize("error", [
    "GPX temporal quality failed: median 2 s > 2 s",
    "GPX temporal quality failed: P95 5 s > 5 s",
    "GPX temporal quality failed: maximum adjacent gap 10 s > 10 s",
    "GPX temporal quality failed: median 3 s > 5 s",
    "GPX temporal quality failed: median 3 s > 2 s; median 4 s > 2 s",
    "GPX temporal quality failed: median 3 s > 2 s; /secret/file.gpx",
    "GPX temporal quality failed: median NaN s > 2 s",
    "GPX XML exceeds structural resource limits",
    "Malformed GPX XML <secret>",
])
def test_unknown_or_invalid_diagnostic_falls_back(error):
    assert classify_gpx_error(error) is None
    assert _body("invalid_track", classify_gpx_error(error)) == _body("invalid_track")


@pytest.mark.parametrize("feedback", [
    None, {}, {"category": "unknown"}, {"category": "quality"},
    {"category": ["quality"]},
    {"category": "quality", "metrics": {"median": "2"}},
    {"category": "quality", "metrics": {"median": "3<script>"}},
    {"category": "quality", "metrics": {"median": "Infinity"}},
    {"category": "quality", "metrics": {"median": "3", "extra": "secret"}},
    {"category": "quality", "metrics": {"median": "8", "P95": "6"}},
    {"category": "timezone", "private": "C:/secret/file.gpx"},
])
def test_missing_malformed_or_historical_feedback_falls_back(feedback):
    assert safe_feedback(feedback) is None
    assert _body("invalid_track", feedback) == _body("invalid_track")


def test_generic_fallback_never_uses_raw_diagnostics_or_vakaros_details():
    generic = _body("invalid_track")
    assert generic == _body("invalid_track", {"category": "vkx_sensor"})
    for private in ("C:/secret/file.gpx", "<trkpt>private</trkpt>", "private.csv", "Traceback"):
        assert private not in generic
    assert "new email" in generic and "correo nuevo" in generic
