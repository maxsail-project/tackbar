"""Run exactly one configured TackBar mailbox-review cycle."""

import logging

from app.services.mailbox_review import review_mailbox_now


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s %(message)s",
    )
    try:
        review_mailbox_now()
    except Exception:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
