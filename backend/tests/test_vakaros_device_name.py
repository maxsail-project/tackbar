import subprocess
import sys
from pathlib import Path

import pytest

from app.parsers.vakaros import extract_vakaros_device_name


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("Atlas.csv", "Atlas"),
        ("Atlas.CSV.GZ", "Atlas"),
        ("Atlas.vkx", "Atlas"),
        ("Atlas.VKX.GZ", "Atlas"),
        ("Fast Atlas 10-10-2026.CSV", "Fast Atlas"),
        ("Fast Atlas 10-10-2026.csv.gz", "Fast Atlas"),
        ("Fast Atlas 10-10-2026.VKX", "Fast Atlas"),
        ("Fast Atlas 10-10-2026.vkx.gz", "Fast Atlas"),
        ("Fast  Atlas.csv", "Fast  Atlas"),
        ("Fast 10-10-2026 Atlas.csv", "Fast 10-10-2026 Atlas"),
        ("Fast  10-10-2026.csv", "Fast"),
        ("Atlas\t10-10-2026.csv", "Atlas"),
        ("Atlas10-10-2026.csv", "Atlas10-10-2026"),
        ("Atlas 10-10-20X6.csv", "Atlas 10-10-20X6"),
        ("Atlas 99-99-2026.csv", "Atlas"),
        ("Atlas 10-10-2026 ", "Atlas 10-10-2026 "),
        ("Atlas 10-10-2026\n", "Atlas\n"),
        ("Atlas 10-10-2026\n.csv", "Atlas\n"),
        ("Atlas 10-10-2026.csv\n", "Atlas 10-10-2026.csv\n"),
    ],
)
def test_extract_vakaros_device_name(filename: str, expected: str) -> None:
    assert extract_vakaros_device_name(filename) == expected


def test_long_malformed_filename_finishes_within_bounded_subprocess() -> None:
    code = (
        "from app.parsers.vakaros import extract_vakaros_device_name\n"
        "filename = 'Atlas' + ' ' * 32768 + '/valid.csv'\n"
        "assert extract_vakaros_device_name(filename) == filename[:-4]\n"
    )
    subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        check=True,
        capture_output=True,
        timeout=5,
    )
