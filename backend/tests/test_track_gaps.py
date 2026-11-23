"""Issue #218.1: canonical gap summary, persistence, Reprocess, backfill and API fields."""

from dataclasses import replace
import json
from pathlib import Path
import shutil

import pandas as pd
import pytest

from app.models import InboundEmail, TrackGap, TrackGapSummary
from app.normalization.track_gaps import summarize_track_gaps
from app.parsers.gpx import parse_gpx
from app.parsers.vakaros_csv import parse_vakaros_csv
from app.repositories.activities import ActivityRepository
from app.services.activity_reprocessing import reprocess_activity
from app.services.activity_tracks import persist_activity_track
from app.services.ingestion_processing import process_provider_email
from app.services.personal_context import PersonalContextService
from app.storage.track_storage import TrackStorage
from app.track_gap_backfill import backfill_track_gaps, format_summary

from test_gpx import QUALITY_REJECTIONS, SECOND_NS, gpx_from_gaps_ns, one_hertz_with_gaps_ns
from test_manual_ingestion import accept, process, runtime  # noqa: F401 (fixture)


SAILOR_ID = "30000000-0000-4000-8000-000000000001"
VAKAROS_FIXTURE = Path(__file__).parent / "fixtures" / "vakaros-demo.csv.gz"
GAP_64 = gpx_from_gaps_ns(one_hertz_with_gaps_ns(64 * SECOND_NS, ones=3372))
CLEAN = TrackGapSummary(count=0, total_seconds=0.0)


def _vakaros_with_gap(seconds=30.5):
    """Vakaros-like parsed track whose canonical UTC has one interval > 10 s."""
    parsed = parse_vakaros_csv(VAKAROS_FIXTURE)
    middle = len(parsed.samples) // 2
    shift = pd.Timedelta(seconds=seconds)
    parsed.samples = [
        {**sample, "utc": pd.Timestamp(sample["utc"]) + shift} if index >= middle else sample
        for index, sample in enumerate(parsed.samples)
    ]
    return parsed, middle


def _persist(root, parsed, content):
    repository = ActivityRepository(root / "activities.json")
    stored, _ = repository.find_or_create(SAILOR_ID, None, parsed, content)
    return repository, persist_activity_track(stored, parsed, content, repository, TrackStorage(root))


def test_summary_uses_strictly_greater_than_ten_seconds_and_real_endpoints():
    utc = ["2031-06-15T08:00:00Z", "2031-06-15T08:00:10Z", "2031-06-15T08:00:20.000000001Z",
           "2031-06-15T08:00:21Z", "2031-06-15T08:01:25Z"]
    assert summarize_track_gaps(utc[:2]) == CLEAN
    assert summarize_track_gaps(utc) == TrackGapSummary(
        count=2, total_seconds=74.000000001,
        intervals=(TrackGap(utc[1], utc[2]), TrackGap(utc[3], utc[4])),
    )


def test_gpx_ingestion_persists_summary_and_keeps_consecutive_dist(temporary_directory):
    parsed = parse_gpx(GAP_64, "track.gpx")
    repository, stored = _persist(temporary_directory, parsed, GAP_64)
    assert (stored.gap_summary.count, stored.gap_summary.total_seconds) == (1, 64.0)
    gap = stored.gap_summary.intervals[0]
    track = TrackStorage(temporary_directory).read_normalized_track(stored.id)
    after = track.index[track.utc == gap.end][0]
    assert track.utc[after - 1] == gap.start
    # Canonical dist still holds the consecutive cross-gap chord (Viewer exclusion is later).
    assert track.dist[after] == pytest.approx(1.11)
    assert repository.get_by_id(stored.id).gap_summary == stored.gap_summary


def test_vakaros_like_canonical_track_gets_the_same_summary_and_activity_reprocess(temporary_directory):
    parsed, middle = _vakaros_with_gap()
    _, stored = _persist(temporary_directory, parsed, b"synthetic vakaros-like bytes")
    elapsed = parsed.samples[middle]["utc"] - parsed.samples[middle - 1]["utc"]
    assert stored.gap_summary.count == 1
    assert stored.gap_summary.total_seconds == pytest.approx(elapsed.total_seconds())
    # Explicit Activity Reprocess rebuilds the canonical track and its summary.
    content = VAKAROS_FIXTURE.read_bytes()
    repository, clean = _persist(temporary_directory, parse_vakaros_csv(VAKAROS_FIXTURE), content)
    assert clean.gap_summary == CLEAN
    repository.set_gap_summary(clean.id, stored.gap_summary)
    assert reprocess_activity(clean.id, repository, TrackStorage(temporary_directory)).gap_summary == CLEAN


def test_legacy_records_load_without_summary_and_stay_byte_compatible(temporary_directory):
    path = temporary_directory / "activities.json"
    repository = ActivityRepository(path)
    stored, _ = repository.find_or_create(SAILOR_ID, None, parse_gpx(GAP_64, "track.gpx"), GAP_64)
    record = json.loads(path.read_text(encoding="utf-8"))[0]
    assert stored.gap_summary is None and "gap_summary" not in record
    repository.update_context_for_sailor(SAILOR_ID, stored.id, boat_id=None, device_label="Label")
    assert "gap_summary" not in json.loads(path.read_text(encoding="utf-8"))[0]
    summary = summarize_track_gaps(["2031-06-15T08:00:00Z", "2031-06-15T08:01:00Z"])
    repository.set_gap_summary(stored.id, summary)
    saved = path.read_bytes()
    assert ActivityRepository(path).get_by_id(stored.id).gap_summary == summary
    repository.set_gap_summary(stored.id, summary)
    assert path.read_bytes() == saved


