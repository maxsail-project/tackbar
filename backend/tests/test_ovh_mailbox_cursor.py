import json

import pytest

from app.services.ovh_mailbox_cursor import (
    OVHMailboxCursor,
    OVHMailboxCursorStore,
)


def test_cursor_round_trip_uses_deterministic_inspectable_json(tmp_path):
    path = tmp_path / "ovh_mailbox_cursor.json"
    store = OVHMailboxCursorStore(path)

    store.write(OVHMailboxCursor(uidvalidity=456, last_seen_uid=17))

    assert path.read_text(encoding="utf-8") == (
        '{\n  "uidvalidity": 456,\n  "last_seen_uid": 17\n}\n'
    )
    assert store.load() == OVHMailboxCursor(456, 17)


@pytest.mark.parametrize(
    "value",
    [
        [],
        {},
        {"uidvalidity": 456},
        {"uidvalidity": 456, "last_seen_uid": 17, "status": "processed"},
        {"uidvalidity": "456", "last_seen_uid": 17},
        {"uidvalidity": 0, "last_seen_uid": 17},
        {"uidvalidity": 456, "last_seen_uid": -1},
        {"uidvalidity": 456, "last_seen_uid": True},
    ],
)
def test_malformed_cursor_is_rejected(tmp_path, value):
    path = tmp_path / "ovh_mailbox_cursor.json"
    path.write_text(json.dumps(value), encoding="utf-8")

    with pytest.raises(ValueError, match="Malformed OVH mailbox cursor"):
        OVHMailboxCursorStore(path).load()
