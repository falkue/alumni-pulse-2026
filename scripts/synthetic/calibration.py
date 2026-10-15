"""
Calibration metrics for the synthetic generator
===============================================

The independent QA (qa/QA_report.md, findings M1-M8, G4) compared the
synthetic data with what real alumni surveys look like. This module turns
those checks into small, reusable functions so that

* tests/test_generator.py can assert the target ranges, and
* the QA addendum can be re-measured with one command:

      .venv/bin/python scripts/synthetic/calibration.py

All functions expect a table of VALID interviews (raw answer codes, as in the
Qualtrics export) with an extra column ``school_id``.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

#: Target ranges agreed after the QA review (lower, upper). Used by the tests.
TARGETS = {
    "c_level_share": (0.05, 0.08),          # M1: top management / C-level among those with a position
    "school_nps_sd": (0, 20),               # M2: spread of school NPS
    "school_nps_min": (-25, None),          # M2: target range about -10 .. +65
    "school_nps_max": (None, 70),
    "nps_0_3_share": (0.03, 0.06),          # M3: left tail of the NPS scale
    "corr_nps_satisfaction": (0.50, 0.65),  # M3
    "ai_daily_share": (0.30, 0.35),         # M7
    "agentic_regular_core_share": (0.15, 0.20),  # M7: "regularly" + "core workflow"
    "multi_exactly_3_share": (0.0, 0.65),   # M8: "up to 3" questions, share with exactly 3
}

#: Questions that allow "up to 3" answers (M8).
UP_TO_3 = {"out_soc_chall": 19, "out_econ_chall": 20, "ai_skill_need": None}


def nps(scores: pd.Series) -> float:
    """Net Promoter Score in points: % promoters (9-10) minus % detractors (0-6)."""
    s = scores.dropna()
    if s.empty:
        return float("nan")
    return 100 * ((s >= 9).mean() - (s <= 6).mean())


def c_level_share(df: pd.DataFrame) -> float:
    """Share of 'Top management / C-level / Board' (code 1) among all with a position."""
    pos = df["job_position"].dropna()
    return float((pos == 1).mean())


def senior_mgmt_share(df: pd.DataFrame) -> float:
    """Share of 'Senior management' (code 2) among all with a position."""
    pos = df["job_position"].dropna()
    return float((pos == 2).mean())


def school_nps(df: pd.DataFrame) -> pd.Series:
    """NPS per school (index = school_id)."""
    return df.groupby("school_id")["pgm_nps"].apply(nps)


def nps_0_3_share(df: pd.DataFrame) -> float:
    """Share of NPS answers 0, 1, 2 or 3 (the 'very unhappy' left tail)."""
    return float((df["pgm_nps"].dropna() <= 3).mean())


def corr_nps_satisfaction(df: pd.DataFrame) -> float:
    """Pearson correlation between NPS (0-10) and programme satisfaction (1-5)."""
    return float(df[["pgm_nps", "pgm_satisfaction"]].astype(float).corr().iloc[0, 1])


def ai_daily_share(df: pd.DataFrame) -> float:
    """Share answering 'Daily' (code 5) to the AI-use frequency question."""
    return float((df["ai_use_freq"].dropna() == 5).mean())


def agentic_regular_core_share(df: pd.DataFrame) -> float:
    """Share 'use regularly' (4) or 'core workflow' (5) among those asked about agentic AI."""
    a = df["ai_agentic_use"].dropna()
    return float(a.isin([4, 5]).mean())


def n_mentions(df: pd.DataFrame, stem: str) -> pd.Series:
    """Number of ticked options per respondent for a multi-select question ``stem``.

    Columns look like ``<stem>_<code>``; text columns (``..._TEXT``) are ignored.
    Respondents who were not asked or ticked nothing get NaN.
    """
    cols = [c for c in df.columns if c.startswith(stem + "_") and not c.endswith("_TEXT")
            and c[len(stem) + 1:].isdigit()]
    counts = (df[cols] == 1).sum(axis=1)
    return counts.where(counts > 0)


def multi_exactly_3_share(df: pd.DataFrame) -> dict[str, float]:
    """For every 'up to 3' question: share of respondents with exactly 3 mentions.

    The exclusive "don't know" option counts as one mention.
    """
    return {stem: float((n_mentions(df, stem).dropna() == 3).mean()) for stem in UP_TO_3}


def female_share_by(df: pd.DataFrame, by: str) -> pd.Series:
    """Share of women (dem_gender == 1) per group in column ``by``."""
    return df.groupby(by)["dem_gender"].apply(lambda g: float((g == 1).mean()))


def all_metrics(df: pd.DataFrame) -> dict:
    """Every QA calibration number in one flat dictionary (rounded for reports)."""
    sn = school_nps(df)
    multi = multi_exactly_3_share(df)
    agentic = df["ai_agentic_use"].dropna()
    return {
        "n_valid": int(len(df)),
        "c_level_share": c_level_share(df),
        "senior_mgmt_share": senior_mgmt_share(df),
        "overall_nps": nps(df["pgm_nps"]),
        "school_nps_mean": float(sn.mean()),
        "school_nps_sd": float(sn.std()),
        "school_nps_min": float(sn.min()),
        "school_nps_max": float(sn.max()),
        "nps_0_3_share": nps_0_3_share(df),
        "satisfaction_1_2_share": float((df["pgm_satisfaction"].dropna() <= 2).mean()),
        "corr_nps_satisfaction": corr_nps_satisfaction(df),
        "corr_nps_career_satisfaction": float(df[["pgm_nps", "car_satisfaction"]].astype(float)
                                              .corr().iloc[0, 1]),
        "ai_daily_share": ai_daily_share(df),
        "ai_never_share": float((df["ai_use_freq"].dropna() == 1).mean()),
        "agentic_never_heard_share": float((agentic == 1).mean()),
        "agentic_regular_core_share": agentic_regular_core_share(df),
        "agentic_core_share": float((agentic == 5).mean()),
        **{f"exactly_3_{k}": v for k, v in multi.items()},
        "multi_exactly_3_share": max(multi.values()),
    }


# ----------------------------------------------------------- open answers
#: Rough English markers of a negative statement about the school. Only a
#: proxy to check that the tone follows the NPS (QA: it did not).
NEGATIVE_MARKERS = ("disappoint", "waste", "overpriced", "outdated", "poor", "regret", "useless",
                    "not worth", "terrible", "frustrat", "never again", "rip-off", "lacking", "worst",
                    "mediocre", "unhelpful", "bad ", "angry", "would not recommend", "wouldn't recommend")


def word_count(text: str) -> int:
    """Number of whitespace-separated words (for CJK languages: characters / 2, roughly)."""
    words = str(text).split()
    if len(words) <= 1 and len(str(text)) > 12:      # Chinese / Japanese / Thai without spaces
        return max(1, len(str(text)) // 2)
    return len(words)


def opening(text: str, n: int = 4) -> str:
    """First ``n`` words, lower case, punctuation stripped (same rule as the chunk checker)."""
    from scripts.synthetic.check_text_chunk import opening as _opening
    return _opening(text, n)


def is_negative(text: str) -> bool:
    """True if the text contains one of the NEGATIVE_MARKERS (case-insensitive)."""
    low = f" {str(text).lower()} "
    return any(m in low for m in NEGATIVE_MARKERS)


def text_metrics(answers: pd.DataFrame, nps_by_id: pd.Series) -> dict:
    """QA figures for the open answers.

    ``answers`` is the long table (ResponseId, field, language, text) and
    ``nps_by_id`` maps ResponseId -> NPS score (valid interviews only; answers
    of other respondents are ignored).
    """
    a = answers[answers.ResponseId.isin(nps_by_id.index)].copy()
    a["words"] = a.text.map(word_count)
    a["nps"] = a.ResponseId.map(nps_by_id)
    longer = a[a.words > 3]
    school_fields = a[a.field.isin(["pgm_change_one_txt", "pgm_most_valuable_tx", "final_comments_txt"])
                      & (a.language == "en")]
    detr = school_fields[school_fields.nps <= 6]
    prom = school_fields[school_fields.nps >= 9]
    return {
        "n_answers": int(len(a)),
        "share_non_english": float((a.language != "en").mean()),
        "mean_words": float(a.words.mean()),
        "sd_words": float(a.words.std()),
        "share_up_to_3_words": float((a.words <= 3).mean()),
        "max_repeats_same_text": int(longer.text.str.lower().value_counts().max()) if len(longer) else 0,
        # most frequent opening (first four words) within one field, e.g. "schools should teach how"
        "max_repeats_same_opening": int(longer.assign(op=longer.text.map(opening))
                                        .groupby(["field", "op"]).size().max()) if len(longer) else 0,
        "negative_share_detractors": float(detr.text.map(is_negative).mean()) if len(detr) else float("nan"),
        "negative_share_promoters": float(prom.text.map(is_negative).mean()) if len(prom) else float("nan"),
    }


def load_valid(export_csv: Path | None = None, truth_csv: Path | None = None) -> pd.DataFrame:
    """Valid interviews of the synthetic export with ``school_id`` attached (truth file)."""
    from pipeline.codebook import Codebook
    from pipeline.ingest import read_qualtrics_csv

    syn = ROOT / "data" / "synthetic"
    export_csv = export_csv or syn / "alumni_pulse_2026_synthetic_qualtrics.csv"
    truth_csv = truth_csv or syn / "ground_truth.csv"
    df = read_qualtrics_csv(export_csv, Codebook.load())
    truth = pd.read_csv(truth_csv)
    valid = truth.loc[truth.case_type == "valid", ["ResponseId", "school_id"]]
    return df.merge(valid, on="ResponseId", how="inner")


def main() -> None:
    df = load_valid().copy()
    for k, v in all_metrics(df).items():
        print(f"{k:32s} {v:10.3f}" if isinstance(v, float) else f"{k:32s} {v:>10}")
    schools = pd.read_csv(ROOT / "data" / "reference" / "schools.csv").set_index("school_id")
    df["region"] = df.school_id.map(schools.region)
    df["institution_type"] = df.school_id.map(schools.institution_type)
    print("\nfemale share by region:\n", female_share_by(df, "region").round(3).to_string())
    print("\nfemale share by institution type:\n", female_share_by(df, "institution_type").round(3).to_string())
    print("\nAI daily by region:\n", df.groupby("region").ai_use_freq.apply(lambda s: (s == 5).mean()).round(3).to_string())
    sn = school_nps(df).to_frame("nps").join(schools[["ranking_tier"]])
    print("\nschool NPS by tier (mean, sd):\n", sn.groupby("ranking_tier").nps.agg(["mean", "std"]).round(1).to_string())


if __name__ == "__main__":
    main()
