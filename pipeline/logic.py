"""
Survey logic: display conditions and consistency checks
=======================================================

Qualtrics only shows a question when its display condition is true (e.g. the
salary question only to people who are employed). This module re-implements
those conditions on the exported data so we can

* remove answers that should not exist (``blank_hidden``) — used by the
  synthetic generator, and
* list every violation of the survey logic (``logic_violations``) — used as a
  quality check on real and synthetic data alike.

How a condition is evaluated
----------------------------
Conditions in the codebook are pandas query strings such as
``"job_employed == 1 or job_status == 2"``. ``display_mask`` evaluates such a
string row by row and returns True where the question was visible.

Important detail: comparisons with a missing value behave like in Qualtrics.
``ai_use_freq != 5`` is True when ai_use_freq is empty, ``ai_use_freq == 1``
is False. pandas does exactly this, so no extra handling is needed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.codebook import Codebook

#: Degree columns, needed for the helper column ``screened_in``.
DEGREE_COLUMNS = ["edu_deg_bachelor", "edu_deg_master", "edu_deg_mba",
                  "edu_deg_emba", "edu_deg_phd", "edu_deg_other"]


def add_helper_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add columns that conditions refer to but that Qualtrics does not export.

    ``screened_in`` = 1 if the respondent consented AND completed at least one
    degree (otherwise Qualtrics ends the survey after the education block).
    """
    out = df.copy()
    completed_any = (out[DEGREE_COLUMNS] == 1).any(axis=1)
    out["screened_in"] = np.where((out["consent"] == 1) & completed_any, 1, 0)
    return out


def display_mask(df: pd.DataFrame, condition: str) -> pd.Series:
    """Boolean Series: was the question visible for each row?

    An empty condition means "always visible".
    """
    if not condition:
        return pd.Series(True, index=df.index)
    # engine="python" supports `in [..]` lists and `and`/`or` keywords.
    result = df.eval(condition, engine="python")
    return pd.Series(result, index=df.index).fillna(False).astype(bool)


def blank_hidden(df: pd.DataFrame, cb: Codebook) -> pd.DataFrame:
    """Return a copy where every answer to a hidden question is set to NaN.

    Columns are processed in export order, so a question that is hidden
    because an EARLIER answer was blanked is handled correctly (cascade).
    """
    out = add_helper_columns(df)
    for col in cb.columns:
        if col.type == "meta" or col.name not in out.columns:
            continue
        visible = display_mask(out, col.display_if)
        out.loc[~visible, col.name] = np.nan
    return out.drop(columns=["screened_in"])


def logic_violations(df: pd.DataFrame, cb: Codebook, id_col: str = "ResponseId") -> pd.DataFrame:
    """List every row/column where the data break the survey logic.

    Checks, step by step:
      1. answer present although the question was hidden
      2. single-choice code that is not in the codebook
      3. numeric value outside the allowed range
      4. multi-select: more options than ``max_select``
      5. multi-select: an exclusive option ("I don't know") combined with others

    Returns a DataFrame with columns ``[id, column, problem]`` (empty = clean).
    """
    data = add_helper_columns(df)
    problems: list[tuple] = []

    def report(mask: pd.Series, column: str, text: str) -> None:
        for rid in data.loc[mask, id_col]:
            problems.append((rid, column, text))

    for col in cb.columns:
        if col.type == "meta" or col.name not in data.columns:
            continue
        answered = data[col.name].notna() & (data[col.name].astype(str) != "")
        # 1. hidden but answered
        visible = display_mask(data, col.display_if)
        report(answered & ~visible, col.name, "answered although hidden")
        # 2. invalid code
        if col.type in ("single", "multi_option") and col.values:
            num = pd.to_numeric(data[col.name], errors="coerce")
            report(answered & ~num.isin(list(col.values)), col.name, "invalid code")
        # 3. range
        if col.type == "numeric" and col.value_range:
            num = pd.to_numeric(data[col.name], errors="coerce")
            lo, hi = col.value_range
            report(answered & ((num < lo) | (num > hi)), col.name, f"outside range {lo}-{hi}")

    # 4. + 5. multi-select rules, per question
    for question, spec in cb.question_specs.items():
        if spec.get("type") != "multi":
            continue
        cols = [c for c in cb.multi_columns(question) if c in data.columns]
        if not cols:
            continue
        ticked = (data[cols] == 1)
        n_ticked = ticked.sum(axis=1)
        if spec.get("max_select"):
            report(n_ticked > spec["max_select"], question, f"more than {spec['max_select']} options")
        for code in spec.get("exclusive", []):
            excl_col = f"{question}_{code}"
            if excl_col in data.columns:
                report(ticked[excl_col] & (n_ticked > 1), question, f"exclusive option {code} combined")

    return pd.DataFrame(problems, columns=[id_col, "column", "problem"])
