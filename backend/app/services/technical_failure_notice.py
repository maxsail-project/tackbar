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
OPENING_ES = "Hola,\n\nNo hemos podido procesar tu track en TackBar."
OPENING_EN = "Hi,\n\nWe couldn't process your track in TackBar."
CLOSING_ES = "Gracias por compartir tu navegación con TackBar. Si necesitas ayuda con el archivo, puedes escribirnos a hello@tackbar.eu."
CLOSING_EN = "Thank you for sharing your sailing activity with TackBar. If you need help with your file, you can contact us at hello@tackbar.eu."


def _valid_recipient(recipient: str) -> bool:
    return (
        isinstance(recipient, str)
        and ADDRESS_PATTERN.fullmatch(recipient) is not None
        and "." in recipient.rsplit("@", 1)[1]
        and recipient.lower() not in {"share@tackbar.eu", "hello@tackbar.eu"}
    )


FEEDBACK_COPY = {
    "timezone": (
        "El GPX no indica a qué zona horaria corresponden las horas de sus puntos. Sin ese dato, no podemos situarlos correctamente en el tiempo.",
        "Revisa las opciones de exportación GPX. Si puedes incluir la zona horaria, exporta el archivo de nuevo y envíalo en un correo nuevo.",
        "Detalle técnico: cada hora debe incluir una zona horaria, como Z o +01:00.",
        "The GPX does not say which time zone its point timestamps refer to. Without it, we cannot place them correctly in time.",
        "Check the GPX export options. If you can include the time zone, export the file again and send it in a new email.",
        "Technical detail: each timestamp needs a time zone, such as Z or +01:00.",
    ),
    "chronology": (
        "Las fechas y horas del GPX no forman una secuencia válida.",
        "Comprueba la hora de la grabación y la exportación GPX. Envía el archivo corregido en un correo nuevo.",
        "Detalle técnico: las horas deben ser válidas y avanzar en el orden del track.",
        "The GPX dates and times do not form a valid sequence.",
        "Check the recording time and GPX export. Send the corrected file in a new email.",
        "Technical detail: timestamps must be valid and advance in track order.",
    ),
    "structure": (
        "La organización del GPX no encaja con una sola navegación.",
        "Exporta una sola navegación en GPX con sus puntos GPS y envíala en un correo nuevo.",
        "Detalle técnico: TackBar necesita un track, un segmento no vacío y al menos dos puntos GPS.",
        "The GPX structure does not fit a single sailing activity.",
        "Export one sailing activity as GPX with its GPS points and send it in a new email.",
        "Technical detail: TackBar needs one track, one nonempty segment and at least two GPS points.",
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
        "La calidad de los datos GPS de este archivo no basta para analizar la navegación con fiabilidad en TackBar.",
        "Revisa la grabación GPS. Si está disponible, elige una muestra cada segundo (1 Hz) en vez de grabación inteligente. Graba una navegación nueva y envía ese track en un correo nuevo.",
        "Detalle técnico: intervalos entre puntos GPS consecutivos.",
        "The GPS data quality in this file is not sufficient for reliable sailing analysis in TackBar.",
        "Check the GPS recording setting. If available, choose one sample per second (1 Hz) instead of smart recording. Record a new sailing track and send it in a new email.",
        "Technical detail: intervals between consecutive GPS points.",
    ),
    "vakaros_incomplete": (
        "El archivo está incompleto o no contiene datos suficientes para procesarlo.",
        "Obtén una exportación completa del track original y envíala en un correo nuevo.",
        "Detalle técnico: el archivo está incompleto o no contiene muestras de navegación.",
        "The file is incomplete or does not contain enough data to process it.",
        "Obtain a complete export of the original track and send it in a new email.",
        "Technical detail: the file is incomplete or has no navigation samples.",
    ),
    "vakaros_format": (
        "La versión VKX de este archivo no es compatible con TackBar.",
        "Revisa las opciones de exportación. Si puedes obtener un archivo compatible, envíalo en un correo nuevo.",
        "Detalle técnico: TackBar admite VKX 1.4 por ahora.",
        "The VKX version in this file is not compatible with TackBar.",
        "Check the export options. If you can obtain a compatible file, send it in a new email.",
        "Technical detail: TackBar currently supports VKX 1.4.",
    ),
    "vakaros_gps": (
        "Algunas posiciones GPS o fechas y horas de navegación del archivo no son válidas.",
        "Revisa la grabación original y su exportación. Envía un archivo corregido en un correo nuevo.",
        "Detalle técnico: se necesitan posiciones y horas de navegación válidas.",
        "Some GPS positions or navigation dates and times in the file are invalid.",
        "Review the original recording and its export. Send a corrected file in a new email.",
        "Technical detail: valid navigation positions and timestamps are required.",
    ),
    "vakaros_sensor": (
        "Hay datos de sensores u orientación incompletos o no válidos.",
        "Obtén una nueva exportación completa del archivo original y envíala en un correo nuevo.",
        "Detalle técnico: falta información de sensores u orientación, o no es válida.",
        "Some sensor or orientation data is incomplete or invalid.",
        "Obtain a fresh, complete export of the original file and send it in a new email.",
        "Technical detail: required sensor or orientation information is missing or invalid.",
    ),
}
INCOMPLETE_SUBTYPE_COPY = {
    "empty_csv": (
        "El CSV no contiene datos que podamos leer.", "The CSV contains no readable data.",
        "Detalle técnico: no se encontraron datos CSV.", "Technical detail: no CSV data was found.",
    ),
    "csv_no_samples": (
        "El CSV no contiene muestras de navegación.", "The CSV has no navigation samples.",
        "Detalle técnico: hay columnas, pero no filas con datos.", "Technical detail: the file has columns but no data rows.",
    ),
    "vkx_no_navigation": (
        "El VKX no contiene muestras de navegación.", "The VKX has no navigation samples.",
        "Detalle técnico: no se encontraron posiciones de navegación.", "Technical detail: no navigation positions were found.",
    ),
    "vkx_truncated": (
        "El VKX está incompleto.", "The VKX file is incomplete.",
        "Detalle técnico: el archivo termina antes de completar una fila de datos.",
        "Technical detail: the file ends before a data row is complete.",
    ),
}


