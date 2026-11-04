"""At-most-once technical notices for actionable OVH input failures."""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import uuid4

from app.services.ingestion_lock import ingestion_lock
from app.services.gpx_notice_feedback import LIMITS, safe_feedback
from app.services.outbound_mail import OvhSmtpTransport, compose_automated_mail


REASONS = {"multiple_supported", "invalid_track"}
SUBJECT = "TackBar track submission needs correction / Corrige el envío de tu track"
ADDRESS_PATTERN = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+")


def _valid_recipient(recipient: str) -> bool:
    return (
        isinstance(recipient, str)
        and ADDRESS_PATTERN.fullmatch(recipient) is not None
        and "." in recipient.rsplit("@", 1)[1]
        and recipient.lower() not in {"share@tackbar.eu", "hello@tackbar.eu"}
    )


FEEDBACK_COPY = {
    "timezone": (
        "Las horas de los puntos GPS no indican una zona horaria explícita.",
        "Revisa la configuración de exportación GPX y vuelve a exportar si dispones de horas con zona horaria. Envía el archivo corregido en un correo nuevo.",
        "Detalle técnico: cada hora de un punto GPX debe incluir su zona horaria.",
        "The GPS point timestamps do not include an explicit time zone.",
        "Check the GPX export settings and re-export if timestamps with time zones are available. Send the corrected file in a new email.",
        "Technical detail: every GPX trackpoint timestamp must include a time zone.",
    ),
    "chronology": (
        "Las fechas y horas de los puntos GPS no forman una secuencia cronológica válida.",
        "Comprueba la hora registrada y la exportación GPX. Envía el archivo corregido en un correo nuevo.",
        "Detalle técnico: las horas deben ser válidas y avanzar estrictamente en el orden del track.",
        "The GPS point dates and times do not form a valid chronological sequence.",
        "Check the recorded time and GPX export. Send the corrected file in a new email.",
        "Technical detail: timestamps must be valid and strictly increase in track order.",
    ),
    "structure": (
        "El GPX no contiene una sola navegación con un segmento no vacío y suficientes puntos GPS.",
        "Exporta una sola navegación en GPX con sus puntos GPS y envíala en un correo nuevo.",
        "Detalle técnico: TackBar requiere un track, un segmento y al menos dos puntos GPS.",
        "The GPX does not contain one navigation track with one nonempty segment and enough GPS points.",
        "Export one navigation as GPX with its GPS points and send it in a new email.",
        "Technical detail: TackBar requires one track, one segment and at least two GPS points.",
    ),
    "coordinates": (
        "Una o más posiciones GPS registradas tienen coordenadas no válidas.",
        "Comprueba el archivo original o vuelve a exportarlo y envía el resultado en un correo nuevo.",
        "Detalle técnico: cada punto necesita latitud y longitud válidas.",
        "One or more recorded GPS positions have invalid coordinates.",
        "Check the original file or export it again, then send the result in a new email.",
        "Technical detail: each point needs valid latitude and longitude.",
    ),
    "quality": (
        "La calidad de los datos GPS de este archivo es insuficiente para un análisis fiable de la navegación en TackBar.",
        "Comprueba la configuración de grabación GPS. Si está disponible, elige grabación cada segundo (1 Hz) en lugar de grabación inteligente. Graba una navegación nueva y envía ese nuevo track en un correo nuevo.",
        "Detalle técnico: intervalos entre puntos GPS consecutivos (segundos).",
        "The GPS data quality in this file is insufficient for reliable navigation analysis in TackBar.",
        "Check the GPS recording setting. If available, choose one-second (1 Hz) recording instead of smart recording. Record a new sailing track and send it in a new email.",
        "Technical detail: intervals between consecutive GPS points (seconds).",
    ),
    "vakaros_incomplete": (
        "El archivo no contiene toda la información de navegación necesaria para procesar el track.",
        "Obtén o exporta el track original completo y envíalo en un correo nuevo.",
        "Detalle técnico: faltan datos de navegación necesarios.",
        "The file does not contain all the navigation information needed to process the track.",
        "Obtain or export the complete original track and send it in a new email.",
        "Technical detail: required navigation data is missing.",
    ),
    "vakaros_format": (
        "TackBar no puede interpretar la revisión VKX declarada en este archivo.",
        "Usa una exportación original compatible o consulta con soporte y envía el archivo en un correo nuevo.",
        "Detalle técnico: la revisión VKX declarada no es compatible actualmente.",
        "TackBar cannot interpret the VKX revision declared in this file.",
        "Use an original supported export or contact support, then send the file in a new email.",
        "Technical detail: the declared VKX revision is not currently supported.",
    ),
    "vakaros_gps": (
        "Las posiciones GPS o las horas de navegación registradas no son válidas o utilizables.",
        "Revisa la grabación original y su exportación; envía un archivo corregido en un correo nuevo.",
        "Detalle técnico: se necesitan posiciones y horas de navegación válidas.",
        "The recorded GPS positions or navigation timestamps are invalid or unusable.",
        "Review the original recording and its export; send a corrected file in a new email.",
        "Technical detail: valid navigation positions and timestamps are required.",
    ),
    "vakaros_sensor": (
        "Los datos de sensores u orientación necesarios son incompletos o no válidos.",
        "Obtén una nueva exportación original completa y envíala en un correo nuevo.",
        "Detalle técnico: los valores de sensores u orientación no superaron la validación.",
        "Required sensor or orientation data is incomplete or invalid.",
        "Obtain a fresh, complete original export and send it in a new email.",
        "Technical detail: sensor or orientation values did not pass validation.",
    ),
}


