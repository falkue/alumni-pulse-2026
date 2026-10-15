"""Tests for pipeline/logic.py — display conditions and logic checks.

We build tiny hand-made data frames where we KNOW the right answer.
"""

import numpy as np
import pandas as pd

from pipeline.codebook import Codebook
from pipeline.logic import add_helper_columns, blank_hidden, display_mask, logic_violations

CB = Codebook.load()


def _frame(**cols):
    """Small helper: a 2-row frame with all export columns, unspecified = NaN."""
    df = pd.DataFrame({name: [np.nan, np.nan] for name in CB.names})
    df["ResponseId"] = ["R_1", "R_2"]
    for k, v in cols.items():
        df[k] = v
    return df


def test_screened_in_requires_consent_and_a_completed_degree():
    df = _frame(consent=[1, 1], edu_deg_master=[1, 2])   # R_2 only enrolled
    assert add_helper_columns(df)["screened_in"].tolist() == [1, 0]


def test_display_mask_treats_missing_like_qualtrics():
    df = pd.DataFrame({"ai_use_freq": [5, np.nan, 2]})
    # "!= 5" is True for missing, "== 1" is False for missing
    assert display_mask(df, "ai_use_freq != 5").tolist() == [False, True, True]
    assert display_mask(df, "ai_use_freq == 1").tolist() == [False, False, False]
    assert display_mask(df, "").tolist() == [True, True, True]


def test_blank_hidden_removes_salary_of_unemployed_person():
    df = _frame(consent=[1, 1], edu_deg_master=[1, 1], job_employed=[1, 2],
                sal_disclose_1=[90000, 50000])
    out = blank_hidden(df, CB)
    assert out.loc[0, "sal_disclose_1"] == 90000
    assert np.isnan(out.loc[1, "sal_disclose_1"])


def test_blank_hidden_cascades_skill_preparation():
    # importance 2 -> preparation question is not shown
    df = _frame(consent=[1, 1], edu_deg_mba=[1, 1],
                pgm_skill_imp_ai=[5, 2], pgm_skill_prep_ai=[2, 4])
    out = blank_hidden(df, CB)
    assert out.loc[0, "pgm_skill_prep_ai"] == 2
    assert np.isnan(out.loc[1, "pgm_skill_prep_ai"])


def test_logic_violations_finds_each_problem_type():
    df = _frame(consent=[1, 1], edu_deg_bachelor=[1, 1], job_employed=[2, 1],
                sal_disclose_1=[70000, 80000],          # R_1 unemployed -> hidden
                pgm_satisfaction=[4, 9],                # R_2 invalid code
                dem_birth_year=[1990, 1850],            # R_2 out of range
                out_soc_chall_1=[1, 1], out_soc_chall_2=[1, np.nan],
                out_soc_chall_3=[1, np.nan], out_soc_chall_5=[1, np.nan],  # R_1: 4 options
                out_econ_chall_20=[np.nan, 1], out_econ_chall_1=[np.nan, 1])  # R_2: "don't know" + other
    v = logic_violations(df, CB)
    found = set(zip(v.ResponseId, v.column, v.problem))
    assert ("R_1", "sal_disclose_1", "answered although hidden") in found
    assert ("R_2", "pgm_satisfaction", "invalid code") in found
    assert ("R_2", "dem_birth_year", "outside range 1936-2007") in found
    assert ("R_1", "out_soc_chall", "more than 3 options") in found
    assert ("R_2", "out_econ_chall", "exclusive option 20 combined") in found


def test_clean_frame_has_no_violations():
    df = _frame(consent=[1, 2], edu_deg_bachelor=[1, np.nan], job_employed=[1, np.nan],
                job_type=[1, np.nan], sal_disclose_1=[60000, np.nan])
    assert logic_violations(df, CB).empty
