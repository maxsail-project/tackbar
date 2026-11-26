"""GeoRacing track-name -> course-role suggestions (Issue #242, D5).

This is the only provider-specific module of the course package. GeoRacing
track names are free text: the table only *suggests* a role for Admin review and
never decides one. Labels keep the provider's track names unchanged.
"""

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class RoleSuggestion:
    role: str  # one of app.course.schema.ROLE_VOCABULARY
    gate: str | None
    basis: str  # "name_table" or "unrecognized_name"


def _gate_from_buoy(match: re.Match) -> str:
    # "Buoy M1" / "Buoy M2" -> gate "M".
    return match.group(1).upper()


# Ordered (pattern on the normalized lower-case name, role, gate id or factory).
_TABLE: tuple[tuple[re.Pattern, str, object], ...] = (
    (re.compile(r"(race )?committee( boat)?|rc( boat)?|signal boat"), "committee_boat", None),
    (re.compile(r"start pin|pin( end)?"), "start_pin", None),
    (re.compile(r"finish pin"), "finish_pin", None),
    (re.compile(r"change mark|change"), "change_mark", None),
    (re.compile(r"buoy ([a-z])\d+"), "gate", _gate_from_buoy),
    # "Gate A" / "Gate B": two members of one gate named by the shared stem.
    (re.compile(r"gate [a-z0-9]+"), "gate", "Gate"),
    (re.compile(r"spare( \d+)?"), "ignored", None),
    (re.compile(r"(buoy|mark) .+|.+ mark|mark"), "mark", None),
)


def suggest_role(track_name: str) -> RoleSuggestion:
    normalized = " ".join(track_name.lower().split())
    for pattern, role, gate in _TABLE:
        match = pattern.fullmatch(normalized)
        if match is None:
            continue
        gate_id = gate(match) if callable(gate) else gate
        return RoleSuggestion(role=role, gate=gate_id, basis="name_table")
    # Unknown names never invent a course element; the Admin opts in.
    return RoleSuggestion(role="ignored", gate=None, basis="unrecognized_name")
