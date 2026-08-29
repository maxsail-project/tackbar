"""Run the Gmail-to-Activity proof of concept."""

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.runtime_paths import require_private_data_root  # noqa: E402
from app.services.mailbox_review import review_mailbox_now  # noqa: E402
from app.email_providers.gmail import GmailAdapter  # noqa: E402


def main() -> None:
    require_private_data_root()
    summary = review_mailbox_now(GmailAdapter(allow_interactive=True))
    print(summary)


if __name__ == "__main__":
    main()
