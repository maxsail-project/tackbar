import gzip
import logging
import math
import struct
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import BinaryIO

from app.models import Activity, LinePosition, RaceTimerEvent, ShiftAngleObservation
from app.parsers.vakaros import (
    VAKAROS_VKX_SUFFIXES,
    extract_vakaros_device_name,
)


VKX_1_4_REVISION = 0x05
METRES_PER_SECOND_TO_KNOTS = 1.9438444924406
POSITION_ROW = struct.Struct("<Qii7f")
RACE_TIMER_ROW = struct.Struct("<QBi")
LINE_POSITION_ROW = struct.Struct("<QBff")
SHIFT_ANGLE_ROW = struct.Struct("<QBBff")
DEVICE_CONFIGURATION_ROW = struct.Struct("<QIB")
DEVICE_FIXED_TO_BODY_FRAME = 1 << 0
QUATERNION_NORM_EPSILON = 1e-12
ROW_PAYLOAD_SIZES = {
    0xFF: 7,
    0xFE: 2,
    0x01: 32,
    0x02: POSITION_ROW.size,
    0x03: 20,
    0x04: RACE_TIMER_ROW.size,
    0x05: LINE_POSITION_ROW.size,
    0x06: SHIFT_ANGLE_ROW.size,
    0x07: 12,
    0x08: 13,
    0x0A: 16,
    0x0B: 16,
    0x0C: 12,
    0x0E: 16,
    0x0F: 16,
    0x10: 12,
    0x20: 13,
    0x21: 52,
}
logger = logging.getLogger(__name__)


class VKXParseError(ValueError):
    """Raised when Vakaros VKX input is structurally or semantically invalid."""

    def __init__(self, message: str, feedback_category: str | None = None) -> None:
        super().__init__(message)
        self.feedback_category = feedback_category


def parse_vakaros_vkx(
    source: str | Path | bytes | BinaryIO,
    original_filename: str | None = None,
) -> Activity:
    data, filename = _read_source(source, original_filename)
    if filename.lower().endswith(".vkx.gz"):
        try:
            data = gzip.decompress(data)
        except (OSError, EOFError) as error:
            raise VKXParseError("Vakaros VKX.GZ data is not valid gzip") from error
    elif not filename.lower().endswith(".vkx"):
        raise VKXParseError(
            "Vakaros VKX input filename must end with .vkx or .vkx.gz"
        )

    samples, race_timer_events, line_positions, shift_angle_observations = _parse_rows(data)
    samples.sort(key=lambda sample: sample["utc"])
    latitudes = [float(sample["lat"]) for sample in samples]
    longitudes = [float(sample["lon"]) for sample in samples]
    first_sample = samples[0]
    last_sample = samples[-1]
    return Activity(
        source="vakaros",
        original_filename=filename,
        device_name=extract_vakaros_device_name(filename),
        start_time=first_sample["utc"],
        end_time=last_sample["utc"],
        start_lat=first_sample["lat"],
        start_lon=first_sample["lon"],
        end_lat=last_sample["lat"],
        end_lon=last_sample["lon"],
        center_lat=float(median(latitudes)),
        center_lon=float(median(longitudes)),
        min_lat=min(latitudes),
        max_lat=max(latitudes),
        min_lon=min(longitudes),
        max_lon=max(longitudes),
        samples=samples,
        race_timer_events=race_timer_events,
        line_positions=line_positions,
        shift_angle_observations=shift_angle_observations,
    )


def _read_source(
    source: str | Path | bytes | BinaryIO,
    original_filename: str | None,
) -> tuple[bytes, str]:
    if isinstance(source, (str, Path)):
        path = Path(source)
        try:
            return path.read_bytes(), original_filename or path.name
        except OSError as error:
            raise VKXParseError("Vakaros VKX data could not be read") from error
    if original_filename is None:
        raise VKXParseError(
            "original_filename is required when parsing Vakaros data from bytes"
        )
    if isinstance(source, bytes):
        return source, original_filename
    try:
        data = source.read()
    except OSError as error:
        raise VKXParseError("Vakaros VKX data could not be read") from error
    if not isinstance(data, bytes):
        raise VKXParseError("Vakaros VKX input must contain binary data")
    return data, original_filename


