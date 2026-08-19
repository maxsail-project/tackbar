import json
import shutil
from pathlib import Path
from typing import Callable
from uuid import uuid4

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]


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
