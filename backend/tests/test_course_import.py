"""GeoRacing course import draft and validation (Issue #242, increment 242.1).

Committed tests use the deterministic synthetic elements file built by
``synthetic_course_elements`` (invented names, positions and timings). The real
GeoRacing export is used only by the opt-in test at the end of this module,
when ``TACKBAR_GEORACING_ELEMENTS_GPX`` names a readable local file; that file
is never copied into the repository.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.parse import urlencode

import pytest
from pydantic import ValidationError

from app.admin_course_routes import MAX_VALIDATE_BODY_BYTES
from app.course.draft import build_course_draft, utc_from_ns
from app.course.georacing_roles import suggest_role
from app.course.schema import ROLE_VOCABULARY, CourseContextV1, ReviewedCourse
from app.course.segmentation import (
    STABLE_MAX_DISPERSION_METRES,
    STABLE_MIN_DURATION_SECONDS,
    are_duplicates,
    distance_metres,
    is_stationary,
    segment_track,
)
from app.main import app
from app.parsers.georacing_elements import (
    MAX_ELEMENT_TRACKS,
    GeoRacingElementsParseError,
    parse_georacing_elements,
)
from app.parsers.gpx import MAX_GPX_BYTES, GPXParseError, parse_gpx

import synthetic_course_elements as synthetic
from synthetic_course_elements import NAMES, at, to_latlon
from test_manual_ingestion import runtime  # noqa: F401  (pytest fixture)


KEY = "offline-admin-key"
NS = 1_000_000_000
FILENAME = "Synthetic Race 7_elements.gpx"
REAL_FILE_VARIABLE = "TACKBAR_GEORACING_ELEMENTS_GPX"


@pytest.fixture(scope="module")
def elements_bytes() -> bytes:
    return synthetic.elements_gpx()


@pytest.fixture(scope="module")
def parsed(elements_bytes):
    return parse_georacing_elements(elements_bytes, FILENAME)


@pytest.fixture(scope="module")
def draft(parsed):
    return build_course_draft(
        parsed, sha256="0" * 64, imported_at=datetime(2031, 3, 15, tzinfo=timezone.utc)
    )


def within(value: datetime, minutes: float, tolerance_s: int = 30) -> bool:
    """``value`` lies in [design time, design time + tolerance]."""
    return at(minutes) <= value <= at(minutes) + timedelta(seconds=tolerance_s)


def metres_from(segment, east_north) -> float:
    return distance_metres(segment.lat, segment.lon, *to_latlon(east_north))


def track(draft, label):
    return next(t for t in draft.tracks if t.label == label)


def initial_stable_end(draft, label) -> datetime:
    """End of the stable coverage that starts the track, before any relocation."""
    segments = track(draft, label).segments
    assert segments[0].kind == "stable"
    end = None
    for segment in segments:
        if segment.kind != "stable":
            break
        end = segment.to
    return end


# --- Parser -----------------------------------------------------------------


def test_parses_all_tracks_in_source_order(parsed):
    assert parsed.name == "Synthetic Race 7"
    assert [t.name for t in parsed.tracks] == NAMES
    assert [t.index for t in parsed.tracks] == list(range(1, 12))
    assert all(len(t.samples) > 100 for t in parsed.tracks)


def test_activity_gpx_admission_still_rejects_the_multi_track_elements_file(elements_bytes):
    with pytest.raises(GPXParseError, match="exactly one track"):
        parse_gpx(elements_bytes, FILENAME)


def elements_gpx(tracks=None, root='<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">'):
    if tracks is None:
        tracks = [_trk("A", [(0, 0.0, 0.0), (1, 0.0, 0.00001)])]
    return f"{root}{''.join(tracks)}</gpx>".encode()


def _trk(name, points, times=None):
    start = datetime(2031, 6, 15, 8, tzinfo=timezone.utc)
    body = "".join(
        f'<trkpt lat="{lat}" lon="{lon}"><time>'
        f'{times[i] if times else (start + timedelta(seconds=s)).isoformat()}</time></trkpt>'
        for i, (s, lat, lon) in enumerate(points)
    )
    return f"<trk><name>{name}</name><trkseg>{body}</trkseg></trk>"


TWO = [(0, 0.0, 0.0), (1, 0.0, 0.00001)]


@pytest.mark.parametrize(
    ("content", "filename", "message"),
    [
        (elements_gpx(), "course.gpx.gz", "must end with .gpx"),
        (b"<gpx><trk>", "c.gpx", "Malformed GPX XML"),
        (b'<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]><gpx>&a;</gpx>',
         "c.gpx", "DTDs and entities are unsupported"),
        (b"<gpx>" + b"<a>" * 40 + b"</a>" * 40 + b"</gpx>", "c.gpx", "structural resource limits"),
        (b"<kml/>", "c.gpx", "supported gpx root"),
        (elements_gpx(tracks=[]), "c.gpx", "requires 1 to 32 tracks"),
        (elements_gpx(tracks=[_trk(f"T{i}", TWO) for i in range(MAX_ELEMENT_TRACKS + 1)]),
         "c.gpx", "requires 1 to 32 tracks"),
        (elements_gpx(tracks=[_trk("A", TWO).replace("</trkseg>", "</trkseg><trkseg></trkseg>")]),
         "c.gpx", "exactly one segment"),
        (elements_gpx(tracks=[_trk("A", TWO[:1])]), "c.gpx", "at least 2 trackpoints"),
        (elements_gpx(tracks=[_trk("A", TWO, times=["2031-06-15T08:00:00", "2031-06-15T08:00:01"])]),
         "c.gpx", "timezone-aware"),
        (elements_gpx(tracks=[_trk("A", TWO, times=["2031-06-15T08:00:01Z", "2031-06-15T08:00:01Z"])]),
         "c.gpx", "strictly increasing"),
        (elements_gpx(tracks=[_trk("A", TWO, times=["2031-06-15T08:00:02Z", "2031-06-15T08:00:01Z"])]),
         "c.gpx", "strictly increasing"),
        (elements_gpx(tracks=[_trk("A", [(0, 91.0, 0.0), (1, 0.0, 0.0)])]),
         "c.gpx", "finite WGS84"),
        (elements_gpx(tracks=[_trk("A", [(0, "nan", 0.0), (1, 0.0, 0.0)])]),
         "c.gpx", "finite WGS84"),
        (elements_gpx(tracks=[_trk("A", TWO) + '<trkpt lat="0" lon="0"/>']),
         "c.gpx", "misplaced trackpoints"),
    ],
)
def test_rejects_unsafe_malformed_or_out_of_contract_files(content, filename, message):
    with pytest.raises(GeoRacingElementsParseError, match=message):
        parse_georacing_elements(content, filename)


def test_rejects_oversized_input_before_parsing():
    content = elements_gpx() + b" " * (MAX_GPX_BYTES + 1 - len(elements_gpx()))
    with pytest.raises(GeoRacingElementsParseError, match="16 MiB"):
        parse_georacing_elements(content, "c.gpx")


def test_rejects_entity_expansion_without_expanding():
    laughs = (
        b'<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "lol">'
        b'<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><gpx>&b;</gpx>'
    )
    with pytest.raises(GeoRacingElementsParseError, match="DTDs and entities"):
        parse_georacing_elements(laughs, "c.gpx")


def test_offsets_normalize_to_utc_and_names_are_cleaned():
    content = elements_gpx(tracks=[
        _trk("  Race\tcommittee ", TWO, times=["2031-06-15T10:00:00+02:00", "2031-06-15T08:00:01Z"])
    ])
    parsed = parse_georacing_elements(content, "C.GPX")
    assert parsed.tracks[0].name == "Race committee"
    assert parsed.tracks[0].samples[0].utc_ns == int(
        datetime(2031, 6, 15, 8, tzinfo=timezone.utc).timestamp()
    ) * NS


# --- Segmentation (pure) ------------------------------------------------------


def series(*parts, start_s=0):
    """parts: (seconds, lat, lon, jitter_m, step_s); moves are linear parts."""
    samples, t = [], start_s
    for part in parts:
        if part[0] == "move":
            _, seconds, (lat1, lon1), (lat2, lon2) = part
            for k in range(seconds):
                f = k / seconds
                samples.append((t * NS, lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f))
                t += 1
            continue
        seconds, lat, lon, jitter_m, step = part
        for k in range(0, seconds, step):
            offset = jitter_m / 111_320 * math.sin(k)
            samples.append((t * NS, lat + offset, lon))
            t += step
    return samples


A, B = (-22.93, -43.148), (-22.925, -43.148)  # ~556 m apart


def test_stationary_with_swing_is_one_stable_interval_at_its_median():
    segments = segment_track(series((600, *A, 6, 1)))
    assert [s.kind for s in segments] == ["stable"]
    assert segments[0].sample_count == 600
    assert distance_metres(segments[0].lat, segments[0].lon, *A) < 1
    assert segments[0].dispersion_m <= STABLE_MAX_DISPERSION_METRES


def test_relocation_separates_two_stable_positions_and_never_yields_a_position():
    segments = segment_track(series((300, *A, 3, 1), ("move", 60, A, B), (300, *B, 3, 1)))
    assert [s.kind for s in segments] == ["stable", "relocation", "stable"]
    first, moving, second = segments
    assert distance_metres(first.lat, first.lon, *A) < 2
    assert distance_metres(second.lat, second.lon, *B) < 2
    assert moving.lat is moving.lon is moving.dispersion_m is None
    assert first.end_ns < moving.start_ns <= moving.end_ns < second.start_ns


def test_a_hold_shorter_than_the_minimum_duration_is_not_stable():
    segments = segment_track(
        series(("move", 120, B, A), (STABLE_MIN_DURATION_SECONDS - 10, *A, 1, 1), ("move", 120, A, B))
    )
    assert [s.kind for s in segments] == ["relocation"]


def test_dispersion_above_threshold_is_never_stable():
    assert [s.kind for s in segment_track(series((600, *A, 40, 1)))] == ["relocation"]


def test_a_silence_longer_than_the_minimum_duration_splits_intervals():
    samples = series((300, *A, 2, 1)) + series((300, *A, 2, 1), start_s=300 + 121)
    segments = segment_track(samples)
    assert [s.kind for s in segments] == ["stable", "stable"]
    assert segments[0].end_ns < segments[1].start_ns


def test_stationary_and_duplicate_helpers_on_synthetic_series():
    still = series((600, *A, 2, 1))
    assert is_stationary(still)
    assert not is_stationary(series((300, *A, 2, 1), ("move", 60, A, B)))
    assert not is_stationary(series((60, *A, 0, 1)))  # shorter than the minimum duration
    shifted = [(t, lat + 5 / 111_320, lon) for t, lat, lon in still]
    assert are_duplicates(still, shifted)
    far = [(t, lat + 30 / 111_320, lon) for t, lat, lon in still]
    assert not are_duplicates(still, far)
    later = series((600, *A, 2, 1), start_s=400)  # shares 200 of 600 seconds
    assert not are_duplicates(still, later)


# --- Synthetic scenario behavior -------------------------------------------------


def stable_after(draft, label, moment):
    return [s for s in track(draft, label).segments if s.kind == "stable" and s.from_ > moment]


def test_every_stable_interval_respects_d4(draft):
    for t in draft.tracks:
        for segment in t.segments:
            assert segment.sample_count >= 1
            assert segment.from_ <= segment.to
            if segment.kind == "stable":
                assert segment.dispersion_m <= STABLE_MAX_DISPERSION_METRES
                assert (segment.to - segment.from_).total_seconds() >= STABLE_MIN_DURATION_SECONDS
        assert all(a.to < b.from_ for a, b in zip(t.segments, t.segments[1:]))


def test_committee_boat_bridges_short_silences_and_splits_at_a_long_one(draft):
    segments = track(draft, "Race committee").segments
    first, second, moving, late = segments
    # 40 s and 60 s silences (10:10, 10:20) are bridged; 180 s (10:30-10:33) splits.
    assert (first.kind, first.from_, first.to) == ("stable", at(0), at(30))
    assert (second.kind, second.from_) == ("stable", at(33))
    assert within(second.to, 50)
    assert moving.kind == "relocation"
    assert late.kind == "stable" and late.to == at(60)
    assert metres_from(first, synthetic.RC) <= 3 and metres_from(second, synthetic.RC) <= 3
    assert metres_from(late, synthetic.RC_LATE) <= 5


def test_gate_w_is_laid_then_recovered_at_different_times(draft):
    for label, minutes in (("Buoy W1", 45), ("Buoy W2", 46)):
        first, recovery = track(draft, label).segments
        assert first.kind == "stable" and first.from_ == at(0) and within(first.to, minutes)
        assert recovery.kind == "relocation" and recovery.to == at(60)
    w1, w2 = (track(draft, label).segments[0] for label in ("Buoy W1", "Buoy W2"))
    assert 70 <= distance_metres(w1.lat, w1.lon, w2.lat, w2.lon) <= 90


def test_gate_a_b_is_laid_then_relocated_at_different_times(draft):
    for label, minutes, relocated in (
        ("Gate B", 29, synthetic.GATE_B_2), ("Gate A", 30, synthetic.GATE_A_2),
    ):
        segments = track(draft, label).segments
        assert segments[0].kind == "stable" and within(segments[0].to, minutes)
        assert segments[1].kind == "relocation"
        later = stable_after(draft, label, segments[0].to)
        assert later and all(metres_from(s, relocated) <= 5 for s in later)
        assert within(later[-1].to, 55)
    a, b = (track(draft, label).segments[0] for label in ("Gate A", "Gate B"))
    assert 80 <= distance_metres(a.lat, a.lon, b.lat, b.lon) <= 100


def test_start_pin_relocates_and_the_finish_pin_takes_its_former_position(draft):
    pin = track(draft, "Start Pin").segments
    first = pin[0]
    assert first.kind == "stable" and within(first.to, 20, 60)
    assert metres_from(first, synthetic.PIN_1) <= 3
    assert pin[1].kind == "relocation"
    relocated = stable_after(draft, "Start Pin", first.to)
    assert relocated and all(metres_from(s, synthetic.PIN_2) <= 5 for s in relocated)
    assert within(relocated[-1].to, 40)
    assert pin[-1].kind == "relocation" and pin[-1].to == at(60)
    rc = track(draft, "Race committee").segments[0]
    assert 140 <= distance_metres(rc.lat, rc.lon, first.lat, first.lon) <= 160

    finish = track(draft, "Finish Pin").segments
    assert finish[0].kind == "stable" and metres_from(finish[0], synthetic.FINISH_0) <= 3
    takeover = stable_after(draft, "Finish Pin", finish[0].to)[0]
    assert at(12.5) <= takeover.from_ <= at(13.5)
    assert distance_metres(takeover.lat, takeover.lon, first.lat, first.lon) <= 5
    assert within(takeover.to, 53)


def test_roaming_change_mark_is_stable_only_during_its_hold(draft):
    for label in ("Change Mark", "Spare 2"):
        stable = [s for s in track(draft, label).segments if s.kind == "stable"]
        assert len(stable) == 1
        assert at(24.5) <= stable[0].from_ <= at(25.5)
        assert at(28) <= stable[0].to <= at(29)


def test_duplicate_and_never_moved_trackers_are_flagged(draft):
    ids = {t.label: t.track_id for t in draft.tracks}
    duplicates = {t.label: t.duplicate_of for t in draft.tracks if t.duplicate_of}
    assert duplicates == {"Spare 1": ids["Start Pin"], "Spare 2": ids["Change Mark"]}
    assert [t.label for t in draft.tracks if t.stationary] == ["SPARE"]
    spare = track(draft, "SPARE").segments
    assert len(spare) == 1 and metres_from(spare[0], synthetic.BASE) <= 1


def test_synthetic_duplicates_carry_realistic_noise(parsed):
    samples = {t.name: t.samples for t in parsed.tracks}
    for copy, original in (("Spare 1", "Start Pin"), ("Spare 2", "Change Mark")):
        by_time = {s.utc_ns: s for s in samples[original]}
        distances = sorted(
            distance_metres(s.lat, s.lon, by_time[s.utc_ns].lat, by_time[s.utc_ns].lon)
            for s in samples[copy] if s.utc_ns in by_time
        )
        assert 2 <= distances[len(distances) // 2] <= 3
        assert 8 <= distances[-1] <= STABLE_MAX_DISPERSION_METRES


# --- Role suggestions (provider-specific table) ---------------------------------


@pytest.mark.parametrize(
    ("name", "role", "gate"),
    [
        ("Race committee", "committee_boat", None),
        ("RC", "committee_boat", None),
        ("Start Pin", "start_pin", None),
        ("Finish Pin", "finish_pin", None),
        ("Buoy M1", "gate", "M"),
        ("buoy  m2", "gate", "M"),
        ("Buoy W1", "gate", "W"),
        ("Gate A", "gate", "Gate"),
        ("Gate B", "gate", "Gate"),
        ("Change Mark", "change_mark", None),
        ("Windward Mark", "mark", None),
        ("Spare 1", "ignored", None),
        ("SPARE", "ignored", None),
    ],
)
def test_georacing_name_table_suggests_d5_roles(name, role, gate):
    suggestion = suggest_role(name)
    assert (suggestion.role, suggestion.gate, suggestion.basis) == (role, gate, "name_table")
    assert suggestion.role in ROLE_VOCABULARY


def test_unrecognized_names_are_suggested_ignored_not_invented():
    assert suggest_role("Photo boat").role == "ignored"
    assert suggest_role("Photo boat").basis == "unrecognized_name"


def test_draft_proposes_a_reviewable_course(draft):
    course = draft.suggested_course
    assert course.course_id is None and course.race.gun_utc is None
    assert course.race.label == "Synthetic Race 7"
    assert course.source.kind == "georacing_elements_gpx"
    assert {(e.label, e.role, e.gate) for e in course.elements} == {
        ("Buoy W1", "gate", "W"), ("Buoy W2", "gate", "W"),
        ("Gate A", "gate", "Gate"), ("Gate B", "gate", "Gate"),
        ("Change Mark", "change_mark", None), ("Finish Pin", "finish_pin", None),
        ("Race committee", "committee_boat", None), ("Start Pin", "start_pin", None),
    }
    assert {(i.label, i.reason) for i in course.ignored_tracks} == {
        ("Spare 1", "duplicate_of:start_pin"),
        ("Spare 2", "duplicate_of:change_mark"),
        ("SPARE", "never_moved"),
    }
    assert (course.start_line.boat, course.start_line.pin) == ("race_committee", "start_pin")
    assert (course.finish_line.boat, course.finish_line.pin) == ("race_committee", "finish_pin")
    assert course.time_range.from_ == at(0)
    assert course.time_range.to == at(60)


def test_utc_from_ns_is_exact_to_the_microsecond():
    assert utc_from_ns(1_234_567_891_000) == datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(
        seconds=1234, microseconds=567_891
    )


# --- Schema v1 validation -------------------------------------------------------


def reviewed(draft, **race):
    payload = draft.suggested_course.model_dump(mode="json", by_alias=True)
    payload["race"].update(race)
    return payload


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda c: c["race"].update(gun_utc="2031-03-14T10:05:00Z"), "gun_source"),
        (lambda c: c["race"].update(gun_source="admin_entered"), "gun_source"),
        (lambda c: c["race"].update(gun_utc="2031-03-14T10:05:00Z", gun_source="suggested"), "admin_entered"),
        (lambda c: c["race"].update(gun_utc="2031-03-14T09:00:00Z", gun_source="admin_entered"),
         "within time_range"),
        (lambda c: c["race"].update(gun_utc="2031-03-14T10:05:00Z", gun_source="admin_entered",
                                    end_utc="2031-03-14T10:04:00Z"), "after gun_utc"),
        (lambda c: c["race"].update(gun_utc="2031-03-14T10:05:00", gun_source="admin_entered"),
         "timezone"),
        (lambda c: c["start_line"].update(pin="finish_pin"), "must reference a 'start_pin'"),
        (lambda c: c["finish_line"].update(boat="buoy_w1"), "must reference a 'committee_boat'"),
        (lambda c: c["start_line"].update(boat="nowhere"), "unknown element"),
        (lambda c: c["elements"][0].update(gate=None), "gate id is required"),
        (lambda c: c["elements"][0].update(role="ignored"), "Input should be"),
        (lambda c: c["elements"].append(dict(c["elements"][0])), "duplicated"),
        (lambda c: c["elements"][0]["positions"].append(dict(c["elements"][0]["positions"][0])),
         "without overlap"),
        (lambda c: c["elements"][0]["positions"][0].update(**{"from": "2031-03-14T09:00:00Z"}),
         "within time_range"),
        (lambda c: c["elements"][0]["positions"][0].update(lat=95), "less than or equal"),
        (lambda c: c["elements"][0].update(positions=[]), "at least 1"),
        (lambda c: c.update(schema_version=2), "Input should be 1"),
        (lambda c: c.update(unexpected=True), "Extra inputs"),
        (lambda c: c["source"].update(kind="sailmon_csv"), "georacing_elements_gpx"),
    ],
)
def test_schema_rejects_invalid_reviewed_courses(draft, mutate, message):
    payload = reviewed(draft)
    mutate(payload)
    with pytest.raises(ValidationError, match=message):
        ReviewedCourse.model_validate(payload)


def test_admin_edits_split_trim_delete_and_ignore_remain_valid(draft):
    payload = reviewed(draft, gun_utc="2031-03-14T10:05:00Z", gun_source="admin_entered")
    m1 = next(e for e in payload["elements"] if e["id"] == "buoy_w1")
    first = m1["positions"][0]
    # Split the first interval, trim the last and delete the rest.
    m1["positions"] = [
        {**first, "to": "2031-03-14T10:05:00Z"},
        {**first, "from": "2031-03-14T10:05:00Z", "to": "2031-03-14T10:10:00Z"},
    ]
    change = next(e for e in payload["elements"] if e["role"] == "change_mark")
    payload["elements"].remove(change)
    payload["ignored_tracks"].append({"label": change["label"], "reason": "admin_ignored"})
    assert ReviewedCourse.model_validate(payload).elements


# --- Admin API ------------------------------------------------------------------


def call(method, path, *, body=b"", query=None, key=KEY, content_type="application/gpx+xml",
         declared="actual", chunks=None):
    headers = [(b"content-type", content_type.encode())]
    if key is not None:
        headers.append((b"x-tackbar-admin-key", key.encode()))
    if declared is not None:
        headers.append((b"content-length", str(len(body) if declared == "actual" else declared).encode()))
    pieces = iter(chunks if chunks is not None else [body])
    messages, reads = [], []

    async def run():
        async def receive():
            reads.append(True)
            try:
                return {"type": "http.request", "body": next(pieces), "more_body": True}
            except StopIteration:
                return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            messages.append(message)

        query_string = urlencode(query or {}, doseq=True)
        await asyncio.wait_for(app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
            "query_string": query_string.encode(), "headers": headers,
            "client": ("test", 1), "server": ("test", 80), "root_path": "",
        }, receive, send), timeout=30)

    asyncio.run(run())
    start = next(m for m in messages if m["type"] == "http.response.start")
    content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], json.loads(content), len(reads)


DRAFT = "/api/admin/course-imports/georacing/draft"
VALIDATE = "/api/admin/course-imports/validate"


def tree(root: Path) -> dict:
    return {
        str(p.relative_to(root)): p.read_bytes()
        for p in sorted(root.rglob("*")) if p.is_file()
    }


@pytest.fixture
def admin(runtime, monkeypatch):  # noqa: F811
    monkeypatch.setenv("TACKBAR_ADMIN_KEY", KEY)
    return runtime


def test_draft_and_validate_create_no_ingestion_activity_sailor_or_session(admin, elements_bytes):
    before = tree(admin.root)
    status, draft_json, _ = call(
        "POST", DRAFT, body=elements_bytes, query={"filename": FILENAME}
    )
    assert status == 200
    assert draft_json["provider"] == "georacing_elements_gpx"
    assert [t["label"] for t in draft_json["tracks"]] == NAMES
    assert draft_json["parameters"] == {
        "max_dispersion_m": 15.0, "min_duration_s": 120.0, "max_sample_gap_s": 120.0,
    }
    assert draft_json["tracks"][0]["segments"][0]["from"] == "2031-03-14T10:00:00Z"
    assert draft_json["source"]["filename"] == FILENAME
    assert draft_json["source"]["sha256"] == hashlib.sha256(elements_bytes).hexdigest()

    course = draft_json["suggested_course"]
    course["race"].update(gun_utc="2031-03-14T10:05:00Z", gun_source="admin_entered")
    status, validated, _ = call(
        "POST", VALIDATE, body=json.dumps(course).encode(), content_type="application/json"
    )
    assert status == 200
    result = validated["course"]
    CourseContextV1.model_validate(result)
    assert result["schema_version"] == 1 and result["course_id"]
    assert result["race"] == {
        "label": "Synthetic Race 7", "gun_utc": "2031-03-14T10:05:00Z",
        "gun_source": "admin_entered", "end_utc": None,
    }
    assert list(result) == [
        "schema_version", "course_id", "source", "race", "time_range",
        "start_line", "finish_line", "elements", "ignored_tracks",
    ]
    assert "from" in result["elements"][0]["positions"][0]

    # Stateless and side-effect free: no Ingestion, Activity, Sailor or Session change.
    assert tree(admin.root) == before
    assert admin.history.records() == []
    assert admin.activities.all() == []
    assert admin.sessions.all() == []
    assert [s.id for s in admin.sailors.all()] == [admin.sailor.id]


def test_validate_keeps_a_supplied_course_id_and_reports_errors(admin, draft):
    payload = reviewed(draft)
    payload["course_id"] = "6f1c2f0e-8a8e-4c3e-9a55-0d3f3b1c9e01"
    status, body, _ = call("POST", VALIDATE, body=json.dumps(payload).encode(),
                           content_type="application/json")
    assert status == 200 and body["course"]["course_id"] == payload["course_id"]
    payload["start_line"]["pin"] = "finish_pin"
    status, body, _ = call("POST", VALIDATE, body=json.dumps(payload).encode(),
                           content_type="application/json")
    assert status == 422
    assert "must reference a 'start_pin' element" in json.dumps(body["detail"])


@pytest.mark.parametrize("path", [DRAFT, VALIDATE])
@pytest.mark.parametrize("key", [None, "wrong"])
def test_course_import_requires_admin_authorization_before_reading_the_body(admin, path, key):
    large = b"{" + b" " * (4 * MAX_VALIDATE_BODY_BYTES)
    status, _, reads = call("POST", path, body=large, query={"filename": "c.gpx"}, key=key,
                            content_type="application/json")
    assert status == 401 and reads == 0


def test_course_import_fails_closed_without_admin_configuration(admin, monkeypatch):
    monkeypatch.delenv("TACKBAR_ADMIN_KEY")
    status, _, reads = call("POST", DRAFT, body=b"<gpx/>", query={"filename": "c.gpx"})
    assert status == 503 and reads == 0


def test_draft_rejects_multipart_oversized_and_ambiguous_requests(admin):
    status, _, _ = call("POST", DRAFT, body=b"x", query={"filename": "c.gpx"},
                        content_type="multipart/form-data; boundary=x")
    assert status == 415
    status, _, reads = call("POST", DRAFT, body=b"x", query={"filename": "c.gpx"},
                            declared=str(MAX_GPX_BYTES + 1))
    assert status == 413 and reads == 0
    chunk = b" " * (1024 * 1024)
    status, _, _ = call("POST", DRAFT, query={"filename": "c.gpx"}, declared=None,
                        chunks=[chunk] * 17)
    assert status == 413
    status, _, _ = call("POST", DRAFT, body=b"x", query={"filename": ["a.gpx", "b.gpx"]})
    assert status == 400
    status, _, _ = call("POST", DRAFT, body=b"x")
    assert status == 422


def test_draft_returns_controlled_parse_errors_without_private_content(admin):
    secret = "Secret-Coordinates-42"
    content = elements_gpx(tracks=[_trk(secret, TWO, times=["2031-06-15T08:00:00", "x"])])
    status, body, _ = call("POST", DRAFT, body=content, query={"filename": "c.gpx"})
    assert status == 422
    assert body == {"detail": "Course element track 1 requires timezone-aware timestamps"}
    assert secret not in json.dumps(body)


def test_validate_caps_the_raw_json_body_before_parsing(admin, draft):
    status, body, reads = call("POST", VALIDATE, body=b"{}", content_type="application/json",
                               declared=str(MAX_VALIDATE_BODY_BYTES + 1))
    assert (status, body, reads) == (413, {"detail": "Request body exceeds 1 MiB"}, 0)
    chunk = b" " * (256 * 1024)
    status, body, _ = call("POST", VALIDATE, declared=None, content_type="application/json",
                           chunks=[b"{"] + [chunk] * 5)
    assert (status, body) == (413, {"detail": "Request body exceeds 1 MiB"})
    status, body, _ = call("POST", VALIDATE, body=b"{not json", content_type="application/json")
    assert (status, body) == (422, {"detail": "Request body must be valid JSON"})
    # A valid payload just under the cap (JSON whitespace padding) is unchanged.
    payload = json.dumps(reviewed(draft)).encode()
    padded = payload + b" " * (MAX_VALIDATE_BODY_BYTES - len(payload))
    status, body, _ = call("POST", VALIDATE, body=padded, content_type="application/json")
    assert status == 200 and body["course"]["race"]["label"] == "Synthetic Race 7"


def test_validate_errors_keep_the_request_validation_shape(admin, draft):
    payload = reviewed(draft)
    payload["elements"][0]["role"] = "ignored"
    status, body, _ = call("POST", VALIDATE, body=json.dumps(payload).encode(),
                           content_type="application/json")
    assert status == 422
    assert body["detail"][0]["loc"][:3] == ["body", "elements", 0]


# --- Opt-in real GeoRacing export (never committed) ------------------------------


@pytest.mark.skipif(
    not os.environ.get(REAL_FILE_VARIABLE)
    or not os.access(os.environ[REAL_FILE_VARIABLE], os.R_OK),
    reason=f"set {REAL_FILE_VARIABLE} to a local GeoRacing elements GPX to run",
)
def test_real_georacing_export_matches_observed_values():
    path = Path(os.environ[REAL_FILE_VARIABLE])
    real = build_course_draft(
        parse_georacing_elements(path.read_bytes(), path.name),
        sha256="0" * 64,
        imported_at=datetime(2026, 11, 26, tzinfo=timezone.utc),
    )

    def utc(hhmmss):
        return datetime.fromisoformat(f"2026-11-19T{hhmmss}+00:00")

    for label, end in (
        ("Buoy M1", "19:46:48"), ("Buoy M2", "19:48:28"),
        ("Gate B", "19:33:00"), ("Gate A", "19:36:24"),
    ):
        assert initial_stable_end(real, label) == utc(end), label
    relocation = next(s for s in track(real, "Start Pin").segments if s.kind == "relocation")
    assert abs((relocation.from_ - utc("19:18:50")).total_seconds()) <= 10
    ids = {t.label: t.track_id for t in real.tracks}
    assert {t.label: t.duplicate_of for t in real.tracks if t.duplicate_of} == {
        "Spare 1": ids["Start Pin"], "Spare 2": ids["Change Mark"],
    }
    assert [t.label for t in real.tracks if t.stationary] == ["SPARE"]