def _parse_rows(
    data: bytes,
) -> tuple[
    list[dict[str, object]],
    list[RaceTimerEvent],
    list[LinePosition],
    list[ShiftAngleObservation],
]:
    if not data or data[0] != 0xFF:
        raise VKXParseError("Vakaros VKX must start with a page header")

    samples: list[dict[str, object]] = []
    race_timer_events: list[RaceTimerEvent] = []
    line_positions: list[LinePosition] = []
    shift_angle_observations: list[ShiftAngleObservation] = []
    skipped_timer_rows = 0
    skipped_line_rows = 0
    body_frame_configurations: list[bool] = []
    offset = 0
    while offset < len(data):
        row_key = data[offset]
        offset += 1
        payload_size = ROW_PAYLOAD_SIZES.get(row_key)
        if payload_size is None:
            raise VKXParseError(
                f"Vakaros VKX contains unknown row key 0x{row_key:02X}"
            )
        payload_end = offset + payload_size
        if payload_end > len(data):
            raise VKXParseError(
                f"Vakaros VKX row 0x{row_key:02X} is truncated",
                feedback_category="vakaros_incomplete",
            )
        payload = data[offset:payload_end]
        offset = payload_end

        if row_key == 0xFF:
            revision = payload[0]
            if revision != VKX_1_4_REVISION:
                raise VKXParseError(
                    f"Unsupported Vakaros VKX revision 0x{revision:02X}",
                    feedback_category="vakaros_format",
                )
        elif row_key == 0x02:
            samples.append(_parse_position_row(payload))
        elif row_key == 0x04:
            event = _parse_race_timer_row(payload)
            if event is None:
                skipped_timer_rows += 1
            else:
                race_timer_events.append(event)
        elif row_key == 0x05:
            position = _parse_line_position_row(payload)
            if position is None:
                skipped_line_rows += 1
            else:
                line_positions.append(position)
        elif row_key == 0x06:
            shift_angle_observations.append(_parse_shift_angle_row(payload))
        elif row_key == 0x08:
            body_frame_configurations.append(
                _device_is_fixed_to_body_frame(payload)
            )

    if not samples:
        raise VKXParseError("Vakaros VKX contains no navigation samples")
    if body_frame_configurations and all(body_frame_configurations):
        for sample in samples:
            _derive_body_orientation(sample)
    if skipped_timer_rows or skipped_line_rows:
        logger.warning(
            "Vakaros VKX skipped invalid auxiliary observations: race_timer=%d line_position=%d",
            skipped_timer_rows,
            skipped_line_rows,
        )
    return samples, race_timer_events, line_positions, shift_angle_observations


def _timestamp_from_ms(timestamp_ms: int) -> datetime | None:
    try:
        return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(
            milliseconds=timestamp_ms
        )
    except (OverflowError, ValueError):
        return None


def _parse_race_timer_row(payload: bytes) -> RaceTimerEvent | None:
    timestamp_ms, event_type, timer_value_seconds = RACE_TIMER_ROW.unpack(payload)
    timestamp = _timestamp_from_ms(timestamp_ms)
    if timestamp is None:
        return None
    return RaceTimerEvent(timestamp, event_type, timer_value_seconds)


def _parse_line_position_row(payload: bytes) -> LinePosition | None:
    timestamp_ms, endpoint_type, latitude, longitude = LINE_POSITION_ROW.unpack(payload)
    timestamp = _timestamp_from_ms(timestamp_ms)
    if (
        timestamp is None
        or not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -90.0 <= latitude <= 90.0
        or not -180.0 <= longitude <= 180.0
    ):
        return None
    return LinePosition(timestamp, endpoint_type, latitude, longitude)


