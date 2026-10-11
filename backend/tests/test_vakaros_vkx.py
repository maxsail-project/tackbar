import gzip
import math
import struct
from datetime import datetime, timezone

import pytest

from app.parsers.vakaros_vkx import (
    METRES_PER_SECOND_TO_KNOTS,
    ROW_PAYLOAD_SIZES,
    VKXParseError,
    parse_vakaros_vkx,
)


def _row(key: int, payload: bytes | None = None) -> bytes:
    if payload is None:
        payload = bytes(ROW_PAYLOAD_SIZES[key])
    return bytes([key]) + payload


def _header(revision: int = 0x05) -> bytes:
    return _row(0xFF, bytes([revision]) + bytes(6))


def _position(
    *,
    timestamp_ms: int = 1_938_854_096_789,
    latitude_raw: int = 381_234_567,
    longitude_raw: int = -2_345_678,
    sog: float = 5.0,
    cog: float = math.pi / 2,
    altitude: float = 123.4,
    quat_w: float = 0.5,
    quat_x: float = 0.1,
    quat_y: float = -0.2,
    quat_z: float = 0.8,
) -> bytes:
    return _row(
        0x02,
        struct.pack(
            "<Qii7f",
            timestamp_ms,
            latitude_raw,
            longitude_raw,
            sog,
            cog,
            altitude,
            quat_w,
            quat_x,
            quat_y,
            quat_z,
        ),
    )


def _device_configuration(body_fixed: bool) -> bytes:
    configuration = 1 if body_fixed else 0
    return _row(0x08, struct.pack("<QIB", 0, configuration, 10))


def _quaternion_from_euler(
    *,
    roll: float = 0.0,
    pitch: float = 0.0,
    yaw: float = 0.0,
) -> tuple[float, float, float, float]:
    roll_radians = math.radians(roll)
    pitch_radians = math.radians(pitch)
    yaw_radians = math.radians(yaw)
    cr = math.cos(roll_radians / 2)
    sr = math.sin(roll_radians / 2)
    cp = math.cos(pitch_radians / 2)
    sp = math.sin(pitch_radians / 2)
    cy = math.cos(yaw_radians / 2)
    sy = math.sin(yaw_radians / 2)
    return (
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
    )


def _vkx(*rows: bytes, revision: int = 0x05) -> bytes:
    return _header(revision) + b"".join(rows)


def test_valid_vkx_parses_canonical_activity_and_ignores_altitude() -> None:
    activity = parse_vakaros_vkx(
        _vkx(_position()),
        original_filename="Atlas 10-10-2026.vkx",
    )

    assert activity.source == "vakaros"
    assert activity.original_filename == "Atlas 10-10-2026.vkx"
    assert activity.device_name == "Atlas"
    assert activity.start_time == datetime(
        2031, 6, 10, 10, 34, 56, 789000, tzinfo=timezone.utc
    )
    assert activity.end_time == activity.start_time
    assert activity.start_lat == pytest.approx(38.1234567)
    assert activity.start_lon == pytest.approx(-0.2345678)
    assert activity.center_lat == pytest.approx(38.1234567)
    assert activity.center_lon == pytest.approx(-0.2345678)
    assert activity.min_lat == activity.max_lat == activity.start_lat
    assert activity.min_lon == activity.max_lon == activity.start_lon
    assert activity.samples == [
        {
            "utc": activity.start_time,
            "lat": pytest.approx(38.1234567),
            "lon": pytest.approx(-0.2345678),
            "cog": pytest.approx(90.0),
            "sog": pytest.approx(5.0 * METRES_PER_SECOND_TO_KNOTS),
            "hdg": None,
            "heel": None,
            "trim": None,
            "quat_w": pytest.approx(0.5),
            "quat_x": pytest.approx(0.1),
            "quat_y": pytest.approx(-0.2),
            "quat_z": pytest.approx(0.8),
        }
    ]
    assert "altitude" not in activity.samples[0]


@pytest.mark.parametrize(
    ("cog_radians", "expected_degrees"),
    [
        (-math.pi / 2, 270.0),
        (5 * math.pi, 180.0),
    ],
)
def test_cog_is_normalized_into_one_circle(
    cog_radians: float,
    expected_degrees: float,
) -> None:
    activity = parse_vakaros_vkx(
        _vkx(_position(cog=cog_radians)),
        original_filename="Atlas.vkx",
    )

    assert activity.samples[0]["cog"] == pytest.approx(expected_degrees)
    assert 0 <= activity.samples[0]["cog"] < 360


