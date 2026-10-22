"""Request-independent manual ingestion, owned by the backend's lifespan.

Each accepted operation owns an OS lease before it enters the executor. A lease
survives queueing and processing but disappears on process exit. Reconciliation
only marks unowned pending/processing records failed; it never executes them.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID

from app.repositories.activities import ActivityRepository
from app.repositories.boats import BoatRepository
from app.repositories.sailors import SailorRepository
from app.repositories.sessions import SessionRepository
from app.services.ingestion_history import ADMIN_UPLOAD, ADMIN_UPLOAD_INTERRUPTED, IngestionHistory
from app.services.ingestion_lock import FileLease, ingestion_lock
from app.services.ingestion_processing import accept_admin_upload, process_admin_upload


MAX_UPLOAD_BYTES = 16 * 1024 * 1024
ACTIVATION_FAILURE = "Manual ingestion worker could not be activated; explicit Reprocess is required"


def _lease_path(root: Path, record_id: str) -> Path:
    return root / ".manual-workers" / f"{UUID(record_id)}.lock"


def reconcile_manual_uploads(root: Path, *, blocking: bool = False) -> list[str]:
    history = IngestionHistory(root / "ingestion_history.json")
    if not history.path.exists():
        return []
    with ingestion_lock(root, blocking=blocking) as acquired:
        if not acquired:
            return []
        interrupted = []
        for record in history.records():
            if record["provider"] != ADMIN_UPLOAD or record["status"] not in ("pending", "processing"):
                continue
            lease = FileLease.try_acquire(_lease_path(root, record["id"]))
            if lease is None:
                continue
            try:
                record.update(status="failed", last_error=ADMIN_UPLOAD_INTERRUPTED)
                history.replace(record)
                interrupted.append(record["id"])
            finally:
                lease.close()
        return interrupted


class ManualUploadWorker:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="manual-ingestion")

    def accept(self, sailor_id: str, filename: str, content: bytes) -> dict:
        # Also enforce the boundary at the dispatch layer, before any preservation.
        if len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("Manual upload exceeds 16 MiB")
        history = IngestionHistory(self.root / "ingestion_history.json")
        with ingestion_lock(self.root):
            record = accept_admin_upload(
                sailor_id, filename, content,
                SailorRepository(self.root / "sailors.json"), history,
            )
            lease = None
            try:
                lease = FileLease.try_acquire(_lease_path(self.root, record["id"]))
                if lease is None:
                    raise RuntimeError("New manual operation is already owned")
                future = self.executor.submit(self._process, record["id"])
            except Exception:
                if lease is not None:
                    lease.close()
                record.update(status="failed", last_error=ACTIVATION_FAILURE)
                history.replace(record)
                return record

            def finished(_future):
                lease.close()
                # Nonblocking: cancellation during shutdown must not wait for a
                # different writer. Startup/Admin inspection reconciles leftovers.
                reconcile_manual_uploads(self.root)

            future.add_done_callback(finished)
            # This durable snapshot acknowledges acceptance, not processing progress.
            return history.get(record["id"])

    def _process(self, record_id: str) -> dict:
        return process_admin_upload(
            record_id,
            SailorRepository(self.root / "sailors.json"),
            BoatRepository(self.root / "boats.json"),
            ActivityRepository(self.root / "activities.json"),
            SessionRepository(self.root / "sessions.json"),
            IngestionHistory(self.root / "ingestion_history.json"),
        )

    def shutdown(self) -> None:
        # Running ingestion keeps its lease until completion or process termination.
        # Pending cancellation releases leases and leaves explicit failed recovery.
        self.executor.shutdown(wait=False, cancel_futures=True)