def _parse_shift_angle_row(payload: bytes) -> ShiftAngleObservation:
    timestamp_ms, tack_code, setting_origin_code, true_heading_degrees, average_sog_knots = (
        SHIFT_ANGLE_ROW.unpack(payload)
    )
    timestamp = _timestamp_from_ms(timestamp_ms)
    if timestamp is None:
        raise VKXParseError("Vakaros VKX contains invalid Shift Angle timestamp")
    if not math.isfinite(true_heading_degrees) or not 0.0 <= true_heading_degrees <= 360.0:
        raise VKXParseError("Vakaros VKX contains invalid Shift Angle true heading")
    if not math.isfinite(average_sog_knots) or average_sog_knots < 0.0:
        raise VKXParseError("Vakaros VKX contains invalid Shift Angle average SOG")
    return ShiftAngleObservation(
        timestamp, tack_code, setting_origin_code, true_heading_degrees, average_sog_knots
    )


def _device_is_fixed_to_body_frame(payload: bytes) -> bool:
    _unused, configuration, _telemetry_logging_rate = (
        DEVICE_CONFIGURATION_ROW.unpack(payload)
    )
    return bool(configuration & DEVICE_FIXED_TO_BODY_FRAME)


def _derive_body_orientation(sample: dict[str, object]) -> None:
    raw_quaternion = (
        float(sample["quat_w"]),
        float(sample["quat_x"]),
        float(sample["quat_y"]),
        float(sample["quat_z"]),
    )
    norm = math.hypot(*raw_quaternion)
    if norm <= QUATERNION_NORM_EPSILON:
        raise VKXParseError("Vakaros VKX contains invalid zero-norm quaternion")
    w, x, y, z = (value / norm for value in raw_quaternion)

    roll = math.atan2(
        2.0 * (w * x + y * z),
        1.0 - 2.0 * (x * x + y * y),
    )
    pitch_argument = 2.0 * (w * y - z * x)
    pitch = math.asin(max(-1.0, min(1.0, pitch_argument)))
    yaw = math.atan2(
        2.0 * (w * z + x * y),
        1.0 - 2.0 * (y * y + z * z),
    )

    sample["hdg"] = math.degrees(yaw) % 360.0
    sample["heel"] = math.degrees(roll)
    sample["trim"] = math.degrees(pitch)


def _parse_position_row(payload: bytes) -> dict[str, object]:
    (
        timestamp_ms,
        latitude_raw,
        longitude_raw,
        sog_metres_per_second,
        cog_radians,
        _altitude,
        quat_w,
        quat_x,
        quat_y,
        quat_z,
    ) = POSITION_ROW.unpack(payload)

    latitude = latitude_raw * 1e-7
    longitude = longitude_raw * 1e-7
    if not -90.0 <= latitude <= 90.0:
        raise VKXParseError("Vakaros VKX contains invalid latitude")
    if not -180.0 <= longitude <= 180.0:
        raise VKXParseError("Vakaros VKX contains invalid longitude")
    relevant_values = {
        "SOG": sog_metres_per_second,
        "COG": cog_radians,
        "quat_w": quat_w,
        "quat_x": quat_x,
        "quat_y": quat_y,
        "quat_z": quat_z,
    }
    for field_name, value in relevant_values.items():
        if not math.isfinite(value):
            raise VKXParseError(
                f"Vakaros VKX contains invalid {field_name} telemetry"
            )
    timestamp = _timestamp_from_ms(timestamp_ms)
    if timestamp is None:
        raise VKXParseError("Vakaros VKX contains invalid timestamp")

    return {
        "utc": timestamp,
        "lat": latitude,
        "lon": longitude,
        "cog": math.degrees(cog_radians) % 360.0,
        "sog": sog_metres_per_second * METRES_PER_SECOND_TO_KNOTS,
        "hdg": None,
        "heel": None,
        "trim": None,
        "quat_w": quat_w,
        "quat_x": quat_x,
        "quat_y": quat_y,
        "quat_z": quat_z,
    }
