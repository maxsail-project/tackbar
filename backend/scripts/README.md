# TackBar Backend Scripts

These scripts are developer and proof-of-concept utilities for ingestion,
maintenance, migration, and inspection. Run them from the backend directory:

```powershell
cd backend
```

| Script | Purpose | Reads | Writes |
| --- | --- | --- | --- |
| `reprocess_activity.py` | Regenerate one normalized track from its archived original | Activity data and archived original | Normalized track and track-derived Activity metadata |
| `migrate_sailor_boat.py` | Migrate an explicitly selected legacy Participant data root to Sailor/Boat | Legacy Participant and Activity JSON | Sailor/Boat JSON, migrated Activity JSON, explicit legacy backups |
| `build_tracks_index.py` | Build a human-readable index of persisted tracks | Sailor, optional Boat, Activity, Session, and original-file presence | `tmp/tracks-index.csv` only |
| `inspect_vakaros.py` | Inspect the public demo Vakaros fixture and parser output | Demo Vakaros fixture | Summary JSON and parser-sample CSV under `tmp/` |

## Safety convention

- **Inspection / derived output:** `build_tracks_index.py` and
  `inspect_vakaros.py`. They write disposable files under `backend/tmp/` and do
  not modify domain data.
- **Maintenance / reprocessing:** `reprocess_activity.py`. It replaces a
  generated normalized track and refreshes track-derived Activity metadata.
- **One-time migration:** `migrate_sailor_boat.py`. It rewrites an explicitly
  selected legacy data root after validation and preserves explicit legacy
  backups.

## `reprocess_activity.py`

### Purpose

Regenerates the canonical normalized track for one existing Activity using its
archived original. Mailbox acquisition and ingestion history are not involved.

The Activity UUID, Sailor reference, Boat context, and attachment SHA-256
remain stable. The script verifies the archived original against the Activity
attachment SHA-256, reparses the current Vakaros source, and refreshes
track-derived metadata such as timestamps, coordinates, spatial summary,
sample count, and `track_file`.

### Usage

```powershell
python scripts/reprocess_activity.py <activity_id>
```

### Reads

- `<runtime-root>/activities.json` for the requested Activity.
- `<runtime-root>/originals/<activity_id>/<original_filename>`.

Only Activities whose current source is `vakaros` can be reprocessed.

### Writes / side effects

- Replaces or recreates `<runtime-root>/tracks/<activity_id>.csv.gz`.
- Updates the existing record in `<runtime-root>/activities.json` with
  refreshed track-derived metadata.

It does not create another Activity, change the Activity UUID, re-resolve the
Sailor or Boat, rebuild Session matching, or modify
`<runtime-root>/sessions.json`.

### Expected output

On success, it prints the reprocessed Activity UUID and normalized track path.
It exits with a clear error if the Activity or archived original is missing,
the original hash differs, or the Activity source is unsupported.

### Typical use

Run it after normalized-track logic changes, or when an Activity's generated
track is missing and must be restored from the archived source.

## `migrate_sailor_boat.py`

### Purpose

Performs the explicit one-time migration from legacy Participant persistence to
the current Sailor, Boat, and Activity references. It operates only on the data
root supplied by the operator and refuses to overwrite a root where
`sailors.json` or `boats.json` already exists.

The required legacy Boat policy is:

- `assign`: creates a default Boat from non-empty legacy Participant Boat
  metadata and assigns that Boat to the Participant's legacy Activities. This
  preserves the previous TackBar interpretation as a compatibility migration;
  it is not independently verified historical Boat usage.
- `unknown`: may create the same default Boat, but leaves historical
  `Activity.boat_id` values null.

### Usage

```powershell
python scripts/migrate_sailor_boat.py --data-dir <path> --legacy-boat-policy assign
```

Or, to keep historical Activity Boat context unknown:

```powershell
python scripts/migrate_sailor_boat.py --data-dir <path> --legacy-boat-policy unknown
```

Both arguments are mandatory. The script never silently chooses the active
runtime root or a legacy Boat policy.

### Reads

- `<path>/participants.json` as legacy migration input.
- `<path>/activities.json` as legacy migration input.

