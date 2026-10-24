"""Plain-text bilingual feedback for one received OVH mail."""

from unicodedata import category

from app.services.outbound_mail import OutboundMailMessage
from app.services.welcome_email import public_capability_url


RESULT_SUBJECT = "Your TackBar tracks / Tus tracks en TackBar"
TECHNICAL_SUBJECT = "TackBar track receipt / Recepción de tracks en TackBar"


def safe_filename(value: str | None) -> str:
    name = (value or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(" " if category(character).startswith("C") else character for character in name)
    return " ".join(name.split())[:120] or "unnamed attachment"


def _safe_failure_reason(record: dict, spanish: bool) -> str:
    error = record.get("last_error") or ""
    if record["status"] == "acquisition_failed":
        return "adjunto ilegible" if spanish else "attachment could not be read"
    if "interrupted" in error.lower():
        return "procesamiento interrumpido" if spanish else "processing interrupted"
    if "original" in error.lower() or "sha-256" in error.lower():
        return "original no disponible" if spanish else "original unavailable"
    return "track no válido" if spanish else "invalid track"


def compose_results_email(
    recipient: str,
    records: list[dict],
    session_paths: list[str],
    personal_path: str | None,
    public_base_url: str,
) -> OutboundMailMessage:
    def lines(spanish: bool) -> list[str]:
        output = []
        for record in records:
            filename = safe_filename(record["attachment_name"])
            ordinal = record["attachment_ordinal"]
            if record["status"] == "processed":
                created = record["activity_created_by_ingestion"]
                if spanish:
                    outcome = "procesado; nuevo" if created is True else (
                        "procesado; recibido anteriormente" if created is False else "procesado; origen incierto"
                    )
                else:
                    outcome = "processed; new" if created is True else (
                        "processed; previously received" if created is False else "processed; creation uncertain"
                    )
            else:
                outcome = ("falló: " if spanish else "failed: ") + _safe_failure_reason(record, spanish)
            output.append(f"{ordinal}. {filename} — {outcome}")
        return output

    links = [public_capability_url(public_base_url, path) for path in session_paths]
    personal = public_capability_url(public_base_url, personal_path) if personal_path else None
    english = ["Hi,", "", "Here are the results for the tracks in your email:", "", *lines(False)]
    spanish = ["Hola,", "", "Estos son los resultados de los tracks de tu correo:", "", *lines(True)]
    if links:
        english += ["", "Open your available Sessions:", *links]
        spanish += ["", "Abre tus Sessions disponibles:", *links]
    if personal:
        english += ["", "My TackBar:", personal]
        spanish += ["", "Mi TackBar:", personal]
    english += ["", "TackBar"]
    spanish += ["", "TackBar"]
    return OutboundMailMessage(recipient, RESULT_SUBJECT, "\n".join(english + ["", "---", ""] + spanish) + "\n")


def compose_technical_email(recipient: str, rejected: bool) -> OutboundMailMessage:
    if rejected:
        english = "Your email exceeded a TackBar mail or attachment limit, so no tracks were accepted. Please send fewer or smaller supported tracks."
        spanish = "Tu correo superó un límite de TackBar para correos o adjuntos, así que no se aceptó ningún track. Envía menos tracks compatibles o de menor tamaño."
    else:
        english = "We could not process any supported track in your email. Please check the files and send a new email."
        spanish = "No pudimos procesar ningún track compatible de tu correo. Revisa los archivos y envía un correo nuevo."
    return OutboundMailMessage(recipient, TECHNICAL_SUBJECT, f"Hi,\n\n{english}\n\nTackBar\n\n---\n\nHola,\n\n{spanish}\n\nTackBar\n")
