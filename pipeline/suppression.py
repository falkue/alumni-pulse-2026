"""
Small-cell protection (statistical disclosure control)
======================================================

A school sees its own breakdowns, e.g. "age 55-64, female: 3.4 %". With 29
respondents, 3.4 % is ONE person — the school could identify that alumna.
Therefore every cell that represents fewer than ``min_persons`` people
(but more than zero) is suppressed (shown as "< 3" instead of a number).

Why suppressing that one cell is not enough
-------------------------------------------
Totals are published too (share of women, share of an age group, 100 %).
If a column contains exactly ONE suppressed cell, it can be recovered by
subtraction: total minus all visible cells. So we apply *secondary
suppression*: in every margin (a set of cells whose total is known) that has
exactly one suppressed cell, we additionally suppress the smallest other
non-zero cell. We repeat until no margin has a single suppressed cell.

Zero cells are never suppressed: "nobody" does not identify anybody.

Step by step, see :func:`cells_to_suppress`.
"""

from __future__ import annotations

from typing import Hashable, Iterable


def cells_to_suppress(counts: dict[Hashable, int], margins: Iterable[list[Hashable]],
                      min_persons: int) -> set:
    """Return the set of cell keys that must not be published.

    counts       cell key -> number of persons
    margins      groups of cell keys whose total is published (row/column totals);
                 the overall total should be included as one margin
    min_persons  smallest number of persons a published non-zero cell may contain
    """
    margins = [list(m) for m in margins]
    # Step 1: primary suppression — small but non-empty cells
    suppressed = {k for k, c in counts.items() if 0 < c < min_persons}
    # Step 2: secondary suppression until every margin is safe
    changed = True
    while changed:
        changed = False
        for keys in margins:
            hidden = [k for k in keys if k in suppressed]
            if len(hidden) != 1:
                continue
            candidates = [k for k in keys if k not in suppressed and counts[k] > 0]
            if not candidates:
                continue        # the margin total itself is then small and protected there
            # the smallest visible cell protects the hidden one with the least information loss;
            # ties are broken by the key so the result is reproducible
            pick = min(candidates, key=lambda k: (counts[k], str(k)))
            suppressed.add(pick)
            changed = True
    return suppressed


def protected_shares(counts: dict[Hashable, int], base: int, margins: Iterable[list[Hashable]],
                     min_persons: int, digits: int = 1) -> dict:
    """Percentages per cell with protected cells set to None.

    The percentages refer to ``base`` (number of persons), like everywhere in the pipeline.
    """
    hidden = cells_to_suppress(counts, margins, min_persons)
    return {k: (None if k in hidden else round(100 * c / base, digits)) for k, c in counts.items()}
