"""
Ingest: read a Qualtrics CSV export
===================================

Qualtrics CSV exports have THREE header rows:

    row 1: column names (export tags)        -> used as column names
    row 2: question text                     -> dropped
    row 3: {"ImportId": "QID..."} JSON       -> dropped

This module reads such a file, drops rows 2 and 3, converts numeric columns
to numbers and keeps text/country columns as text. The same function works
for the synthetic file and for the real export.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml

from pipeline.codebook import PROJECT_ROOT, Codebook

SETTINGS = PROJECT_ROOT / "config" / "settings.yaml"

#: Column types that must stay text
TEXT_TYPES = {"text", "country"}
#: Meta columns that must stay text (dates, ids, labels)
TEXT_META = {"ResponseId", "StartDate", "EndDate", "RecordedDate", "UserLanguage",
             "Q_RelevantIDDuplicate", "Distribution"}


def load_settings(path: Path | str = SETTINGS) -> dict:
    """Read config/settings.yaml."""
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def read_qualtrics_csv(path: Path | str, cb: Codebook | None = None) -> pd.DataFrame:
    """Read a Qualtrics export and return one row per response.

    Step by step:
      1. read everything as text (no automatic type guessing),
      2. drop header rows 2 and 3 (question text and ImportId),
      3. convert every non-text column to a number (empty -> NaN),
      4. warn about columns the codebook does not know (e.g. new embedded data).
    """
    cb = cb or Codebook.load()
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    # Step 2: Qualtrics' second header row starts with a question text, the third with {"ImportId"
    if len(df) >= 2 and str(df.iloc[1, 0]).startswith('{"ImportId"'):
        df = df.iloc[2:].reset_index(drop=True)

    # Step 3: types
    for col in df.columns:
        known = col in cb
        is_text = col in TEXT_META or (known and cb[col].type in TEXT_TYPES)
        if is_text:
            df[col] = df[col].replace("", pd.NA)
        else:
            df[col] = pd.to_numeric(df[col].replace("", None), errors="coerce")

    # Step 4: unknown columns are kept but reported
    unknown = [c for c in df.columns if c not in cb]
    df.attrs["unknown_columns"] = unknown
    return df
