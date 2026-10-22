"""Isolated real backend for frontend/tests/adminUploadBackend.mjs.

Test transport replacements prohibit external networking. File gates change
only worker timing so a browser can inspect genuine pending/processing states.
No routes for simulating ingestion responses are added.
"""

from dataclasses import replace
import gzip
import json
import os
from pathlib import Path
import socket
import struct
import sys
import time
from types import SimpleNamespace
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def main():
    import uvicorn
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    from app.main import app
    from app.models import Boat, ConsentStatus
    from app.repositories.boats import BoatRepository
    from app.repositories.sailors import SailorRepository
    from app.runtime_paths import require_private_data_root
    from app.services import ingestion_processing as processing
    from app.services.manual_upload_worker import ManualUploadWorker
    from app.services.outbound_mail import OvhSmtpTransport
    from app.services.session_enrichment import SessionEnrichmentService

    root = require_private_data_root()
    if (root / "sailors.json").exists():
        raise RuntimeError("Browser verification requires a fresh private test directory")
    os.environ["TACKBAR_ADMIN_KEY"] = "offline-browser-admin"
    os.environ["TACKBAR_PUBLIC_BASE_URL"] = "http://127.0.0.1"

    def capture(message):
        with (root / "deliveries.jsonl").open("a", encoding="utf-8") as output:
            output.write(json.dumps({"recipient": message.recipient, "subject": message.subject}) + "\n")

    OvhSmtpTransport.from_environment = classmethod(lambda cls: SimpleNamespace(send=capture))
    processing.automatic_session_enrichment_service = (
        lambda sessions, activities: SessionEnrichmentService(sessions, activities)
    )
    real_connect = socket.socket.connect

    def local_connect(connection, address):
        if isinstance(address, tuple) and address[0] not in ("127.0.0.1", "::1"):
            raise AssertionError("Browser backend must remain offline")
        return real_connect(connection, address)

    socket.socket.connect = local_connect
    sailors = SailorRepository()
    sailor, _ = sailors.find_or_create_by_email("browser-active@example.test")
    boat = BoatRepository().add(Boat(str(uuid4()), "Browser default Boat", "Snipe", "TEST"))
    sailor = sailors.replace(replace(sailor, name="Browser Pilot", consent_status=ConsentStatus.ACTIVE, default_boat_id=boat.id, personal_capability_token="p" * 43))
    sailors.find_or_create_by_email("browser-pending@example.test")

    def wait_for_gate(name):
        deadline = time.monotonic() + 90
        while (root / name).exists():
            if time.monotonic() > deadline:
                raise RuntimeError("Browser verification gate timed out")
            time.sleep(.025)

    process = ManualUploadWorker._process

    def delayed_process(self, record_id):
        wait_for_gate("pause_pending")
        return process(self, record_id)

    ManualUploadWorker._process = delayed_process
    parse = processing.parse_track_attachment

    def delayed_parse(*args):
        (root / "processing_entered").touch()
        wait_for_gate("pause_processing")
        return parse(*args)

    processing.parse_track_attachment = delayed_parse
    (root / "pause_pending").touch()
    (root / "pause_processing").touch()
    fixtures = BACKEND / "tests" / "fixtures"
    csv = gzip.decompress((fixtures / "vakaros-demo.csv.gz").read_bytes())
    (root / "representative.csv").write_bytes(csv)
    synthetic_vkx = bytes([0xFF, 0x05]) + bytes(6) + bytes([0x02]) + struct.pack(
        "<Qii7f", 1_938_854_096_789, 381_234_567, -2_345_678,
        5.0, 1.5707963267948966, 123.4, .5, .1, -.2, .8,
    )
    (root / "synthetic.vkx").write_bytes(synthetic_vkx)
    (root / "synthetic.vkx.gz").write_bytes(gzip.compress(synthetic_vkx, mtime=0))
    (root / "invalid.gpx").write_bytes(b"invalid GPX")
    files = [fixtures / "2025-06-21-ESP29375-P01.gpx", fixtures / "2025-06-21-ESP30782-P01.gpx", root / "representative.csv", fixtures / "vakaros-demo.csv.gz", root / "synthetic.vkx", root / "synthetic.vkx.gz"]
    dist = BACKEND.parent / "frontend" / "dist"

    @app.get("/admin", include_in_schema=False)
    @app.get("/s/{token}", include_in_schema=False)
    def frontend(token: str = ""):
        return FileResponse(dist / "index.html")

    app.mount("/assets", StaticFiles(directory=dist / "assets"))
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error")
    listener = config.bind_socket()
    manifest = {"port": listener.getsockname()[1], "sailor_id": sailor.id, "boat_id": boat.id, "files": [str(path) for path in files]}
    (root / "browser-runtime.json").write_text(json.dumps(manifest), encoding="utf-8")
    uvicorn.Server(config).run(sockets=[listener])


if __name__ == "__main__":
    main()
