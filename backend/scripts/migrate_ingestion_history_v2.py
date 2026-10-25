"""Explicit, versioned ingestion identity migration. Never run at application startup."""

import argparse
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ingestion_history import ADMIN_UPLOAD, _canonical  # noqa: E402
from app.services.ingestion_lock import ingestion_lock  # noqa: E402
from app.services.mail_receipts import atomic_bytes, read_receipts, receipt_path, write_receipts  # noqa: E402

MIGRATION_VERSION = 2


def _read_history(path: Path) -> tuple[bytes, list[dict]]:
    raw = path.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, list) or any(not isinstance(record, dict) for record in data):
        raise ValueError("Ingestion history must be a JSON list")
    return raw, data


def _plan(history_path: Path, *, assign_ids: bool, allow_missing_history: bool = False) -> tuple[bytes, list[dict], list[dict], dict]:
    raw, source = (b"", []) if allow_missing_history and not history_path.exists() else _read_history(history_path)
    current_receipts = read_receipts(receipt_path(history_path))
    ids, identities, reservations = set(), set(), set()
    records, groups = [], {}
    missing_ids = 0
    for item in source:
        record, _ = _canonical(item, assign_id=False)
        if record["id"] is None:
            missing_ids += 1
            if assign_ids:
                record["id"] = str(uuid4())
        elif record["id"] in ids:
            raise ValueError("Duplicate ingestion ID")
        if record["id"] is not None:
            ids.add(record["id"])
        reservation = record["pending_onboarding_reservation"]
        if reservation is not None:
            key = (reservation["sailor_id"], reservation["consent_cycle_sequence"])
            if key in reservations:
                raise ValueError("Consent cycle has multiple onboarding reservations")
            reservations.add(key)
        if record["provider"] != ADMIN_UPLOAD:
            key = (record["provider"], record["provider_message_id"])
            if not all(isinstance(part, str) and part for part in key):
                raise ValueError("Malformed mail identity")
            identity = (*key, record["attachment_ordinal"])
            if identity in identities:
                raise ValueError("Duplicate mail attachment identity")
            identities.add(identity)
            groups.setdefault(key, []).append(record)
        records.append(record)
    receipt_index = {(r["provider"], r["provider_message_id"]): r for r in current_receipts}
    if set(receipt_index) - set(groups):
        # A rejected mail has no Ingestion, so its receipt is valid independently.
        for key in set(receipt_index) - set(groups):
            receipt = receipt_index[key]
            if receipt["receipt_state"] != "rejected" and not (
                receipt["receipt_state"] == "incomplete" and not receipt["attachment_ingestion_ids"]
            ):
                raise ValueError("Orphan mail receipt")
    additions = []
    for key, members in groups.items():
        existing = receipt_index.get(key)
        member_ids = [record["id"] for record in sorted(members, key=lambda r: r["attachment_ordinal"])]
        if len({record["attachment_ordinal_verified"] for record in members}) != 1:
            raise ValueError("Mixed logical and verified attachment ordinals")
        if existing is not None:
            stored_ids = existing["attachment_ingestion_ids"]
            expected_ids = member_ids[:len(stored_ids)] if existing["receipt_state"] == "incomplete" else member_ids
            if None not in member_ids and stored_ids != expected_ids:
                raise ValueError("Mail receipt conflicts with ingestion identities")
            if not members[0]["attachment_ordinal_verified"] and existing["receipt_state"] != "legacy_complete":
                raise ValueError("Historical mail receipt must suppress feedback")
        else:
            if any(record["attachment_ordinal_verified"] for record in members):
                raise ValueError("Verified MIME identity lacks a mail receipt")
            if assign_ids:
                additions.append({
                    "provider": key[0], "provider_message_id": key[1],
                    "receipt_state": "legacy_complete",
                    "attachment_ingestion_ids": member_ids,
                    "feedback_state": "legacy_suppressed", "feedback_attempts": [],
                })
    summary = {"migration_version": MIGRATION_VERSION, "ingestions": len(records), "mail_receipts": len(groups), "missing_ids": missing_ids, "receipts_to_create": len(groups) - len(set(groups) & set(receipt_index))}
    return raw, records, current_receipts + additions, summary


def check(history_path: str | Path) -> dict:
    """Inspect only. No lock files, writes, or ID generation."""
    return _plan(Path(history_path), assign_ids=False)[3]


def migrate(history_path: str | Path) -> dict:
    path = Path(history_path)
    with ingestion_lock(path.parent):
        old_bytes, records, receipts, summary = _plan(path, assign_ids=True)
        history_bytes = (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        receipt_file = receipt_path(path)
        old_receipt_bytes = receipt_file.read_bytes() if receipt_file.exists() else None
        need_history = history_bytes != old_bytes
        need_receipts = summary["receipts_to_create"] > 0
        try:
            if need_history:
                atomic_bytes(path, history_bytes)
            if need_receipts:
                write_receipts(receipt_file, receipts)
            verify(path)
        except BaseException:
            if need_history and path.read_bytes() != old_bytes:
                atomic_bytes(path, old_bytes)
            if need_receipts:
                if old_receipt_bytes is None and receipt_file.exists():
                    receipt_file.unlink()
                elif old_receipt_bytes is not None and receipt_file.read_bytes() != old_receipt_bytes:
                    atomic_bytes(receipt_file, old_receipt_bytes)
            raise
        return {**summary, "history_changed": need_history, "receipts_changed": need_receipts}


def verify(history_path: str | Path) -> dict:
    path = Path(history_path)
    source = [] if not path.exists() else _read_history(path)[1]
    if any(item.get("provider") != ADMIN_UPLOAD and ("id" not in item or "attachment_ordinal" not in item or "attachment_ordinal_verified" not in item) for item in source):
        raise ValueError("Unmigrated mail ingestion")
    _, _, receipts, summary = _plan(path, assign_ids=False, allow_missing_history=True)
    if summary["receipts_to_create"]:
        raise ValueError("Missing mail receipts")
    return {**summary, "stored_receipts": len(receipts)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("check", "migrate", "verify"))
    parser.add_argument("--history", type=Path, required=True, help="Explicit ingestion_history.json path")
    args = parser.parse_args()
    try:
        result = {"check": check, "migrate": migrate, "verify": verify}[args.operation](args.history)
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f"{args.operation} failed: {error}\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
