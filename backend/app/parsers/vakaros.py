import re
from pathlib import Path
from typing import BinaryIO

from app.models import Activity


VAKAROS_CSV_SUFFIXES = (".csv.gz", ".csv")
VAKAROS_VKX_SUFFIXES = (".vkx.gz", ".vkx")
VAKAROS_ATTACHMENT_SUFFIXES = (
    *VAKAROS_CSV_SUFFIXES,
    *VAKAROS_VKX_SUFFIXES,
)


def is_supported_vakaros_attachment(value: str) -> bool:
    return value.lower().endswith(VAKAROS_ATTACHMENT_SUFFIXES)


def parse_vakaros_attachment(
    source: str | Path | bytes | BinaryIO,
    original_filename: str | None = None,
) -> Activity:
    filename = original_filename
    if filename is None and isinstance(source, (str, Path)):
        filename = Path(source).name
    if filename is None:
        raise ValueError(
            "original_filename is required when parsing Vakaros data from bytes"
        )
    if filename.lower().endswith(VAKAROS_CSV_SUFFIXES):
        from app.parsers.vakaros_csv import parse_vakaros_csv

        return parse_vakaros_csv(source, original_filename=filename)
    if filename.lower().endswith(VAKAROS_VKX_SUFFIXES):
        from app.parsers.vakaros_vkx import parse_vakaros_vkx

        return parse_vakaros_vkx(source, original_filename=filename)
    raise ValueError(
        "Vakaros input filename must end with .csv, .csv.gz, .vkx or .vkx.gz"
    )


def extract_vakaros_device_name(filename: str) -> str:
    name = filename
    for suffix in VAKAROS_ATTACHMENT_SUFFIXES:
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
            break
    date_suffix = re.search(r"\s\d{1,2}-\d{1,2}-\d{4}$", name)
    if date_suffix is None:
        return name
    return name[: date_suffix.start()].rstrip() + name[date_suffix.end() :]