@pytest.mark.parametrize(
    ("orientation", "expected"),
    [
        ({}, {"hdg": 0.0, "heel": 0.0, "trim": 0.0}),
        ({"yaw": 90.0}, {"hdg": 90.0, "heel": 0.0, "trim": 0.0}),
        ({"yaw": -10.0}, {"hdg": 350.0, "heel": 0.0, "trim": 0.0}),
        ({"roll": 30.0}, {"hdg": 0.0, "heel": 30.0, "trim": 0.0}),
        ({"pitch": -20.0}, {"hdg": 0.0, "heel": 0.0, "trim": -20.0}),
        (
            {"roll": 20.0, "pitch": -15.0, "yaw": 275.0},
            {"hdg": 275.0, "heel": 20.0, "trim": -15.0},
        ),
    ],
)
def test_body_fixed_quaternion_derives_canonical_orientation(
    orientation: dict[str, float],
    expected: dict[str, float],
) -> None:
    quat_w, quat_x, quat_y, quat_z = _quaternion_from_euler(**orientation)

    activity = parse_vakaros_vkx(
        _vkx(
            _device_configuration(True),
            _position(
                quat_w=quat_w,
                quat_x=quat_x,
                quat_y=quat_y,
                quat_z=quat_z,
            ),
        ),
        original_filename="Atlas.vkx",
    )

    sample = activity.samples[0]
    assert sample["hdg"] == pytest.approx(expected["hdg"], abs=1e-5)
    assert sample["heel"] == pytest.approx(expected["heel"], abs=1e-5)
    assert sample["trim"] == pytest.approx(expected["trim"], abs=1e-5)
    assert 0 <= sample["hdg"] < 360


def test_body_orientation_normalizes_copy_and_preserves_raw_quaternion() -> None:
    unit_quaternion = _quaternion_from_euler(yaw=120.0)
    raw_quaternion = tuple(value * 1.1 for value in unit_quaternion)

    activity = parse_vakaros_vkx(
        _vkx(
            _position(
                quat_w=raw_quaternion[0],
                quat_x=raw_quaternion[1],
                quat_y=raw_quaternion[2],
                quat_z=raw_quaternion[3],
            ),
            _device_configuration(True),
        ),
        original_filename="Atlas.vkx",
    )

    sample = activity.samples[0]
    parsed_quaternion = tuple(
        sample[field]
        for field in ("quat_w", "quat_x", "quat_y", "quat_z")
    )
    assert parsed_quaternion == pytest.approx(raw_quaternion)
    assert math.hypot(*parsed_quaternion) == pytest.approx(1.1)
    assert sample["hdg"] == pytest.approx(120.0, abs=1e-5)


@pytest.mark.parametrize(
    ("configurations", "expected_hdg"),
    [
        ([], None),
        ([False], None),
        ([True, False], None),
        ([True, True], 45.0),
    ],
)
def test_file_level_body_frame_evidence_is_conservative(
    configurations: list[bool],
    expected_hdg: float | None,
) -> None:
    quat_w, quat_x, quat_y, quat_z = _quaternion_from_euler(yaw=45.0)
    rows = [
        *(_device_configuration(value) for value in configurations),
        _position(
            quat_w=quat_w,
            quat_x=quat_x,
            quat_y=quat_y,
            quat_z=quat_z,
        ),
    ]

    sample = parse_vakaros_vkx(
        _vkx(*rows),
        original_filename="Atlas.vkx",
    ).samples[0]

    if expected_hdg is None:
        assert sample["hdg"] is None
        assert sample["heel"] is None
        assert sample["trim"] is None
    else:
        assert sample["hdg"] == pytest.approx(expected_hdg, abs=1e-5)
        assert sample["heel"] == pytest.approx(0.0, abs=1e-5)
        assert sample["trim"] == pytest.approx(0.0, abs=1e-5)
    assert sample["quat_w"] == pytest.approx(quat_w)
    assert sample["quat_z"] == pytest.approx(quat_z)


def test_body_frame_configuration_order_does_not_change_orientation() -> None:
    quaternion = _quaternion_from_euler(roll=-12.0, pitch=8.0, yaw=315.0)
    position = _position(
        quat_w=quaternion[0],
        quat_x=quaternion[1],
        quat_y=quaternion[2],
        quat_z=quaternion[3],
    )

    before = parse_vakaros_vkx(
        _vkx(_device_configuration(True), position),
        original_filename="Atlas.vkx",
    )
    after = parse_vakaros_vkx(
        _vkx(position, _device_configuration(True)),
        original_filename="Atlas.vkx",
    )

    assert before.samples == after.samples


def test_body_fixed_effectively_zero_norm_quaternion_is_rejected() -> None:
    with pytest.raises(VKXParseError, match="zero-norm quaternion"):
        parse_vakaros_vkx(
            _vkx(
                _device_configuration(True),
                _position(
                    quat_w=1e-15,
                    quat_x=0.0,
                    quat_y=0.0,
                    quat_z=0.0,
                ),
            ),
            original_filename="Atlas.vkx",
        )