It validates the complete legacy Participant/Activity relationship before
writing. It does not read private data unless the operator explicitly supplies
that data root.

### Writes / side effects

- Creates `<path>/sailors.json`.
- Creates `<path>/boats.json`.
- Replaces `<path>/activities.json` with Sailor/Boat references.
- Renames the legacy metadata to `<path>/participants.legacy.json` and
  `<path>/activities.legacy.json`.

The migration preserves Activity IDs and does not modify Session IDs or
membership, normalized tracks, archived originals, or ingestion-history
Activity references. It uses validated temporary sibling files and refuses
existing new-schema files, backups, or temporary migration files rather than
overwriting them.

### Expected output

On success, it prints only migration counts for Sailors, Boats, Activities,
assigned legacy Boat context, and unknown Boat context. Errors are reported
without routinely printing private identities or navigation data.

### Typical use

Run it once, with an explicit policy, when upgrading a selected legacy TackBar
runtime root from Participant persistence to the v0.4 Sailor/Boat model.

## `build_tracks_index.py`

### Purpose

Builds a human-readable CSV index relating:

```text
Activity
→ Sailor
→ optional Boat
→ Session
```

It also includes normalized-track metadata and the presence of archived
originals. The index is derived, disposable, and can be regenerated at any
time.

### Usage

```powershell
python scripts/build_tracks_index.py
```

### Reads

- `<runtime-root>/sailors.json`.
- `<runtime-root>/boats.json`.
- `<runtime-root>/activities.json`.
- `<runtime-root>/sessions.json`.
- The existence of expected files under `<runtime-root>/originals/`.

It does not read track samples or ingestion history.

### Writes / side effects

- Creates or overwrites `tmp/tracks-index.csv`.

It does not modify domain JSON, normalized tracks, or archived originals. If an
Activity is unexpectedly referenced by multiple Sessions, generation fails
instead of choosing one Session silently.

### Expected output

The command prints the output path plus counts of Activities and referenced
Sessions and Sailors. The CSV contains one row per Activity, ordered newest
first. It includes Sailor identity, optional Boat context, and Session ID;
missing optional metadata or files are represented by empty CSV values.

### Typical use

Run it when manually locating tracks by Sailor, date, Boat, or Session, or when
reviewing which generated and archived files currently exist.

## `inspect_vakaros.py`

### Purpose

Parses the repository's public demo Vakaros fixture and exports a readable
Activity summary and parser-sample CSV for development inspection.

The produced CSV reflects the parser's sample fields. It is not the canonical
stored TackBar track under `<runtime-root>/tracks/`; for example, it does not
add the Activity UUID or derived `dist` column.

### Usage

```powershell
python scripts/inspect_vakaros.py
```

### Reads

- `tests/fixtures/vakaros-demo.csv.gz`.

### Writes / side effects

- Creates or overwrites `tmp/activity-summary.json`.
- Creates or overwrites `tmp/activity-normalized.csv`.

It does not modify Sailors, Boats, Activities, Sessions, ingestion history,
archived originals, or canonical normalized tracks.

### Expected output

The command prints both generated paths. The JSON contains Activity metadata
and sample-column information; the CSV contains parsed samples. It raises an
error if the public demo fixture is missing or invalid.

### Typical use

Run it while validating the Vakaros parser or inspecting the demo fixture
without invoking mailbox ingestion or persistent domain processing.

## Runtime paths

The active runtime data root is selected through TackBar runtime configuration:

- when `TACKBAR_DATA_DIR` is set, repositories use that configured path;
- when it is not set, repositories use the public sanitized
  `backend/test-data/` root;
- live mailbox ingestion requires `TACKBAR_DATA_DIR` to point to a private root
  outside the repository.

Each current v0.4 runtime root contains:

```text
sailors.json
boats.json
activities.json
sessions.json
ingestion_history.json
tracks/
originals/
```

Legacy `participants.json` is migration input only; normal v0.4 runtime code
does not use it.

`backend/tmp/` contains disposable generated inspection/index output and is not
part of persistent domain state. Deleting files there does not affect TackBar
runtime behavior. Files beneath the selected runtime root are persistent state
and should be treated accordingly.
