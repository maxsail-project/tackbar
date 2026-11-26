"""Private storage of Session course contexts and their preserved originals (#242).

- ``course_contexts/<course_id>.json``: one schema-v1 course context, published
  with the atomic single-file replacement used by the JSON collections.
- ``originals/courses/<course_id>/<safe filename>``: the exact GeoRacing GPX the
  Admin attached, created exclusively and synced, read with path containment.

The frontend never reads these files; shared reads go through backend services.
"""

import json
import os
import re
import shutil
from pathlib import Path
from uuid import UUID

from app.repositories.atomic_json import read_text, write_text
from app.runtime_paths import runtime_paths


def canonical_course_id(course_id: str) -> str:
    try:
        canonical = str(UUID(course_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError("Invalid course id for storage") from error
    if course_id != canonical:
        raise ValueError("Invalid course id for storage")
    return canonical


def _safe_filename(filename: str) -> str:
    basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", basename).strip(" .")
    if not name:
        raise ValueError("Course original filename cannot be safely stored")
    return name


class CourseStorage:
    def __init__(self, data_root: str | Path | None = None) -> None:
        self.root = (runtime_paths().root if data_root is None else Path(data_root)).resolve()
        self.contexts_root = self.root / "course_contexts"
        self.originals_root = self.root / "originals" / "courses"

    # --- Course contexts ---

    def context_path(self, course_id: str) -> Path:
        return self.contexts_root / f"{canonical_course_id(course_id)}.json"

    def context_lock_path(self, course_id: str) -> Path:
        """The short file-access lock atomic_json keeps beside the context."""
        path = self.context_path(course_id)
        return path.with_name(f".{path.name}.access.lock")

    def write_context(self, course_id: str, course: dict) -> None:
        write_text(
            self.context_path(course_id),
            json.dumps(course, indent=2, ensure_ascii=False) + "\n",
        )

    def read_context(self, course_id: str) -> dict | None:
        """The stored JSON object, None when absent; ValueError when unreadable."""
        content = read_text(self.context_path(course_id))
        if content is None:
            return None
        try:
            value = json.loads(content)
        except json.JSONDecodeError as error:
            raise ValueError("Course context is not valid JSON") from error
        if not isinstance(value, dict):
            raise ValueError("Course context must be a JSON object")
        return value

    # --- Preserved originals ---

    def original_directory(self, course_id: str) -> Path:
        return self.originals_root / canonical_course_id(course_id)

    def preserve_original(self, course_id: str, filename: str, content: bytes) -> str:
        directory = self.original_directory(course_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / _safe_filename(filename)
        with path.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        return path.relative_to(self.root).as_posix()

    def read_original(self, relative: str) -> bytes:
        path = (self.root / relative).resolve()
        try:
            path.relative_to(self.originals_root)
        except ValueError as error:
            raise ValueError("Invalid course original reference") from error
        if not path.is_file():
            raise FileNotFoundError("Preserved course original is unavailable")
        return path.read_bytes()

    # --- Removal ---

    def delete(self, course_id: str) -> None:
        """Remove a course's context file and preserved original directory."""
        self.context_path(course_id).unlink(missing_ok=True)
        # Course ids are never reused, so the deleted course's lock can go too.
        self.context_lock_path(course_id).unlink(missing_ok=True)
        directory = self.original_directory(course_id)
        if directory.is_symlink():
            raise ValueError("Refusing a symlinked course original directory")
        if directory.exists():
            shutil.rmtree(directory)
