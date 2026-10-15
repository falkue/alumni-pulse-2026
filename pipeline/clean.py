"""
Cleaning: decide which responses enter the analysis
===================================================

Every response gets exactly ONE ``case_status``. The rules are applied in
this order (the first rule that fits wins), so that the exclusion table in
the methods section adds up:

    1. no_consent      consent is not "I agree"
    2. screen_out      no completed business degree (Qualtrics ended the survey)
    3. incomplete      Finished = 0 (break-off)
    4. duplicate       Qualtrics flagged the response as a duplicate
    5. bot             reCAPTCHA score below the threshold
    6. speeder         much faster than the median, or straight-lining + fast
    7. unknown_school  school could not be matched to the reference list
    8. valid           everything else

Only ``valid`` responses are used for reports. Thresholds come from
``config/settings.yaml``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.logic import add_helper_columns

#: Rating-matrix column prefixes used for the straight-lining check
MATRIX_PREFIXES = ("pgm_skill_imp_", "pgm_skill_prep_", "pgm_rate_", "ai_org_")


def straightline_items(df: pd.DataFrame) -> pd.Series:
    """Number of rating items if ALL answered matrix items have the same value, else 0.

    Example: 30 answered items, all "4" -> 30. Any variation -> 0.
    """
    cols = [c for c in df.columns if c.startswith(MATRIX_PREFIXES)]
    answered = df[cols].notna().sum(axis=1)
    no_variation = df[cols].nunique(axis=1, dropna=True) <= 1
    return answered.where(no_variation, 0)


def match_schools(df: pd.DataFrame, schools: pd.DataFrame) -> pd.Series:
    """Map the school dropdown text (edu_school_5) to a school_id.

    Matching ignores upper/lower case and surrounding spaces. Unmatched -> NaN.
    """
    key = schools.set_index(schools.school_name.str.strip().str.casefold()).school_id
    return df["edu_school_5"].astype("string").str.strip().str.casefold().map(key)


def classify_cases(df: pd.DataFrame, schools: pd.DataFrame, settings: dict) -> pd.DataFrame:
    """Return a copy of ``df`` with ``school_id``, ``case_status`` and helper flags."""
    cfg = settings["cleaning"]
    out = add_helper_columns(df)
    out["school_id"] = match_schools(out, schools)

    finished = out["Finished"] == 1
    median_dur = out.loc[finished & (out.screened_in == 1), "Duration (in seconds)"].median()
    dur = out["Duration (in seconds)"]
    out["straightline_items"] = straightline_items(out)

    too_fast = dur < cfg["speeder_share_of_median"] * median_dur
    flat_and_fast = ((out.straightline_items >= cfg["straightline_min_items"])
                     & (dur < cfg["straightline_share_of_median"] * median_dur))
    duplicate = out["Q_RelevantIDDuplicate"].astype("string").str.lower().eq("true").fillna(False)

    # Rules in priority order; np.select takes the first condition that is True
    rules = [
        ("no_consent", out["consent"] != 1),
        ("screen_out", out["screened_in"] != 1),
        ("incomplete", ~finished),
        ("duplicate", duplicate),
        ("bot", out["Q_RecaptchaScore"] < cfg["recaptcha_min"]),
        ("speeder", too_fast | flat_and_fast),
        ("unknown_school", out["school_id"].isna()),
    ]
    out["case_status"] = np.select([c.fillna(False).astype(bool) for _, c in rules],
                                   [name for name, _ in rules], default="valid")
    out.attrs["median_duration"] = float(median_dur)
    return out.drop(columns=["screened_in"])


def exclusion_table(classified: pd.DataFrame) -> pd.DataFrame:
    """Counts per case status in rule order — for the methods section."""
    order = ["no_consent", "screen_out", "incomplete", "duplicate", "bot", "speeder",
             "unknown_school", "valid"]
    counts = classified["case_status"].value_counts().reindex(order, fill_value=0)
    return counts.rename_axis("case_status").reset_index(name="n")
