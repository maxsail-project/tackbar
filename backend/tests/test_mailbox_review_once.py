import logging

from app import mailbox_review_once


def test_single_run_entrypoint_reuses_mailbox_review_service(
    monkeypatch,
):
    calls = []

    def review():
        calls.append("reviewed")

    monkeypatch.setattr(mailbox_review_once, "review_mailbox_now", review)

    assert mailbox_review_once.main() == 0
    assert calls == ["reviewed"]


def test_single_run_entrypoint_returns_failure_status_without_unsafe_log(
    monkeypatch, caplog
):
    def fail():
        raise RuntimeError("secret mailbox detail")

    monkeypatch.setattr(mailbox_review_once, "review_mailbox_now", fail)
    caplog.set_level(logging.INFO)

    assert mailbox_review_once.main() == 1
    assert "secret mailbox detail" not in caplog.text
