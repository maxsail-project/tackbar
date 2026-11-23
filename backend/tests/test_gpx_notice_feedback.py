"""Issue #146.1: safe, bilingual GPX notice classification and presentation."""

import pytest

from app.parsers.gpx import GPXParseError, parse_gpx
from app.services.gpx_notice_feedback import classify_gpx_error, safe_feedback
from app.services.technical_failure_notice import CLOSING_EN, CLOSING_ES, OPENING_EN, OPENING_ES, _body, _quality_table

from test_gpx import ALL_CRITERIA_ERROR, QUALITY_REJECTIONS

GAP_RULE_EN = "TackBar accepts at most 2 intervals over 10 s, each lasting up to 90 s.\nTogether they may total at most 5% of the track duration."
GAP_RULE_ES = "TackBar admite como máximo 2 intervalos de más de 10 s, de hasta 90 s cada uno.\nEntre todos pueden sumar como máximo el 5 % de la duración del track."


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
    ("GPX temporal quality failed: median 2.0000000005 s > 2 s", ["Median interval\n  Your track: 2.0000000005 s\n  TackBar requirement: ≤2 s"], ["95th percentile\n", "over 10 s", GAP_RULE_EN]),
    ("GPX temporal quality failed: P95 5.000000001 s > 5 s", ["95th percentile\n  Your track: 5.000000001 s\n  TackBar requirement: ≤5 s"], ["Median interval\n", "over 10 s", GAP_RULE_EN]),
    ("GPX temporal quality failed: exceptional gap count 3 > 2", ["Intervals over 10 s\n  Your track: 3\n  TackBar requirement: ≤2", "Intervalos de más de 10 s\n  Tu track: 3\n  Requisito de TackBar: ≤2", GAP_RULE_EN, GAP_RULE_ES], ["Median interval\n", "95th percentile\n", "Longest interval"]),
    ("GPX temporal quality failed: longest exceptional gap 90.000000001 s > 90 s", ["Longest interval over 10 s\n  Your track: 90.000000001 s\n  TackBar requirement: ≤90 s", GAP_RULE_EN], ["Intervals over 10 s\n", "Total of intervals"]),
    ("GPX temporal quality failed: exceptional gap total 64 s > 63.95 s (5% of track duration 1279 s)", ["Total of intervals over 10 s\n  Your track: 64 s\n  TackBar requirement: ≤63.95 s (5% of the duration)", "Suma de intervalos de más de 10 s\n  Tu track: 64 s\n  Requisito de TackBar: ≤63.95 s (5 % de la duración)", GAP_RULE_ES], ["Median interval\n", "Longest interval"]),
    (ALL_CRITERIA_ERROR, ["Median interval\n  Your track: 5 s\n  TackBar requirement: ≤2 s", "95th percentile\n  Your track: 12 s\n  TackBar requirement: ≤5 s", "Intervals over 10 s\n  Your track: 3\n", "Longest interval over 10 s\n  Your track: 100 s\n", "Total of intervals over 10 s\n  Your track: 123 s\n  TackBar requirement: ≤10.65 s"], ["Maximum interval\n"]),
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


@pytest.mark.parametrize("content,error", QUALITY_REJECTIONS)
def test_every_parser_quality_rejection_maps_to_the_temporal_quality_notice(content, error):
    with pytest.raises(GPXParseError) as rejected:
        parse_gpx(content, "track.gpx")
    assert str(rejected.value) == error
    feedback = classify_gpx_error(error)
    assert feedback["category"] == "quality" and safe_feedback(feedback) == feedback


def test_dynamic_total_limit_travels_with_safe_feedback():
    feedback = classify_gpx_error(ALL_CRITERIA_ERROR)
    assert feedback == {
        "category": "quality",
        "metrics": {"median": "5", "P95": "12", "exceptional gap count": "3", "longest exceptional gap": "100", "exceptional gap total": "123"},
        "limits": {"exceptional gap total": "10.65"},
    }


def test_metric_blocks_fit_plain_text_mobile_width():
    metrics = {"median": "2.0000000005", "P95": "5.000000001", "exceptional gap count": "3", "longest exceptional gap": "90.000000001", "exceptional gap total": "99999.000000001"}
    for spanish in (True, False):
        lines = _quality_table(metrics, spanish, {"exceptional gap total": "4999.95000000005"}).splitlines()
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
    "GPX temporal quality failed: maximum adjacent gap 12 s > 10 s",
    "GPX temporal quality failed: longest exceptional gap 90 s > 90 s",
    "GPX temporal quality failed: exceptional gap count 2 > 2",
    "GPX temporal quality failed: exceptional gap count 3 > 3",
    "GPX temporal quality failed: exceptional gap total 64 s > 64 s (5% of track duration 1280 s)",
    "GPX temporal quality failed: exceptional gap total 65 s > 63 s (5% of track duration 1280 s)",
    "GPX temporal quality failed: exceptional gap total 2000 s > 64 s (5% of track duration 1280 s)",
    "GPX temporal quality failed: exceptional gap total 65 s > 64 s",
    "GPX temporal quality failed: exceptional gap count 3 > 2; median 3 s > 2 s",
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
    {"category": "quality", "metrics": {"maximum adjacent gap": "12"}},
    {"category": "quality", "metrics": {"exceptional gap total": "65"}},
    {"category": "quality", "metrics": {"exceptional gap total": "65"}, "limits": {"exceptional gap total": "65"}},
    {"category": "quality", "metrics": {"exceptional gap total": "65"}, "limits": {"exceptional gap total": "x"}},
    {"category": "quality", "metrics": {"median": "3"}, "limits": {}},
    {"category": "quality", "metrics": {"median": "3"}, "limits": {"median": "2"}},
    {"category": "quality", "metrics": {"exceptional gap count": "3.5"}},
    {"category": "quality", "metrics": {"longest exceptional gap": "120", "exceptional gap total": "100"}, "limits": {"exceptional gap total": "50"}},
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
