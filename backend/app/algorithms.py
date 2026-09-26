from __future__ import annotations

from collections.abc import Sequence


def find_two_sum(numbers: Sequence[int], target: int) -> tuple[int, int] | None:
    """Return two values from *numbers* that add to *target*, if they exist.

    Each value is visited once. A set of previously seen values lets us check
    for the required complement in expected O(1) time, giving O(n) expected
    time and O(n) additional space. Duplicate values are handled correctly:
    the same list item cannot pair with itself, but two occurrences can.
    """
    seen: set[int] = set()
    for number in numbers:
        complement = target - number
        if complement in seen:
            return complement, number
        seen.add(number)
    return None
