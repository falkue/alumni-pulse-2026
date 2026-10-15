"""Tests for the formulas in pipeline/metrics.py and pipeline/derive.py.

Every expected value below is calculated by hand in the comment next to it.
"""

import numpy as np
import pandas as pd
import pytest

from pipeline import derive, metrics
from pipeline.codebook import Codebook

CB = Codebook.load()
SETTINGS = {"reference_year": 2026, "cleaning": {
    "salary_ppp_min": 3000, "salary_ppp_max": 2_000_000, "salary_robust_z_max": 3.5}}


# ------------------------------------------------------------------ metrics
def test_nps_hand_calculated():
    # 4 promoters (9,10,9,10), 3 passives (7,8,8), 3 detractors (0,5,6) -> 40% - 30% = +10
    s = pd.Series([9, 10, 9, 10, 7, 8, 8, 0, 5, 6, np.nan])
    assert metrics.nps(s) == 10.0


def test_nps_extremes_and_suppression():
    assert metrics.nps(pd.Series([10, 9])) == 100.0
    assert metrics.nps(pd.Series([0, 6])) == -100.0
    assert metrics.nps(pd.Series([10, 9]), min_n=5) is None


def test_top_box_excludes_dont_know():
    # valid base: 5,4,3,2 (99 excluded) -> 2 of 4 = 50 %
    assert metrics.top_box(pd.Series([5, 4, 3, 2, 99, np.nan])) == 50.0


def test_mean_median_share():
    s = pd.Series([1, 2, 3, 4, np.nan])
    assert metrics.mean(s) == 2.5
    assert metrics.median(s) == 2.5
    assert metrics.share(s, [3, 4]) == 50.0
    assert metrics.mean(s, min_n=5) is None


def test_multi_share_uses_people_who_saw_the_question_as_base():
    df = pd.DataFrame({"q_1": [1, np.nan, 1, np.nan], "q_2": [np.nan, 1, np.nan, np.nan]})
    shown = pd.Series([True, True, True, False])
    # base = first three people: q_1 ticked by 2 of 3, q_2 by 1 of 3
    assert metrics.multi_share(df, ["q_1", "q_2"], shown) == {"q_1": 66.7, "q_2": 33.3}


def test_distribution_sums_to_100():
    d = metrics.distribution(pd.Series([1, 1, 2, 5, np.nan]), [1, 2, 3, 4, 5])
    assert d == {1: 50.0, 2: 25.0, 3: 0.0, 4: 0.0, 5: 25.0}
    assert sum(d.values()) == pytest.approx(100)


def test_percentile_rank():
    others = [10, 20, 30, 40]
    assert metrics.percentile_rank(25, others) == 50.0      # 2 below of 4
    assert metrics.percentile_rank(40, others) == 87.5      # 3 below + half a tie
    assert metrics.percentile_rank(None, others) is None


# ------------------------------------------------------------------ derive
def test_age_groups_match_qualtrics_boundaries():
    age, group = derive.age_and_group(pd.Series([2002, 2001, 1992, 1991, 1961, 1950]), 2026)
    assert age.tolist() == [24, 25, 34, 35, 65, 76]
    assert group.tolist() == ["< 25", "25-34", "25-34", "35-44", "65+", "65+"]


def _deg(**kw):
    base = {f"edu_deg_{d}": 4 for d in ["bachelor", "master", "mba", "emba", "phd", "other"]}
    base["edu_other_level"] = np.nan
    base.update(kw)
    return base


def test_highest_degree_precedence_and_other_level():
    df = pd.DataFrame([
        _deg(edu_deg_bachelor=1, edu_deg_master=1),          # Master
        _deg(edu_deg_bachelor=1, edu_deg_mba=2),             # Bachelor (MBA only enrolled)
        _deg(edu_deg_master=1, edu_deg_phd=1),               # PhD
        _deg(edu_deg_bachelor=1, edu_deg_other=1, edu_other_level=3),  # other = MBA level
        _deg(edu_deg_other=1, edu_other_level=6),            # Unclassified
    ])
    assert derive.highest_degree(df).tolist() == ["Master", "Bachelor", "PhD", "MBA", "Unclassified"]


def test_employment_status():
    df = pd.DataFrame({"job_type": [1, 2, 3, np.nan, np.nan], "job_status": [np.nan, np.nan, np.nan, 2, 3]})
    assert derive.employment_status(df).tolist() == [
        "Employed full-time", "Employed part-time", "Self-employed", "Retired", "Not employed"]


def test_nps_group():
    assert derive.nps_group(pd.Series([10, 8, 6, np.nan])).tolist() == ["promoter", "passive", "detractor", pd.NA]


def test_skill_gap_is_importance_minus_preparation():
    df = pd.DataFrame({f"pgm_skill_imp_{k}": [5, 2] for k in CB.skills} |
                      {f"pgm_skill_prep_{k}": [2, np.nan] for k in CB.skills})
    gaps = derive.skill_gaps(df, CB)
    assert gaps.loc[0, "gap_ai"] == 3
    assert np.isnan(gaps.loc[1, "gap_ai"])              # not asked -> no gap


