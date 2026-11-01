"""Known sailing-Class names derived from persisted Boat metadata."""

from app.models import Boat


def normalized_class_name(value: str) -> str:
    return " ".join(value.split())


def known_class_names(boats: list[Boat]) -> dict[str, str]:
    # First persisted spelling wins for historical duplicate values; no Boat
    # record is rewritten and no owner information leaves this helper.
    names: dict[str, str] = {}
    for boat in boats:
        if boat.sailing_class is not None:
            name = normalized_class_name(boat.sailing_class)
            if name:
                names.setdefault(name.casefold(), name)
    return names


def suggested_class_name(submitted: str, known: dict[str, str]) -> str | None:
    key = submitted.casefold()
    if len(key) < 5 or not key.isalpha():
        return None
    matches = (
        name for name in known.values()
        if len(name) >= 5 and name.isalpha()
        and _one_edit_apart(key, name.casefold())
    )
    return next(iter(sorted(matches, key=lambda name: (name.casefold(), name))), None)


def _one_edit_apart(left: str, right: str) -> bool:
    if abs(len(left) - len(right)) > 1:
        return False
    if len(left) == len(right):
        differences = [index for index, pair in enumerate(zip(left, right)) if pair[0] != pair[1]]
        return (len(differences) == 1 or (
            len(differences) == 2
            and differences[1] == differences[0] + 1
            and left[differences[0]] == right[differences[1]]
            and left[differences[1]] == right[differences[0]]
        ))
    longer, shorter = (left, right) if len(left) > len(right) else (right, left)
    return any(longer[:index] + longer[index + 1:] == shorter for index in range(len(longer)))
