"""
Value labels: turn numeric codes into readable text
===================================================

Used for Excel exports and for anybody who wants to look at the data without
the codebook at hand. Single-choice codes become their label (5 ->
"Very satisfied"), ticked multi-select options become "x", and column names
can optionally be replaced by their labels.
"""

from __future__ import annotations

import pandas as pd

from pipeline.codebook import Codebook


def apply_labels(df: pd.DataFrame, cb: Codebook, rename_columns: bool = False) -> pd.DataFrame:
    """Return a copy with code labels instead of numbers.

    * single-choice columns with value labels -> label text (unknown codes stay as they are)
    * multi-select option columns -> "x" where ticked
    * numeric, text, meta and unknown columns -> unchanged
    """
    out = df.copy()
    for col in out.columns:
        if col not in cb:
            continue
        c = cb[col]
        if c.type == "multi_option":
            out[col] = out[col].map(lambda v: "x" if v == 1 else "")
        elif c.type == "single" and c.values:
            out[col] = out[col].map(lambda v, vals=c.values: _label(v, vals))
    if rename_columns:
        out = out.rename(columns={col: f"{col} | {cb[col].label}" for col in out.columns if col in cb})
    return out


def _label(value, values: dict):
    if pd.isna(value):
        return ""
    try:
        return values.get(int(value), value)
    except (TypeError, ValueError):
        return value
