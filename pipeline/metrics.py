"""
Metrics: the formulas behind every number in the reports
========================================================

All functions take a pandas Series of answers (missing = not asked or not
answered) and return a single number. Missing answers are always excluded
from the base ("valid percent"), which is the usual survey convention.

Each function also returns None when the base is smaller than ``min_n`` so
that tiny groups are suppressed rather than shown.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd


def base_n(s: pd.Series) -> int:
    """Number of valid (non-missing) answers."""
    return int(s.notna().sum())


def _suppress(s: pd.Series, min_n: int) -> bool:
    return base_n(s) < min_n


def nps(scores: pd.Series, min_n: int = 1) -> Optional[float]:
    """Net Promoter Score = % promoters (9-10) - % detractors (0-6), range -100..+100."""
    s = scores.dropna()
    if _suppress(s, min_n):
        return None
    return round(100 * ((s >= 9).mean() - (s <= 6).mean()), 1)


def mean(values: pd.Series, min_n: int = 1, digits: int = 2) -> Optional[float]:
    """Arithmetic mean of valid answers."""
    s = values.dropna()
    if _suppress(s, min_n):
        return None
    return round(float(s.mean()), digits)


def median(values: pd.Series, min_n: int = 1) -> Optional[float]:
    """Median of valid answers (used for salaries)."""
    s = values.dropna()
    if _suppress(s, min_n):
        return None
    return float(s.median())


def quantile(values: pd.Series, q: float, min_n: int = 1) -> Optional[float]:
    """q-quantile of valid answers (0.25 = lower quartile), linear interpolation as in pandas."""
    s = values.dropna()
    if _suppress(s, min_n):
        return None
    return round(float(s.quantile(q)), 2)


def top_box(values: pd.Series, top: tuple = (4, 5), min_n: int = 1) -> Optional[float]:
    """Share (in %) of answers in the top categories, e.g. 'satisfied' + 'very satisfied'.

    Codes outside 1-5 (e.g. 99 = don't know) are excluded from the base.
    """
    s = values.dropna()
    s = s[s.between(1, 5)]
    if _suppress(s, min_n):
        return None
    return round(100 * s.isin(top).mean(), 1)


def share(values: pd.Series, codes, min_n: int = 1) -> Optional[float]:
    """Share (in %) of answers equal to one of ``codes``."""
    s = values.dropna()
    if _suppress(s, min_n):
        return None
    codes = codes if isinstance(codes, (list, tuple, set)) else [codes]
    return round(100 * s.isin(codes).mean(), 1)


def multi_share(df: pd.DataFrame, option_cols: list[str], shown: pd.Series,
                min_n: int = 1) -> dict:
    """Share (in %) of respondents who ticked each option of a multi-select question.

    ``shown`` marks the respondents who saw the question (the base). In the
    export, unticked options are empty, so they count as 0 for people in the base.
    """
    base = df.loc[shown, option_cols]
    if len(base) < min_n:
        return {c: None for c in option_cols}
    return {c: round(100 * (base[c] == 1).mean(), 1) for c in option_cols}


def distribution(values: pd.Series, codes: list, min_n: int = 1) -> Optional[dict]:
    """Percentage distribution across the given codes (sums to 100 on the valid base)."""
    s = values.dropna()
    s = s[s.isin(codes)]
    if _suppress(s, min_n):
        return None
    return {int(c): round(100 * (s == c).mean(), 1) for c in codes}


def percentile_rank(value: float, others: list[float]) -> Optional[float]:
    """Where does ``value`` stand among ``others``? 0 = lowest, 100 = highest.

    Uses the 'mean' definition: ties count half. Used for "your school is in the
    top x % of the benchmark".
    """
    arr = np.array([o for o in others if o is not None and not pd.isna(o)], dtype=float)
    if value is None or len(arr) == 0:
        return None
    below = (arr < value).sum()
    equal = (arr == value).sum()
    return round(100 * (below + 0.5 * equal) / len(arr), 1)
