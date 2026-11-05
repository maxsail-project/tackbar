"""Issue #146.2: proven Vakaros rejections get controlled public feedback."""

import gzip
import math

import pytest

from app.parsers.vakaros_csv import REQUIRED_COLUMNS, VakarosCSVParseError, parse_vakaros_csv
from app.parsers.vakaros_vkx import VKXParseError, VKX_1_4_REVISION, parse_vakaros_vkx
from app.services.gpx_notice_feedback import safe_feedback
from app.services.outbound_mail import CONTACT_FOOTER, compose_automated_mail
from app.services.technical_failure_notice import CLOSING_EN, CLOSING_ES, OPENING_EN, OPENING_ES, SUBJECT, _body
from app.services.vakaros_notice_feedback import (
    SAFE_REQUIRED_COLUMNS, classify_vakaros_csv_error, classify_vakaros_vkx_error,
)
from test_vakaros_vkx import _header, _line, _position, _shift_angle, _timer, _vkx


CSV_HEADER = b"timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim\n"
CSV_ROW = b"2031-06-10T10:00:00Z,38.1,-0.2,5.2,359,1,-8,2\n"


def csv_feedback(content: bytes, filename: str = "track.csv") -> dict | None:
    with pytest.raises(VakarosCSVParseError) as rejected:
        parse_vakaros_csv(content, original_filename=filename)
    return classify_vakaros_csv_error(rejected.value)


def vkx_feedback(content: bytes, filename: str = "track.vkx") -> dict | None:
    with pytest.raises(VKXParseError) as rejected:
        parse_vakaros_vkx(content, original_filename=filename)
    return classify_vakaros_vkx_error(rejected.value)


def test_required_column_allowlist_matches_parser():
    assert SAFE_REQUIRED_COLUMNS == REQUIRED_COLUMNS


@pytest.mark.parametrize("content,expected", [
    (b"", {"category": "vakaros_incomplete", "subtype": "empty_csv"}),
    (b" \n", {"category": "vakaros_incomplete", "subtype": "empty_csv"}),
    (CSV_HEADER, {"category": "vakaros_incomplete", "subtype": "csv_no_samples"}),
    (CSV_HEADER + b"bad-time,38.1,-0.2,5.2,359,1,-8,2\n", {"category": "vakaros_gps"}),
    (CSV_HEADER + b"2031-06-10T10:00:00Z,999,999,5.2,359,1,-8,2\n", {"category": "vakaros_gps"}),
    (CSV_HEADER.replace(b"\n", b",q_w\n") + CSV_ROW.rstrip(b"\n") + b",0.5\n", {"category": "vakaros_sensor"}),
    (CSV_HEADER.replace(b"\n", b",q_w,q_x,q_y,q_z\n") + CSV_ROW.rstrip(b"\n") + b",bad,0,0,1\n", {"category": "vakaros_sensor"}),
])
def test_csv_classifications_use_proven_rejections(content, expected):
    feedback = csv_feedback(content)
    assert feedback == expected
    body = _body("invalid_track", feedback)
    assert "Hola" in body and "Hi" in body
    assert "correo nuevo" in body and "new email" in body
    assert "Detalle técnico:" in body and "Technical detail:" in body
    assert "Your track:" not in body
    assert body.startswith(OPENING_ES + "\n\n")
    assert "\n\n---\n\n" + OPENING_EN + "\n\n" in body
    assert "\n\n" + CLOSING_ES + "\n\n---\n\n" + OPENING_EN in body
    assert body.endswith(CLOSING_EN)


def test_missing_csv_columns_are_exact_allowlisted_detail():
    feedback = csv_feedback(b"timestamp,latitude,secret_value\n2031-06-10T10:00:00Z,38.1,private\n")
    assert feedback == {
        "category": "vakaros_incomplete",
        "missing_columns": ["cog", "hdg_true", "heel", "longitude", "sog_kts", "trim"],
    }
    body = _body("invalid_track", feedback)
    assert "these required CSV columns are missing: cog, hdg_true, heel, longitude, sog_kts, trim" in body
    assert "faltan estas columnas CSV:" in body
    assert "secret_value" not in body and "private" not in body


@pytest.mark.parametrize("content,expected", [
    (_header(), {"category": "vakaros_incomplete", "subtype": "vkx_no_navigation"}),
    (_vkx(_position()) + bytes([0x05]) + bytes(16), {"category": "vakaros_incomplete", "subtype": "vkx_truncated"}),
    (_vkx(_position(), revision=0x04), {"category": "vakaros_format"}),
    (_vkx(_position(latitude_raw=910_000_000)), {"category": "vakaros_gps"}),
    (_vkx(_position(timestamp_ms=2**64 - 1)), {"category": "vakaros_gps"}),
    (_vkx(_position(sog=float("nan"))), {"category": "vakaros_sensor"}),
    (_vkx(_position(quat_w=float("inf"))), {"category": "vakaros_sensor"}),
    (_vkx(_position(), _shift_angle(2**64 - 1, 0, 0, 10, 5)), {"category": "vakaros_sensor"}),
    (_vkx(_position(), _shift_angle(1_938_854_096_789, 0, 0, 361, 5)), {"category": "vakaros_sensor"}),
])
def test_vkx_classifications_use_proven_whole_file_rejections(content, expected):
    feedback = vkx_feedback(content)
    assert feedback == expected
    body = _body("invalid_track", feedback)
    assert "Hola" in body and "Hi" in body
    assert "correo nuevo" in body and "new email" in body
    assert "0x05" not in body and "0x04" not in body
    assert "Your track:" not in body