def test_robust_z():
    z = derive.robust_z(pd.Series([10, 10, 10, 10, 11.0]))
    # median 10, |dev| = 0,0,0,0,1 -> MAD 0 -> no spread: fallback z = 0 everywhere
    assert (z == 0).all()
    z = derive.robust_z(pd.Series([10, 10, 11, 9, 10, 100.0]))
    # median 10, |dev| = 0,0,1,1,0,90 -> sorted 0,0,0,1,1,90 -> MAD 0.5
    assert z.iloc[-1] == pytest.approx(90 / (1.4826 * 0.5))
    z = derive.robust_z(pd.Series([8, 9, 10, 11, 12, 40.0]))
    # median 10.5, |dev| = 2.5,1.5,.5,.5,1.5,29.5 -> MAD 1.5 -> z(40) = 29.5/(1.4826*1.5)
    assert z.iloc[-1] == pytest.approx(29.5 / (1.4826 * 1.5))


def test_salary_ppp_fte_and_flags():
    countries = pd.DataFrame({"country": ["Switzerland"], "ppp_lcu_per_intl_dollar": [1.0]})
    n = 30
    df = pd.DataFrame({
        "job_country": ["Switzerland"] * n,
        "job_type": [1] * (n - 1) + [2],
        "job_workload_pct": [np.nan] * (n - 1) + [50],
        "sal_disclose_1": [100000 + 1000 * i for i in range(n - 3)] + [120, 1_500_000, 60000],
    })
    out = derive.salary_variables(df, countries, SETTINGS)
    assert out.loc[n - 3, "salary_flag"] == "implausible"     # 120 CHF a year
    assert out.loc[n - 2, "salary_flag"] == "outlier"          # 1.5 m among ~110 k
    assert out.loc[n - 1, "salary_ppp_fte"] == 120000          # 60k at 50 % -> 120k FTE
    assert out.loc[n - 1, "salary_flag"] == ""
    assert np.isnan(out.loc[n - 3, "salary_ppp_clean"])


def test_position_adjusted_log_salary():
    logs = pd.Series(np.log([100.0, 200.0, 400.0, 50.0, 60.0, 70.0, 80.0]))
    position = pd.Series([1, 1, 1, 4, 4, 4, np.nan])
    out = derive.position_adjusted_log_salary(logs, position, min_group=3)
    # position 1: median log(200), |dev| = log 2, 0, log 2 -> MAD log 2
    assert out.iloc[2] == pytest.approx(np.log(2) / (1.4826 * np.log(2)))
    assert out.iloc[1] == pytest.approx(0.0)
    # position 4 is scaled by its OWN spread (MAD log(60/50)... median of |dev|)
    assert out.iloc[3] == pytest.approx(derive.robust_z(logs.iloc[3:6]).iloc[0])
    assert out.iloc[6] == 0.0                                  # no position: compared with itself only
    # with the default min_group (20) all groups are too small -> one pooled robust z
    pooled = derive.position_adjusted_log_salary(logs, position)
    assert pooled.tolist() == pytest.approx(derive.robust_z(logs).tolist())


def test_position_adjustment_tolerates_scattered_self_employed_incomes():
    """Self-employed incomes scatter widely; a high one is not flagged."""
    countries = pd.DataFrame({"country": ["Switzerland"], "ppp_lcu_per_intl_dollar": [1.0]})
    rng = np.random.default_rng(1)
    employees = list(100000 * np.exp(rng.normal(0, 0.15, 60)))
    founders = list(100000 * np.exp(rng.normal(0, 0.6, 30)))
    df = pd.DataFrame({
        "job_country": "Switzerland", "job_type": [1] * 60 + [3] * 31,
        "job_workload_pct": [np.nan] * 60 + [100] * 31,
        "sal_disclose_1": employees + founders + [450000], "job_position": [4] * 60 + [8] * 31,
    })
    settings = {"cleaning": {**SETTINGS["cleaning"], "salary_robust_z_max": 4.0,
                             "salary_z_adjust_position": True}}
    assert derive.salary_variables(df, countries, settings).salary_flag.iloc[-1] == ""


def test_position_adjustment_finds_a_typo_hidden_by_seniority():
    """A junior typing an extra zero looks like a CEO without the adjustment."""
    countries = pd.DataFrame({"country": ["Switzerland"], "ppp_lcu_per_intl_dollar": [1.0]})
    rng = np.random.default_rng(0)
    # 20 people each in four positions with typical salaries 50k / 100k / 200k / 400k,
    # plus one entry-level person (50k) who typed an extra zero -> 500k
    levels = {6: 50000, 4: 100000, 2: 200000, 1: 400000}
    salaries, positions = [], []
    for pos, typical in levels.items():
        salaries += list(typical * np.exp(rng.normal(0, 0.15, 20)))
        positions += [pos] * 20
    df = pd.DataFrame({
        "job_country": "Switzerland", "job_type": 1, "job_workload_pct": np.nan,
        "sal_disclose_1": salaries + [500_000], "job_position": positions + [6],
    })
    plain = {"cleaning": {**SETTINGS["cleaning"], "salary_robust_z_max": 4.0}}
    adjusted = {"cleaning": {**plain["cleaning"], "salary_z_adjust_position": True}}
    assert derive.salary_variables(df, countries, plain).salary_flag.iloc[-1] == ""
    out = derive.salary_variables(df, countries, adjusted)
    assert out.salary_flag.iloc[-1] == "outlier"
    assert (out.salary_flag.iloc[:-1] == "").all()          # no false alarms among the real ones


def test_quantile_matches_hand_calculation():
    # values 20,30,40,50: lower quartile = 20 + 0.75*(30-20) = 27.5 (linear interpolation)
    s = pd.Series([20, 30, 40, 50, np.nan])
    assert metrics.quantile(s, 0.25) == 27.5
    assert metrics.quantile(s, 0.75) == 42.5
    assert metrics.quantile(s, 0.5, min_n=5) is None
