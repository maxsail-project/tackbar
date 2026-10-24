import re
import os
from pathlib import Path
from uuid import UUID

from app.runtime_paths import runtime_paths
from app.storage.fs_durability import mkdir_durable, sync_parent_directory


class IngestionOriginalStorage:
    def __init__(self, data_root: str | Path | None = None) -> None:
        self.root = (runtime_paths().root if data_root is None else Path(data_root)).resolve()

    def preserve(self, record_id: str, filename: str, content: bytes) -> str:
        relative = Path(self.relative_reference(record_id, filename))
        path = self.root / relative; mkdir_durable(path.parent)
        if path.exists() and path.read_bytes() != content: raise ValueError("Preserved ingestion original differs from received bytes")
        if not path.exists():
            with path.open("xb") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            sync_parent_directory(path)
        return relative.as_posix()

    @staticmethod
    def relative_reference(record_id: str, filename: str) -> str:
        safe_id = str(UUID(record_id)); name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename.replace("\\", "/").rsplit("/", 1)[-1]).strip(" .")
        if not name: raise ValueError("Attachment filename cannot be safely stored")
        return (Path("originals") / "ingestions" / safe_id / name).as_posix()

    def read(self, relative: str) -> bytes:
        path = (self.root / relative).resolve()
        try: path.relative_to(self.root)
        except ValueError as error: raise ValueError("Invalid ingestion original reference") from error
        if not path.is_file(): raise FileNotFoundError("Preserved ingestion original is unavailable")
        return path.read_bytes()
