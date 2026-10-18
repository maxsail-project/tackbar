import json
import shutil
import struct
from pathlib import Path
from typing import Callable
from uuid import uuid4

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def isolate_automatic_session_enrichment_from_external_providers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.session_enrichment import SessionEnrichmentService

    monkeypatch.setattr(
        "app.services.ingestion_processing.automatic_session_enrichment_service",
        lambda sessions, activities: SessionEnrichmentService(sessions, activities),
    )


@pytest.fixture
def vakaros_vkx_bytes() -> bytes:
    header = bytes([0xFF, 0x05]) + bytes(6)
    position = bytes([0x02]) + struct.pack(
        "<Qii7f",
        1_938_854_096_789,
        381_234_567,
        -2_345_678,
        5.0,
        1.5707963267948966,
        123.4,
        0.5,
        0.1,
        -0.2,
        0.8,
    )
    return header + position


@pytest.fixture
def temporary_json_file() -> Callable[[str, object], Path]:
    directory = BACKEND_DIR / "tmp" / f"test-json-{uuid4()}"
    directory.mkdir(parents=True)

    def create(prefix: str, content: object) -> Path:
        path = directory / f"{prefix}-{uuid4()}.json"
        path.write_text(
            json.dumps(content, indent=2) + "\n",
            encoding="utf-8",
        )
        return path

    yield create

    if directory.exists():
        shutil.rmtree(directory)


@pytest.fixture
def temporary_directory() -> Path:
    path = BACKEND_DIR / "tmp" / f"test-data-{uuid4()}"
    path.mkdir(parents=True)

    yield path

    if path.exists():
        shutil.rmtree(path)
