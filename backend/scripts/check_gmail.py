"""Run the Gmail-to-Activity proof of concept."""

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.email_providers.gmail import GmailAdapter  # noqa: E402
from app.services.gmail_processing import (  # noqa: E402
    GmailProcessingHistory,
    process_gmail_email,
)


def main() -> None:
    emails = GmailAdapter().get_candidate_emails()
    history = GmailProcessingHistory()

    if not emails:
        print("No unread Gmail messages with matching CSV.GZ attachments found.")
        return

    for email in emails:
        try:
            result = process_gmail_email(email, history)
        except ValueError as error:
            print(f"Failed to process {email.attachment_filename}: {error}")
            continue

        if result is None:
            print(f"Skipped already processed Gmail message: {email.provider_message_id}")
            continue

        activity = result.activity
        print(f"Sender: {result.sender_email}")
        print(f"Subject: {result.subject}")
        print(f"Attachment: {result.attachment_filename}")
        print(f"Device: {activity.device_name}")
        print(f"Start time: {activity.start_time.isoformat()}")
        print(f"End time: {activity.end_time.isoformat()}")
        print(f"Sample count: {len(activity.samples)}")
        print()


if __name__ == "__main__":
    main()
