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