def test_compressed_vakaros_formats_reuse_same_mapping():
    assert csv_feedback(gzip.compress(CSV_HEADER), "track.csv.gz") == {"category": "vakaros_incomplete", "subtype": "csv_no_samples"}
    assert vkx_feedback(gzip.compress(_vkx(_position(), revision=0x04)), "track.vkx.gz") == {"category": "vakaros_format"}


@pytest.mark.parametrize("content,filename", [
    (b"\xff", "track.csv"),
    (b"not gzip", "track.csv.gz"),
])
def test_ambiguous_csv_parse_failures_stay_generic(content, filename):
    assert csv_feedback(content, filename) is None


@pytest.mark.parametrize("content,filename", [
    (b"not a vkx", "track.vkx"),
    (_header() + bytes([0x99]), "track.vkx"),
    (b"not gzip", "track.vkx.gz"),
])
def test_ambiguous_vkx_failures_stay_generic(content, filename):
    assert vkx_feedback(content, filename) is None


def test_skipped_complete_auxiliary_observations_accept_file():
    activity = parse_vakaros_vkx(_vkx(
        _position(), _timer(2**64 - 1, 3, 0),
        _line(1_938_854_096_789, 0, math.nan, 0),
    ), original_filename="track.vkx")
    assert len(activity.samples) == 1
    assert activity.race_timer_events == [] and activity.line_positions == []


def test_dynamic_classifier_hints_do_not_authorize_arbitrary_parser_text():
    assert classify_vakaros_vkx_error(VKXParseError(
        "Unsupported Vakaros VKX revision 0x04 C:/private/file.vkx",
        feedback_category="vakaros_format",
    )) is None
    assert classify_vakaros_vkx_error(VKXParseError(
        "Vakaros VKX row 0x99 is truncated", feedback_category="vakaros_incomplete",
    )) is None
    assert classify_vakaros_csv_error(VakarosCSVParseError(
        "Vakaros CSV is missing required columns: cog, private_column",
        feedback_category="vakaros_incomplete",
        missing_columns=("cog", "private_column"),
    )) is None


@pytest.mark.parametrize("value", [
    {"category": "vakaros_unknown"},
    {"category": "vakaros_incomplete", "missing_columns": ["private_column"]},
    {"category": "vakaros_incomplete", "missing_columns": ["cog", "cog"]},
    {"category": "vakaros_incomplete", "missing_columns": ["longitude", "cog"]},
    {"category": "vakaros_sensor", "missing_columns": ["cog"]},
    {"category": "vakaros_gps", "secret": "C:/private/file.vkx"},
    {"category": "vakaros_incomplete", "subtype": "unknown"},
    {"category": "vakaros_sensor", "subtype": "empty_csv"},
    {"category": "vakaros_incomplete", "subtype": "empty_csv", "missing_columns": ["cog"]},
])
def test_untrusted_or_historical_context_falls_back(value):
    assert safe_feedback(value) is None
    assert _body("invalid_track", value) == _body("invalid_track")


def test_classified_vakaros_notice_retains_shared_footer_and_no_links():
    message = compose_automated_mail(
        "sailor@example.test", SUBJECT,
        _body("invalid_track", {"category": "vakaros_format"}),
    )
    assert message.body.count(CONTACT_FOOTER) == 1
    assert "\n\n" + CLOSING_ES + "\n\n---\n\n" + OPENING_EN in message.body
    assert message.body.endswith(CLOSING_EN + "\n\n" + CONTACT_FOOTER + "\n")
    spanish_section, english_section = _body("invalid_track", {"category": "vakaros_format"}).split("\n\n---\n\n")
    assert spanish_section.count("hello@tackbar.eu") == 1
    assert english_section.count("hello@tackbar.eu") == 1
    assert "Hola" in message.body and "Hi" in message.body
    assert "https://" not in message.body


def test_proven_revision_only_mentions_supported_vkx_1_4():
    assert VKX_1_4_REVISION == 0x05
    body = _body("invalid_track", vkx_feedback(_vkx(_position(), revision=0x04)))
    assert "VKX 1.4" in body
    assert "0x04" not in body and "0x05" not in body
    for corrupt in (b"not a vkx", _header() + bytes([0x99])):
        assert vkx_feedback(corrupt) is None
        assert _body("invalid_track", vkx_feedback(corrupt)) == _body("invalid_track")


@pytest.mark.parametrize("feedback,spanish,english", [
    ({"category": "vakaros_incomplete", "subtype": "empty_csv"}, "CSV no contiene datos", "CSV contains no readable data"),
    ({"category": "vakaros_incomplete", "subtype": "csv_no_samples"}, "no contiene muestras", "no navigation samples"),
    ({"category": "vakaros_incomplete", "subtype": "vkx_no_navigation"}, "VKX no contiene muestras", "VKX has no navigation samples"),
    ({"category": "vakaros_incomplete", "subtype": "vkx_truncated"}, "VKX está incompleto", "VKX file is incomplete"),
    ({"category": "vakaros_incomplete"}, "archivo está incompleto", "file is incomplete"),
])
def test_incomplete_subtype_copy_and_historical_general_copy(feedback, spanish, english):
    assert safe_feedback(feedback) == feedback
    body = _body("invalid_track", feedback)
    assert spanish in body and english in body
    assert "\n\n" + CLOSING_ES + "\n\n---\n\n" + OPENING_EN in body
    assert body.endswith(CLOSING_EN)
