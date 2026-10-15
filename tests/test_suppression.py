"""Tests for pipeline/suppression.py — small-cell protection."""

from pipeline.suppression import cells_to_suppress, protected_shares


def test_primary_suppression_keeps_zero_and_large_cells():
    counts = {"a": 0, "b": 1, "c": 2, "d": 3, "e": 10}
    # one margin = the total; b and c are hidden (2 hidden -> margin already safe)
    assert cells_to_suppress(counts, [list(counts)], 3) == {"b", "c"}


def test_single_hidden_cell_triggers_secondary_suppression():
    counts = {"a": 1, "b": 4, "c": 9}
    # only 'a' is small; with the total known, a = total - b - c -> also hide b (smallest other)
    assert cells_to_suppress(counts, [["a", "b", "c"]], 3) == {"a", "b"}


def test_secondary_suppression_in_a_two_way_table_reaches_a_fixed_point():
    # rows = age groups, columns = gender; margins = 2 columns + 3 rows
    counts = {("x", "f"): 1, ("x", "m"): 5, ("y", "f"): 6, ("y", "m"): 7, ("z", "f"): 8, ("z", "m"): 9}
    cols = [[("x", "f"), ("y", "f"), ("z", "f")], [("x", "m"), ("y", "m"), ("z", "m")]]
    rows = [[("x", "f"), ("x", "m")], [("y", "f"), ("y", "m")], [("z", "f"), ("z", "m")]]
    hidden = cells_to_suppress(counts, cols + rows, 3)
    # afterwards no margin may contain exactly one hidden cell
    for margin in cols + rows:
        assert sum(k in hidden for k in margin) != 1
    assert ("x", "f") in hidden


def test_hidden_cell_without_visible_partner_is_left_to_the_margin():
    # 'a' is the only non-zero cell: nothing to add, the total itself is small
    assert cells_to_suppress({"a": 2, "b": 0}, [["a", "b"]], 3) == {"a"}


def test_protected_shares_returns_none_for_hidden_cells():
    out = protected_shares({"f": 16, "m": 12, "d": 1}, 29, [["f", "m", "d"]], 3)
    # d (1 person) hidden, then the smallest other (m = 12) to protect it
    assert out == {"f": 55.2, "m": None, "d": None}