def _quality_table(metrics: dict, spanish: bool) -> str:
    labels = {
        "median": ("Mediana de intervalos", "Median interval"),
        "P95": ("Percentil 95", "95th percentile"),
        "maximum adjacent gap": ("Intervalo máximo", "Maximum interval"),
    }
    observed_label = "Tu track" if spanish else "Your track"
    limit_label = "Requisito de TackBar" if spanish else "TackBar requirement"
    rows = []
    for name, limit in LIMITS.items():
        if name in metrics:
            rows.append(
                f"{labels[name][0 if spanish else 1]}\n"
                f"  {observed_label}: {metrics[name]} s\n"
                f"  {limit_label}: ≤{limit} s"
            )
    result = "\n\n".join(rows)
    if "P95" in metrics:
        explanation = (
            "El percentil 95 es un valor que al menos el 95 % de los intervalos no supera."
            if spanish else "The 95th percentile is a value that at least 95% of intervals do not exceed."
        )
        result += "\n\n" + explanation
    return result


def _body(reason: str, feedback: dict | None = None) -> str:
    feedback = safe_feedback(feedback) if reason == "invalid_track" else None
    if feedback is not None:
        es_problem, es_action, es_detail, en_problem, en_action, en_detail = FEEDBACK_COPY[feedback["category"]]
        if "subtype" in feedback:
            es_problem, en_problem, es_detail, en_detail = INCOMPLETE_SUBTYPE_COPY[feedback["subtype"]]
        if feedback["category"] == "quality":
            es_detail += "\n\n" + _quality_table(feedback["metrics"], True)
            en_detail += "\n\n" + _quality_table(feedback["metrics"], False)
        if "missing_columns" in feedback:
            names = ", ".join(feedback["missing_columns"])
            es_problem = "El CSV no incluye todos los datos de navegación necesarios."
            en_problem = "The CSV is missing required navigation data."
            es_detail = "Detalle técnico: faltan estas columnas CSV: " + names
            en_detail = "Technical detail: these required CSV columns are missing: " + names
        return (
            OPENING_ES + "\n\n" + es_problem + "\n\n" + es_action + "\n\n" + es_detail
            + "\n\n" + CLOSING_ES
            + "\n\n---\n\n" + OPENING_EN + "\n\n" + en_problem + "\n\n" + en_action
            + "\n\n" + en_detail + "\n\n" + CLOSING_EN
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