def test_navigation_rows_are_sorted_and_drive_activity_metadata() -> None:
    later = _position(
        timestamp_ms=1_939_018_898_000,
        latitude_raw=383_000_000,
        longitude_raw=-3_000_000,
    )
    earlier = _position(
        timestamp_ms=1_939_018_896_000,
        latitude_raw=381_000_000,
        longitude_raw=-1_000_000,
    )

    activity = parse_vakaros_vkx(
        _vkx(later, earlier),
        original_filename="Atlas.vkx",
    )

    assert [sample["utc"] for sample in activity.samples] == sorted(
        sample["utc"] for sample in activity.samples
    )
    assert activity.start_time == activity.samples[0]["utc"]
    assert activity.end_time == activity.samples[1]["utc"]
    assert activity.start_lat == pytest.approx(38.1)
    assert activity.end_lat == pytest.approx(38.3)
    assert activity.center_lat == pytest.approx(38.2)
    assert activity.min_lon == pytest.approx(-0.3)
    assert activity.max_lon == pytest.approx(-0.1)


def test_documented_non_navigation_rows_are_safely_skipped() -> None:
    documented_rows = [
        _row(key)
        for key in ROW_PAYLOAD_SIZES
        if key not in (0xFF, 0x02)
    ]

    activity = parse_vakaros_vkx(
        _vkx(*documented_rows, _position()),
        original_filename="Atlas.vkx",
    )

    assert len(activity.samples) == 1
    assert set(activity.samples[0]) == {
        "utc",
        "lat",
        "lon",
        "cog",
        "sog",
        "hdg",
        "heel",
        "trim",
        "quat_w",
        "quat_x",
        "quat_y",
        "quat_z",
    }


def test_unknown_row_key_is_rejected_without_scanning_forward() -> None:
    data = _header() + bytes([0x99, 0x02]) + _position()

    with pytest.raises(VKXParseError, match="unknown row key 0x99"):
        parse_vakaros_vkx(data, original_filename="Atlas.vkx")


@pytest.mark.parametrize(
    "row",
    [
        bytes([0x02]) + bytes(43),
        bytes([0x03]) + bytes(19),
    ],
)
def test_truncated_known_row_is_rejected(row: bytes) -> None:
    with pytest.raises(VKXParseError, match="truncated"):
        parse_vakaros_vkx(_header() + row, original_filename="Atlas.vkx")


def test_unsupported_revision_is_rejected() -> None:
    with pytest.raises(VKXParseError, match="Unsupported.*revision 0x04"):
        parse_vakaros_vkx(
            _vkx(_position(), revision=0x04),
            original_filename="Atlas.vkx",
        )


def test_file_without_navigation_rows_is_rejected() -> None:
    with pytest.raises(VKXParseError, match="no navigation samples"):
        parse_vakaros_vkx(
            _vkx(_row(0x03)),
            original_filename="Atlas.vkx",
        )


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"latitude_raw": 910_000_000}, "latitude"),
        ({"longitude_raw": -1_810_000_000}, "longitude"),
        ({"sog": float("nan")}, "SOG"),
        ({"cog": float("inf")}, "COG"),
        ({"quat_w": float("nan")}, "quat_w"),
        ({"quat_x": float("inf")}, "quat_x"),
        ({"quat_y": float("-inf")}, "quat_y"),
        ({"quat_z": float("nan")}, "quat_z"),
    ],
)
def test_invalid_navigation_telemetry_is_rejected(
    overrides: dict[str, object],
    error: str,
) -> None:
    with pytest.raises(VKXParseError, match=error):
        parse_vakaros_vkx(
            _vkx(_position(**overrides)),
            original_filename="Atlas.vkx",
        )


@pytest.mark.parametrize(
    "filename",
    ["Atlas.vkx", "Atlas.VKX", "Atlas.vkx.gz", "Atlas.VKX.GZ"],
)
def test_vkx_and_gzip_suffixes_parse_equivalently(filename: str) -> None:
    raw = _vkx(_position())
    source = gzip.compress(raw) if filename.lower().endswith(".gz") else raw

    activity = parse_vakaros_vkx(source, original_filename=filename)

    assert activity.samples == parse_vakaros_vkx(
        raw,
        original_filename="Atlas.vkx",
    ).samples


def test_corrupt_gzip_is_rejected_cleanly() -> None:
    with pytest.raises(VKXParseError, match="not valid gzip"):
        parse_vakaros_vkx(
            b"not gzip",
            original_filename="Atlas.vkx.gz",
        )
