import json
from pathlib import Path
from typing import Callable
from uuid import uuid4

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture
def temporary_json_file() -> Callable[[str, object], Path]:
    created_paths: list[Path] = []

    def create(prefix: str, content: object) -> Path:
        path = BACKEND_DIR / "tmp" / f"test-{prefix}-{uuid4()}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(content, indent=2) + "\n",
            encoding="utf-8",
        )
        created_paths.append(path)
        return path

    yield create

    for path in created_paths:
        if path.exists():
            path.unlink()
