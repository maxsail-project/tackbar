"""Narrow, user-safe Vakaros parser-rejection mapping for #146.2."""

import re

from app.parsers.vakaros_csv import VakarosCSVParseError
from app.parsers.vakaros_vkx import ROW_PAYLOAD_SIZES, VKXParseError, VKX_1_4_REVISION


SAFE_REQUIRED_COLUMNS = frozenset({
    "timestamp", "latitude", "longitude", "sog_kts", "cog",
    "hdg_true", "heel", "trim",
})
VAKAROS_CATEGORIES = frozenset({
    "vakaros_incomplete", "vakaros_format", "vakaros_gps", "vakaros_sensor",
})
INCOMPLETE_SUBTYPES = frozenset({
    "empty_csv", "csv_no_samples", "vkx_no_navigation", "vkx_truncated",
})
CSV_ERRORS = {
    "Vakaros CSV.GZ exceeds 160 MiB": "file_too_large",
    "Vakaros CSV contains invalid timestamps": "vakaros_gps",
    "Vakaros CSV contains no valid GPS samples": "vakaros_gps",
    "Vakaros CSV contains invalid quaternion values": "vakaros_sensor",
}
VKX_ERRORS = {
    "Vakaros VKX.GZ exceeds 160 MiB": "file_too_large",
    "Vakaros VKX contains invalid latitude": "vakaros_gps",
    "Vakaros VKX contains invalid longitude": "vakaros_gps",
    "Vakaros VKX contains invalid timestamp": "vakaros_gps",
    "Vakaros VKX contains invalid zero-norm quaternion": "vakaros_sensor",
    "Vakaros VKX contains invalid Shift Angle timestamp": "vakaros_sensor",
    "Vakaros VKX contains invalid Shift Angle true heading": "vakaros_sensor",
    "Vakaros VKX contains invalid Shift Angle average SOG": "vakaros_sensor",
}


def safe_vakaros_feedback(value: object) -> dict | None:
    if not isinstance(value, dict) or not isinstance(value.get("category"), str):
        return None
    if value["category"] not in VAKAROS_CATEGORIES:
        return None
    if set(value) == {"category"}:
        return {"category": value["category"]}
    if set(value) == {"category", "subtype"} and value["category"] == "vakaros_incomplete":
        if isinstance(value["subtype"], str) and value["subtype"] in INCOMPLETE_SUBTYPES:
            return {"category": "vakaros_incomplete", "subtype": value["subtype"]}
        return None
    if set(value) != {"category", "missing_columns"} or value["category"] != "vakaros_incomplete":
        return None
    columns = value["missing_columns"]
    if not isinstance(columns, list) or not columns or len(columns) > len(SAFE_REQUIRED_COLUMNS):
        return None
    if any(not isinstance(column, str) or column not in SAFE_REQUIRED_COLUMNS for column in columns):
        return None
    if columns != sorted(set(columns)):
        return None
    return {"category": "vakaros_incomplete", "missing_columns": list(columns)}


def classify_vakaros_csv_error(error: VakarosCSVParseError) -> dict | None:
    message = str(error)
    if message == "Vakaros CSV could not be parsed" and error.feedback_category == "vakaros_incomplete":
        return {"category": "vakaros_incomplete", "subtype": "empty_csv"}
    if message.startswith("Vakaros CSV is missing required columns: ") and error.feedback_category == "vakaros_incomplete":
        columns = error.missing_columns
        if not isinstance(columns, tuple):
            return None
        value = safe_vakaros_feedback({"category": "vakaros_incomplete", "missing_columns": list(columns)})
        if value is not None and message == "Vakaros CSV is missing required columns: " + ", ".join(columns):
            return value
        return None
    if message.startswith("Vakaros CSV has an incomplete quaternion column group; missing: "):
        names = message.removeprefix("Vakaros CSV has an incomplete quaternion column group; missing: ").split(", ")
        if names and names == sorted(set(names)) and set(names) <= {"q_w", "q_x", "q_y", "q_z"}:
            return {"category": "vakaros_sensor"}
        return None
    if message == "Vakaros CSV contains no samples":
        return {"category": "vakaros_incomplete", "subtype": "csv_no_samples"}
    return {"category": CSV_ERRORS[message]} if message in CSV_ERRORS else None


def classify_vakaros_vkx_error(error: VKXParseError) -> dict | None:
    message = str(error)
    if error.feedback_category == "vakaros_incomplete":
        match = re.fullmatch(r"Vakaros VKX row 0x([0-9A-F]{2}) is truncated", message)
        if match and int(match.group(1), 16) in ROW_PAYLOAD_SIZES:
            return {"category": "vakaros_incomplete", "subtype": "vkx_truncated"}
    if error.feedback_category == "vakaros_format":
        match = re.fullmatch(r"Unsupported Vakaros VKX revision 0x([0-9A-F]{2})", message)
        if match and int(match.group(1), 16) != VKX_1_4_REVISION:
            return {"category": "vakaros_format"}
    match = re.fullmatch(r"Vakaros VKX contains invalid (SOG|COG|quat_[wxyz]) telemetry", message)
    if match:
        return {"category": "vakaros_sensor"}
    if message == "Vakaros VKX contains no navigation samples":
        return {"category": "vakaros_incomplete", "subtype": "vkx_no_navigation"}
    return {"category": VKX_ERRORS[message]} if message in VKX_ERRORS else None
