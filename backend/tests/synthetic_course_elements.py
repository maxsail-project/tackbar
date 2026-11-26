"""Deterministic synthetic course-elements GPX for Issue #242 tests.

Entirely invented: track names only follow GeoRacing naming patterns, and the
positions are local metre offsets around an arbitrary open-water origin. No
coordinates or timings are derived from any provider export.

Scenario (T0 = 2031-03-14T10:00:00Z, 60 minutes, one sample every 2 s):

- ``Race committee`` laid at the origin until T0+50 min, with silences of
  40 s and 60 s (bridged) and one of 180 s (splits the interval), then moved
  away and laid again for the last 5 minutes.
- ``Start Pin`` 150 m east of the committee boat until +20 min, relocated to
  a second position until +40 min, then slowly recovered to the base.
- ``Finish Pin`` laid elsewhere, then from +13 min takes the start pin's
  first position until +53 min.
- Gate W (``Buoy W1``/``Buoy W2``, 80 m apart) laid until +45 / +46 min,
  then recovered.
- Gate (``Gate A``/``Gate B``, 90 m apart) laid until +30 / +29 min, then
  relocated 200 m north until +55 min.
- ``Change Mark`` roams on a 250 m circle with one 200 s hold.
- ``Spare 1`` / ``Spare 2`` duplicate the start pin / change mark with about
  2-3 m noise, a few ~10 m outliers and dropped samples.
- ``SPARE`` never leaves the base.
"""

from datetime import datetime, timedelta, timezone
import math
import random


T0 = datetime(2031, 3, 14, 10, 0, tzinfo=timezone.utc)
DURATION_S = 3600
STEP_S = 2
ORIGIN_LAT, ORIGIN_LON = 10.25, -30.5  # arbitrary open water
_M_PER_DEG_LAT = 111_320.0
_M_PER_DEG_LON = _M_PER_DEG_LAT * math.cos(math.radians(ORIGIN_LAT))

BASE = (-800.0, -400.0)
RC = (0.0, 0.0)
RC_LATE = (-600.0, -300.0)
PIN_1 = (150.0, 0.0)
PIN_2 = (100.0, -60.0)
FINISH_0 = (400.0, 300.0)
W1, W2 = (0.0, 2000.0), (80.0, 2000.0)
GATE_A_1, GATE_B_1 = (60.0, 400.0), (150.0, 400.0)
GATE_A_2, GATE_B_2 = (60.0, 600.0), (150.0, 600.0)
CHANGE_CENTRE, CHANGE_RADIUS, CHANGE_PERIOD_S = (40.0, 1700.0), 250.0, 600.0
CHANGE_HOLD = (1500, 1700)

NAMES = [
    "Buoy W1", "Buoy W2", "Change Mark", "Finish Pin", "Gate A", "Gate B",
    "Race committee", "SPARE", "Spare 1", "Spare 2", "Start Pin",
]


def to_latlon(east_north: tuple[float, float]) -> tuple[float, float]:
    east, north = east_north
    return ORIGIN_LAT + north / _M_PER_DEG_LAT, ORIGIN_LON + east / _M_PER_DEG_LON


def at(minutes: float) -> datetime:
    return T0 + timedelta(seconds=round(minutes * 60))


def _keyframes(*frames):
    """Piecewise-linear path through (t, (east, north)) keyframes."""
    def path(t):
        for (t0, p0), (t1, p1) in zip(frames, frames[1:]):
            if t0 <= t <= t1:
                f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
                return p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
        return frames[-1][1]
    return path


def _change_mark(t):
    hold_start, hold_end = CHANGE_HOLD
    if hold_start <= t <= hold_end:
        t = hold_start
    elif t > hold_end:
        t -= hold_end - hold_start
    angle = 2 * math.pi * t / CHANGE_PERIOD_S
    return (
        CHANGE_CENTRE[0] + CHANGE_RADIUS * math.cos(angle),
        CHANGE_CENTRE[1] + CHANGE_RADIUS * math.sin(angle),
    )


PATHS = {
    "Race committee": _keyframes((0, RC), (3000, RC), (3300, RC_LATE), (3600, RC_LATE)),
    "Start Pin": _keyframes((0, PIN_1), (1200, PIN_1), (1380, PIN_2), (2400, PIN_2), (3600, BASE)),
    "Finish Pin": _keyframes((0, FINISH_0), (600, FINISH_0), (780, PIN_1), (3200, PIN_1), (3600, RC_LATE)),
    "Buoy W1": _keyframes((0, W1), (2700, W1), (3600, BASE)),
    "Buoy W2": _keyframes((0, W2), (2760, W2), (3600, BASE)),
    "Gate A": _keyframes((0, GATE_A_1), (1800, GATE_A_1), (1920, GATE_A_2), (3300, GATE_A_2), (3600, BASE)),
    "Gate B": _keyframes((0, GATE_B_1), (1740, GATE_B_1), (1860, GATE_B_2), (3300, GATE_B_2), (3600, BASE)),
    "Change Mark": _change_mark,
    "SPARE": _keyframes((0, BASE), (3600, BASE)),
}
PATHS["Spare 1"] = PATHS["Start Pin"]
PATHS["Spare 2"] = PATHS["Change Mark"]

# Committee-boat silences: (last sample before, first sample after), in seconds.
RC_SILENCES = ((600, 640), (1200, 1260), (1800, 1980))


def _samples(name: str, seed: int):
    rng = random.Random(seed)
    path = PATHS[name]
    duplicate = name in ("Spare 1", "Spare 2")
    sigma = {"Spare 1": 1.8, "Spare 2": 2.0, "SPARE": 0.4}.get(name, 1.0)
    # A duplicate tracker sits on the same object and swings with it.
    swing = 0.0 if name == "SPARE" else 3.0
    start = 10 if name == "Spare 2" else 0
    samples = []
    for index, t in enumerate(range(start, DURATION_S + 1, STEP_S)):
        if name == "Race committee" and any(a < t < b for a, b in RC_SILENCES):
            continue
        if duplicate and index % (5 if name == "Spare 1" else 6) == 4:
            continue  # tracker dropouts
        east, north = path(t)
        noise = (rng.gauss(0, sigma), rng.gauss(0, sigma))
        if duplicate and index % 97 == 50:
            noise = (10.0, 0.0)  # worst-case disagreement, about 10 m
        east += swing * math.sin(t / 40) + noise[0]
        north += swing * math.cos(t / 55) + noise[1]
        samples.append((t, *to_latlon((east, north))))
    return samples


def elements_gpx() -> bytes:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="SYNTHETIC">',
        "<metadata><name>SYNTHETIC</name></metadata>",
        "<name>Synthetic Race 7</name>",
    ]
    for seed, name in enumerate(NAMES, start=1):
        lines.append(f"<trk><name>{name}</name><trkseg>")
        for t, lat, lon in _samples(name, seed):
            stamp = (T0 + timedelta(seconds=t)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            lines.append(
                f'<trkpt lat="{lat:.7f}" lon="{lon:.7f}"><ele>0</ele><time>{stamp}</time></trkpt>'
            )
        lines.append("</trkseg></trk>")
    lines.append("</gpx>")
    return ("\n".join(lines) + "\n").encode()
