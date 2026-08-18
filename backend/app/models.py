from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class Activity:
    source: str
    original_filename: str
    device_name: str
    start_time: datetime
    end_time: datetime
    start_lat: float
    start_lon: float
    samples: list[dict[str, Any]]


@dataclass
class InboundEmail:
    sender_email: str
    subject: str
    attachment_filename: str | None
    attachment_bytes: bytes | None
    provider_message_id: str | None = None


@dataclass
class IngestionResult:
    sender_email: str
    subject: str
    attachment_filename: str
    activity: Activity


@dataclass
class Participant:
    id: str
    name: str
    email: str
    boat_name: str
    sailing_class: str
    sail_number: str | None
    category: str