@pytest.mark.parametrize("value", [
    "bad", {"count": 2, "total_seconds": 64.0, "intervals": [{"start": "a", "end": "b"}]},
    {"count": 0, "total_seconds": 1.0, "intervals": []},
])
def test_inconsistent_persisted_summary_is_rejected(temporary_directory, value):
    path = temporary_directory / "activities.json"
    repository = ActivityRepository(path)
    repository.find_or_create(SAILOR_ID, None, parse_gpx(GAP_64, "track.gpx"), GAP_64)
    records = json.loads(path.read_text(encoding="utf-8"))
    records[0]["gap_summary"] = value
    path.write_text(json.dumps(records), encoding="utf-8")
    with pytest.raises(ValueError, match="gap_summary"):
        repository.all()


def test_manual_ingestion_and_reprocess_persist_summary(runtime):  # noqa: F811
    processed = process(runtime, accept(runtime, GAP_64))
    assert processed["status"] == "processed"
    activity = runtime.activities.get_by_id(processed["activity_id"])
    assert (activity.gap_summary.count, activity.gap_summary.total_seconds) == (1, 64.0)
    # A legacy Activity without a summary receives it on Reprocess from its stored track.
    records = json.loads(runtime.activities.path.read_text(encoding="utf-8"))
    del records[0]["gap_summary"]
    runtime.activities.path.write_text(json.dumps(records), encoding="utf-8")
    assert process(runtime, processed, reprocess=True)["status"] == "processed"
    assert runtime.activities.get_by_id(activity.id).gap_summary == activity.gap_summary


def test_email_intake_shares_admission_summary_and_safe_feedback(runtime):  # noqa: F811
    def email(message_id, content):
        return process_provider_email("ovh", InboundEmail(
            sender_email="selected@example.test", subject="track", attachment_filename="track.gpx",
            attachment_bytes=content, provider_message_id=f"1:{message_id}",
        ), runtime.sailors, runtime.boats, runtime.activities, runtime.sessions, runtime.history)

    activity = email(1, GAP_64).activity
    assert (activity.gap_summary.count, activity.gap_summary.total_seconds) == (1, 64.0)
    content, error = QUALITY_REJECTIONS[2]
    with pytest.raises(ValueError, match="longest exceptional gap"):
        email(2, content)
    record = runtime.history.find_provider_message("ovh", "1:2")
    assert record["last_error"] == error
    assert record["technical_notice_feedback"] == {
        "category": "quality", "metrics": {"longest exceptional gap": "90.000000001"},
    }


def test_personal_activity_response_exposes_count_and_total(temporary_directory):
    _, stored = _persist(temporary_directory, parse_gpx(GAP_64, "track.gpx"), GAP_64)
    response = PersonalContextService._activity_response(stored, None, SAILOR_ID)
    assert (response.gap_count, response.gap_total_seconds) == (1, 64.0)
    clean = PersonalContextService._activity_response(replace(stored, gap_summary=CLEAN), None, SAILOR_ID)
    assert (clean.gap_count, clean.gap_total_seconds) == (0, 0.0)
    legacy = PersonalContextService._activity_response(replace(stored, gap_summary=None), None, SAILOR_ID)
    assert (legacy.gap_count, legacy.gap_total_seconds) == (None, None)


def test_backfill_uses_stored_tracks_only_and_is_idempotent(temporary_directory):
    root = temporary_directory
    _persist(root, parse_gpx(GAP_64, "track.gpx"), GAP_64)
    _persist(root, parse_vakaros_csv(VAKAROS_FIXTURE), VAKAROS_FIXTURE.read_bytes())
    _, missing = _persist(root, _vakaros_with_gap()[0], b"track later lost")
    TrackStorage(root).track_path(missing.id).unlink()
    shutil.rmtree(root / "originals")  # No source re-parsing is possible or needed.
    path = root / "activities.json"
    expected = json.loads(path.read_text(encoding="utf-8"))
    legacy = [{key: value for key, value in record.items() if key != "gap_summary"} for record in expected]
    path.write_text(json.dumps(legacy, indent=2) + "\n", encoding="utf-8")

    dry_run = backfill_track_gaps(root)
    assert json.loads(path.read_text(encoding="utf-8")) == legacy
    assert (dry_run.activities, dry_run.updated, dry_run.unchanged, dry_run.with_gaps, dry_run.unavailable_tracks) == (3, 2, 0, 1, 1)
    assert "Dry-run" in format_summary(dry_run)

    applied = backfill_track_gaps(root, apply=True)
    assert (applied.updated, applied.unavailable_tracks) == (2, 1)
    records = json.loads(path.read_text(encoding="utf-8"))
    assert records[:2] == expected[:2]  # Only the derived summary changed.
    assert records[2] == legacy[2]
    saved = path.read_bytes()
    rerun = backfill_track_gaps(root, apply=True)
    assert (rerun.updated, rerun.unchanged, rerun.with_gaps) == (0, 2, 1)
    assert path.read_bytes() == saved


def test_backfill_requires_an_explicit_usable_root(temporary_directory):
    for value in ("", "/", temporary_directory / "missing"):
        with pytest.raises(ValueError):
            backfill_track_gaps(value)
