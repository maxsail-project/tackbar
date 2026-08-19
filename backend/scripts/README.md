# TackBar Backend Scripts

These scripts are developer and proof-of-concept utilities for ingestion,
maintenance, and inspection. Run them from the backend directory:

```powershell
cd backend
```

| Script | Purpose | Reads | Writes |
| --- | --- | --- | --- |
| `check_gmail.py` | Process candidate Gmail attachments through the TackBar ingestion flow | Gmail, OAuth files, participant/activity/session/ingestion data | OAuth token, domain JSON data, archived originals, normalized tracks |
| `reprocess_activity.py` | Regenerate one normalized track from its archived original | Activity data and archived original | Normalized track and track-derived Activity metadata |
| `build_tracks_index.py` | Build a human-readable index of persisted tracks | Participant, Activity, Session, and original-file presence | `tmp/tracks-index.csv` only |
| `inspect_vakaros.py` | Inspect the real Vakaros test fixture and parser output | Vakaros fixture | Summary JSON and parser-sample CSV under `tmp/` |

## Safety convention

- **Inspection / derived output:** `build_tracks_index.py` and
  `inspect_vakaros.py`. They write disposable files under `backend/tmp/` and do
  not modify domain data.
- **Data processing / persistence:** `check_gmail.py`. It can create or update
  persistent PoC data and track files.
- **Maintenance / reprocessing:** `reprocess_activity.py`. It replaces a
  generated normalized track and refreshes track-derived Activity metadata.

## `check_gmail.py`

### Purpose

Runs the current real Gmail ingestion PoC:

```text
Gmail
→ InboundEmail
→ Participant
→ Activity
→ normalized track
→ Session
```

It searches up to 10 unread Gmail messages with attachments, then selects
messages whose subject and attachment filename end in `.csv.gz`. Gmail access
uses the read-only scope; the script does not mark messages as read or otherwise
modify Gmail state.

### Usage

```powershell
python scripts/check_gmail.py
```

The first OAuth run may open a local browser authorization flow.

### Reads

- Gmail through the Gmail API.
- `secrets/credentials.json` and, when present, `token.json` for OAuth.
- `data/participants.json`.
- `data/activities.json`.
- `data/sessions.json`.
- `data/ingestion_history.json`.

### Writes / side effects

This script performs persistent data processing. Depending on the messages it
finds, it may create or update:

- `token.json` when OAuth authorization or token refresh is required;
- `data/participants.json`, including minimal participants for new senders;
- `data/activities.json`;
- `data/sessions.json`;
- `data/ingestion_history.json` after complete successful processing;
- `data/originals/<activity_id>/<original_filename>`;
- `data/tracks/<activity_id>.csv.gz`.

Original attachments are archived without being rewritten when identical.
Normalized tracks are generated when missing. Existing message and Activity
deduplication rules still apply.

### Expected output

For each processed email, the script prints Participant, Activity, track, and
Session identifiers and status. It reports already processed messages, rejected
attachments, and the case where no matching Gmail messages are found. It does
not print track samples.

### Typical use

Run it when manually exercising the live Gmail-to-Session PoC or checking that
new Gmail attachments are ingested successfully.

## `reprocess_activity.py`

### Purpose

Regenerates the canonical normalized track for one existing Activity using its
archived original. Gmail and ingestion history are not involved.

The Activity UUID remains stable. The script verifies the archived original
against the Activity attachment SHA-256, reparses the current Vakaros source,
and refreshes track-derived metadata such as timestamps, coordinates, spatial
summary, sample count, and `track_file`.

### Usage

```powershell
python scripts/reprocess_activity.py <activity_id>
```

### Reads

- `data/activities.json` for the requested Activity.
- `data/originals/<activity_id>/<original_filename>`.

Only Activities whose current source is `vakaros` can be reprocessed.

### Writes / side effects

- Replaces or recreates `data/tracks/<activity_id>.csv.gz`.
- Updates the existing record in `data/activities.json` with refreshed
  track-derived metadata.

It does not create another Activity, change the Activity UUID, rebuild Session
matching, or modify `data/sessions.json`.

### Expected output

On success, it prints the reprocessed Activity UUID and normalized track path.
It exits with a clear error if the Activity or archived original is missing,
the original hash differs, or the Activity source is unsupported.

### Typical use

Run it after normalized-track logic changes, or when an Activity's generated
track is missing and must be restored from the archived source.

## `build_tracks_index.py`

### Purpose

Builds a human-readable CSV index relating Activities to participants, boat
metadata, Sessions, normalized tracks, and existing archived originals. The
index is derived, disposable, and can be regenerated at any time.

### Usage

```powershell
python scripts/build_tracks_index.py
```

### Reads

- `data/participants.json`.
- `data/activities.json`.
- `data/sessions.json`.
- The existence of expected files under `data/originals/`.

It does not read track samples or ingestion history.

### Writes / side effects

- Creates or overwrites `tmp/tracks-index.csv`.

It does not modify domain JSON, normalized tracks, or archived originals. If an
Activity is unexpectedly referenced by multiple Sessions, generation fails
instead of choosing one Session silently.

### Expected output

The command prints the output path plus counts of Activities and referenced
Sessions and participants. The CSV contains one row per Activity, ordered newest
first. Missing optional metadata or files are represented by empty CSV values.

### Typical use

Run it when manually locating tracks by participant, date, boat, or Session, or
when reviewing which generated and archived files currently exist.

## `inspect_vakaros.py`

### Purpose

Parses the repository's real Vakaros fixture and exports a readable Activity
summary and parser-sample CSV for development inspection.

The produced CSV reflects the parser's sample fields. It is not the canonical
stored TackBar track under `data/tracks/`; for example, it does not add the
Activity UUID or derived `dist` column.

### Usage

```powershell
python scripts/inspect_vakaros.py
```

### Reads

- `tests/fixtures/VK-Maxi-URU 10-8-2026.csv.gz`.

### Writes / side effects

- Creates or overwrites `tmp/activity-summary.json`.
- Creates or overwrites `tmp/activity-normalized.csv`.

It does not modify participants, Activities, Sessions, ingestion history,
archived originals, or canonical normalized tracks.

### Expected output

The command prints both generated paths. The JSON contains Activity metadata and
sample-column information; the CSV contains the parsed samples. It raises an
error if the real fixture is missing or invalid.

### Typical use

Run it while validating the Vakaros parser or inspecting the real fixture
without invoking Gmail ingestion or persistent domain processing.

## Runtime paths

- `backend/data/` contains persistent PoC JSON state.
- `backend/data/tracks/` contains generated canonical normalized tracks.
- `backend/data/originals/` contains archived source attachments.
- `backend/tmp/` contains disposable generated inspection output.

Deleting files under `backend/tmp/` does not affect TackBar runtime behavior.
Files under `backend/data/` are persistent state and should be treated
accordingly.
