"""Tests for the calibration metrics in scripts/synthetic/calibration.py.

Each metric is checked on a tiny hand-made table whose correct value can be
worked out on paper.
"""

import numpy as np
import pandas as pd
import pytest

from scripts.synthetic import calibration as cal


def test_nps_formula():
    # 3 promoters (9, 10, 9), 1 passive (7), 2 detractors (6, 0) out of 6 -> (3 - 2) / 6
    assert cal.nps(pd.Series([9, 10, 9, 7, 6, 0])) == pytest.approx(100 / 6)
    assert cal.nps(pd.Series([10, np.nan])) == 100      # missing answers are ignored
    assert np.isnan(cal.nps(pd.Series([], dtype=float)))


def test_position_shares_ignore_missing():
    df = pd.DataFrame({"job_position": [1, 2, 2, 4, np.nan]})
    assert cal.c_level_share(df) == 0.25
    assert cal.senior_mgmt_share(df) == 0.5


def test_school_nps_per_school():
    df = pd.DataFrame({"school_id": ["A", "A", "B", "B"], "pgm_nps": [10, 0, 9, 9]})
    assert cal.school_nps(df).to_dict() == {"A": 0.0, "B": 100.0}


def test_left_tail_and_correlation():
    df = pd.DataFrame({"pgm_nps": [0, 3, 4, 10], "pgm_satisfaction": [1, 2, 3, 5]})
    assert cal.nps_0_3_share(df) == 0.5
    expected = np.corrcoef([0, 3, 4, 10], [1, 2, 3, 5])[0, 1]
    assert cal.corr_nps_satisfaction(df) == pytest.approx(expected)


def test_ai_shares():
    df = pd.DataFrame({"ai_use_freq": [5, 5, 1, 3], "ai_agentic_use": [5, 4, np.nan, 2]})
    assert cal.ai_daily_share(df) == 0.5
    assert cal.agentic_regular_core_share(df) == pytest.approx(2 / 3)   # 1 not asked


def test_n_mentions_and_exactly_3():
    df = pd.DataFrame({
        "out_soc_chall_1": [1, 1, np.nan, np.nan], "out_soc_chall_2": [1, np.nan, np.nan, np.nan],
        "out_soc_chall_3": [1, np.nan, np.nan, np.nan], "out_soc_chall_19": [np.nan, np.nan, 1, np.nan],
        "out_soc_chall_15_TEXT": ["x", None, None, None],          # text column is not a mention
    })
    counts = cal.n_mentions(df, "out_soc_chall")
    assert counts.tolist()[:3] == [3, 1, 1] and np.isnan(counts.iloc[3])
    for stem in ("out_econ_chall", "ai_skill_need"):
        df[f"{stem}_1"] = 1
    shares = cal.multi_exactly_3_share(df)
    assert shares["out_soc_chall"] == pytest.approx(1 / 3)
    assert shares["out_econ_chall"] == 0


def test_female_share_by_group():
    df = pd.DataFrame({"region": ["Asia", "Asia", "Europe"], "dem_gender": [1, 2, 1]})
    assert cal.female_share_by(df, "region").to_dict() == {"Asia": 0.5, "Europe": 1.0}


def test_targets_are_well_formed():
    for name, (lo, hi) in cal.TARGETS.items():
        assert lo is not None or hi is not None, name
        assert lo is None or hi is None or lo < hi, name


def test_word_count_and_negative_markers():
    assert cal.word_count("more data courses") == 3
    assert cal.word_count("n/a") == 1
    assert cal.word_count("我觉得课程内容非常实用而且老师很专业") == 9      # 18 characters / 2
    assert cal.is_negative("Honestly a waste of money")
    assert cal.is_negative("Would not recommend it.")
    assert not cal.is_negative("Great network, loved it")


def test_text_metrics():
    answers = pd.DataFrame({
        "ResponseId": ["R_1", "R_1", "R_2", "R_3"],
        "field": ["pgm_change_one_txt", "ai_opp_concern_4", "pgm_change_one_txt", "pgm_change_one_txt"],
        "language": ["en", "en", "de", "en"],
        "text": ["Outdated courses, poor career service", "n/a", "Mehr Praxis bitte", "Nothing, it was great"],
    })
    nps = pd.Series({"R_1": 3, "R_2": 9, "R_3": 10})
    m = cal.text_metrics(answers, nps)
    assert m["n_answers"] == 4
    assert m["share_non_english"] == 0.25
    assert m["share_up_to_3_words"] == 0.5                 # "n/a" and "Mehr Praxis bitte"
    assert m["negative_share_detractors"] == 1.0           # R_1 (NPS 3)
    assert m["negative_share_promoters"] == 0.0            # R_3 (English only)
    assert m["max_repeats_same_text"] == 1
    assert m["max_repeats_same_opening"] == 1