def _quality_table(metrics: dict, spanish: bool) -> str:
    labels = {
        "median": ("Mediana", "Median"),
        "P95": ("Percentil 95 (el 95 % de intervalos no supera este valor)", "95th percentile (95% of intervals are no longer than this)"),
        "maximum adjacent gap": ("Intervalo máximo", "Maximum interval"),
    }
    head = "Métrica | Tu track | Requisito de TackBar" if spanish else "Metric | Your track | TackBar requirement"
    rows = [head]
    for name, limit in LIMITS.items():
        if name in metrics:
            rows.append(f"{labels[name][0 if spanish else 1]} | {metrics[name]} s | ≤{limit} s")
    return "\n".join(rows)


def _body(reason: str, feedback: dict | None = None) -> str:
    feedback = safe_feedback(feedback) if reason == "invalid_track" else None
    if feedback is not None:
        es_problem, es_action, es_detail, en_problem, en_action, en_detail = FEEDBACK_COPY[feedback["category"]]
        if feedback["category"] == "quality":
            es_detail += "\n" + _quality_table(feedback["metrics"], True)
            en_detail += "\n" + _quality_table(feedback["metrics"], False)
        if "missing_columns" in feedback:
            names = ", ".join(feedback["missing_columns"])
            es_detail += "\nColumnas CSV necesarias ausentes: " + names
            en_detail += "\nMissing required CSV columns: " + names
        return (
            "Hola,\n\nNo pudimos procesar tu envío de track a TackBar. "
            + es_problem + "\n\n" + es_action + "\n\n" + es_detail
            + "\n\n---\n\nHi,\n\nWe could not process your TackBar track submission. "
            + en_problem + "\n\n" + en_action + "\n\n" + en_detail
        )
    if reason == "multiple_supported":
        action_es = "Envía cada track compatible en un correo separado."
        action_en = "Send each supported track in a separate email."
    else:
        action_es = "Revisa el archivo del track y vuelve a enviarlo en un correo nuevo."
        action_en = "Check the track file and send it again in a new email."
    return (
        "Hola,\n\nNo pudimos procesar tu envío de track a TackBar. " + action_es
        + "\n\n---\n\nHi,\n\nWe could not process your TackBar track submission. "
        + action_en
    )


def send_technical_failure_notice(recipient: str, reason: str, feedback: dict | None = None) -> None:
    message = compose_automated_mail(recipient, SUBJECT, _body(reason, feedback))
    OvhSmtpTransport.from_environment().send(message)


class TechnicalNoticeStore:
    def __init__(self, data_root: Path) -> None:
        self.path = data_root / "ovh_technical_notices.json"

    def records(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        value = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Malformed OVH technical notice store")
        for message_id, record in value.items():
            if not re.fullmatch(r"[1-9][0-9]*:[1-9][0-9]*", message_id):
                raise ValueError("Malformed OVH technical notice identity")
            if not isinstance(record, dict) or set(record) != {
                "recipient", "reason", "status", "attempted_at", "sent_at"
            } or not _valid_recipient(record["recipient"]) or record["reason"] not in REASONS or record["status"] not in {"attempted", "sent", "failed"}:
                raise ValueError("Malformed OVH technical notice state")
            if not isinstance(record["attempted_at"], str) or (record["sent_at"] is not None) != (record["status"] == "sent"):
                raise ValueError("Inconsistent OVH technical notice state")
            for timestamp in (record["attempted_at"], record["sent_at"]):
                if timestamp is not None:
                    try:
                        parsed = datetime.fromisoformat(timestamp)
                        if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
                            raise ValueError
                    except (TypeError, ValueError):
                        raise ValueError("Malformed OVH technical notice timestamp") from None
        return value

    def _write(self, records: dict[str, dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as output:
                output.write((json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def attempt_once(
        self, message_id: str, recipient: str, reason: str,
        sender: Callable | None = None,
        feedback: dict | None = None,
    ) -> bool:
        if reason not in REASONS or not re.fullmatch(r"[1-9][0-9]*:[1-9][0-9]*", message_id) or not _valid_recipient(recipient):
            raise ValueError("Invalid OVH technical notice decision")
        with ingestion_lock(self.path.parent):
            sender = sender or send_technical_failure_notice
            records = self.records()
            if message_id in records:
                return False
            record = {
                "recipient": recipient, "reason": reason, "status": "attempted",
                "attempted_at": datetime.now(timezone.utc).isoformat(), "sent_at": None,
            }
            records[message_id] = record
            self._write(records)
            try:
                if feedback is None:
                    sender(recipient, reason)
                else:
                    sender(recipient, reason, safe_feedback(feedback))
            except Exception:
                record["status"] = "failed"
            else:
                record["status"] = "sent"
                record["sent_at"] = datetime.now(timezone.utc).isoformat()
            self._write(records)
            return True
