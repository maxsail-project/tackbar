"""Issue #146.1: safe, bilingual GPX notice classification and presentation."""

import pytest

from app.services.gpx_notice_feedback import classify_gpx_error, safe_feedback
from app.services.technical_failure_notice import CLOSING_EN, CLOSING_ES, OPENING_EN, OPENING_ES, _body, _quality_table


@pytest.mark.parametrize("error,category,spanish,english", [
    ("GPX trackpoint has an invalid timezone offset", "chronology", "secuencia válida", "valid sequence"),
    ("GPX timestamps must be strictly increasing in source order", "chronology", "secuencia válida", "valid sequence"),
    ("GPX requires exactly one track", "structure", "una sola navegación", "single sailing activity"),
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
    assert body.startswith(OPENING_ES + "\n\n")
    assert "\n\n---\n\n" + OPENING_EN + "\n\n" in body
    assert "\n\n" + CLOSING_ES + "\n\n---\n\n" + OPENING_EN in body
    assert body.endswith(CLOSING_EN)


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


@pytest.mark.parametrize("error,rows,absent", [
    ("GPX temporal quality failed: median 2.0000000005 s > 2 s", ["Median interval\n  Your track: 2.0000000005 s\n  TackBar requirement: ≤2 s"], ["95th percentile\n", "Maximum interval\n"]),
    ("GPX temporal quality failed: P95 5.000000001 s > 5 s", ["95th percentile\n  Your track: 5.000000001 s\n  TackBar requirement: ≤5 s"], ["Median interval\n", "Maximum interval\n"]),
    ("GPX temporal quality failed: maximum adjacent gap 10.000000001 s > 10 s", ["Maximum interval\n  Your track: 10.000000001 s\n  TackBar requirement: ≤10 s"], ["Median interval\n", "95th percentile\n"]),
    ("GPX temporal quality failed: median 5 s > 2 s; P95 11 s > 5 s; maximum adjacent gap 12 s > 10 s", ["Median interval\n  Your track: 5 s\n  TackBar requirement: ≤2 s", "95th percentile\n  Your track: 11 s\n  TackBar requirement: ≤5 s", "Maximum interval\n  Your track: 12 s\n  TackBar requirement: ≤10 s"], []),
])
def test_quality_message_compares_validated_violations(error, rows, absent):
    feedback = classify_gpx_error(error)
    assert feedback["category"] == "quality"
    body = _body("invalid_track", feedback)
    assert "calidad de los datos GPS" in body and "GPS data quality" in body
    assert "navegación nueva" in body and "new sailing track" in body
    assert "1 Hz" in body and "grabación inteligente" in body and "smart recording" in body
    assert "Tu track:" in body and "Requisito de TackBar:" in body
    assert "Your track:" in body and "TackBar requirement:" in body
    assert " | " not in body
    if "P95" in feedback["metrics"]:
        assert "at least 95% of intervals do not exceed" in body
    for row in rows:
        assert row in body
    for row in absent:
        assert row not in body


def test_timezone_message_explains_missing_context_without_blaming_device():
    body = _body("invalid_track", {"category": "timezone"})
    assert "a qué zona horaria corresponden" in body
    assert "which time zone" in body
    assert "Z o +01:00" in body and "Z or +01:00" in body
    assert "device configuration" not in body


def test_metric_blocks_fit_plain_text_mobile_width():
    metrics = {"median": "2.0000000005", "P95": "5.000000001", "maximum adjacent gap": "10.000000001"}
    for spanish in (True, False):
        lines = _quality_table(metrics, spanish).splitlines()
        assert max(map(len, lines)) <= 80
        assert all(" | " not in line for line in lines)


def test_approved_classified_opening_and_closing_are_exact():
    assert OPENING_ES == "Hola,\n\nNo hemos podido procesar tu track en TackBar."
    assert OPENING_EN == "Hi,\n\nWe couldn't process your track in TackBar."
    assert CLOSING_ES == "Gracias por compartir tu navegación con TackBar. Si necesitas ayuda con el archivo, puedes escribirnos a hello@tackbar.eu."
    assert CLOSING_EN == "Thank you for sharing your sailing activity with TackBar. If you need help with your file, you can contact us at hello@tackbar.eu."


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
