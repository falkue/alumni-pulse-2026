"""Tests for pipeline/aggregate.py — suppression rules and what leaves the pipeline.

Uses a tiny hand-made respondent table so every expected number is known.
"""

import numpy as np
import pandas as pd

from pipeline.aggregate import SCHOOL_FIELDS, build_aggregates, profile
from pipeline.codebook import Codebook

CB = Codebook.load()
SETTINGS = {"reporting": {"min_n_school": 10, "min_n_cell": 1, "min_schools_benchmark": 2,
                          "min_n_benchmark": 10, "benchmark_groups": ["all", "region"]}}


def _respondents(school_id, n, nps):
    df = pd.DataFrame({c: [np.nan] * n for c in CB.names})
    df["school_id"] = school_id
    df["pgm_nps"] = nps
    df["job_employed"] = 1
    for extra in ["nps_group", "agentic_user", "mobile", "salary_ppp_fte_clean", "age", "age_group"] + [f"gap_{k}" for k in CB.skills]:
        df[extra] = np.nan
    return df


def _schools():
    s = pd.DataFrame({f: ["x", "y", "z"] for f in SCHOOL_FIELDS})
    s["school_id"] = ["A", "B", "C"]
    s["region"] = ["Europe", "Europe", "Asia"]
    s["ranking_tier"] = [1, 2, 3]
    s["aacsb"] = [1, 1, 0]
    s["quality_effect"] = [0.5, 0.1, -0.2]          # simulation parameter: must never leave
    s["n_respondents"] = [12, 12, 5]
    return s


def test_salary_disclosed_share_uses_employed_only():
    df = _respondents("A", 4, [9, 9, 9, 9])
    df["job_employed"] = [1, 1, 1, 2]
    df["sal_disclose_2"] = [1, np.nan, np.nan, np.nan]   # 1 of 3 employed declines
    assert profile(df, CB, 1)["career.salary_disclosed.share"] == 66.7


def test_small_school_is_suppressed_everywhere_and_whitelist_applies():
    resp = pd.concat([_respondents("A", 12, 10), _respondents("B", 12, 0), _respondents("C", 5, 9)])
    docs, benches, kpis = build_aggregates(resp, _schools(), CB, SETTINGS)
    # school C has n=5 < min_n_school=10: no metrics in its document nor in the KPI table
    assert docs["C"]["published"] is False and docs["C"]["metrics"] is None
    assert kpis.set_index("school_id").loc["C", "program.nps"] is None or \
        pd.isna(kpis.set_index("school_id").loc["C", "program.nps"])
    # school A is shown: 12 promoters -> NPS +100
    assert docs["A"]["metrics"]["program.nps"] == 100.0
    # simulation parameters never leave the pipeline
    for doc in docs.values():
        assert set(doc["school"]) == set(SCHOOL_FIELDS)
        assert "quality_effect" not in doc["school"] and "n_respondents" not in doc["school"]


def test_benchmark_group_below_minimum_is_not_published():
    resp = pd.concat([_respondents("A", 12, 10), _respondents("B", 12, 0), _respondents("C", 5, 9)])
    _, benches, _ = build_aggregates(resp, _schools(), CB, SETTINGS)
    assert benches["region=Asia"]["published"] is False      # 1 school only
    assert benches["region=Europe"]["published"] is True     # 2 schools, 24 respondents
    # pooled NPS of Europe: 12 promoters + 12 detractors -> 0
    assert benches["region=Europe"]["metrics"]["program.nps"] == 0.0


def test_age_gender_pyramid_sums_to_100_and_excludes_other_genders():
    from pipeline.aggregate import age_gender_pyramid
    df = pd.DataFrame({"age_group": ["25-34", "25-34", "35-44", "45-54", "25-34"],
                       "dem_gender": [1, 2, 2, 1, 99]})            # 99 = prefer not to say
    pyr = age_gender_pyramid(df, 1, min_persons=1)          # protection off: pure arithmetic
    # base = 4 people (female/male): 25-34 f 1, m 1 -> 25 % each; 35-44 m 25 %; 45-54 f 25 %
    assert pyr["25-34"] == {"female": 25.0, "male": 25.0}
    assert pyr["35-44"] == {"female": 0.0, "male": 25.0}
    assert sum(c["female"] + c["male"] for c in pyr.values()) == 100.0
    assert age_gender_pyramid(df, 10) is None


def test_pyramid_cells_sum_to_100_within_rounding_tolerance():
    from pipeline.aggregate import age_gender_pyramid
    # 29 people like the Indus School of Business: thirds and 29ths do not add up exactly
    groups = ["25-34"] * 17 + ["35-44"] * 8 + ["45-54"] * 4
    gender = [1, 2] * 14 + [1]
    pyr = age_gender_pyramid(pd.DataFrame({"age_group": groups, "dem_gender": gender}), 1, min_persons=1)
    total = sum(c["female"] + c["male"] for c in pyr.values())
    # every cell is rounded to 0.1 on its own -> the sum may deviate by up to 6 x 2 x 0.05
    assert abs(total - 100) <= 0.6


def test_pyramid_hides_small_cells_and_cannot_be_recovered_by_subtraction():
    from pipeline.aggregate import age_gender_pyramid
    # 25-34: 9 f / 8 m, 35-44: 4 f / 4 m, 45-54: 1 f / 1 m, 55-64: 1 f / 0 m, <25: 1 f / 0 m
    rows = ([("25-34", 1)] * 9 + [("25-34", 2)] * 8 + [("35-44", 1)] * 4 + [("35-44", 2)] * 4
            + [("45-54", 1), ("45-54", 2), ("55-64", 1), ("< 25", 1)])
    df = pd.DataFrame(rows, columns=["age_group", "dem_gender"])
    pyr = age_gender_pyramid(df, 1, min_persons=3)
    # primary: every 1-person cell is hidden; zero cells stay visible
    for ag, sx in [("45-54", "female"), ("45-54", "male"), ("55-64", "female"), ("< 25", "female")]:
        assert pyr[ag][sx] is None
    assert pyr["65+"] == {"female": 0.0, "male": 0.0} and pyr["55-64"]["male"] == 0.0
    # secondary: no gender column may contain exactly one hidden cell
    for sx in ("female", "male"):
        assert sum(pyr[ag][sx] is None for ag in pyr) != 1
    # large cells stay visible: 25-34 female = 9 of 29 people
    assert pyr["25-34"]["female"] == round(100 * 9 / 29, 1) == 31.0


def test_peers_are_anonymous_exclude_own_school_and_small_schools():
    resp = pd.concat([_respondents("A", 12, 10), _respondents("B", 12, 0), _respondents("C", 5, 9)])
    resp["age"] = [30] * 12 + [40] * 12 + [50] * 5
    docs, _, _ = build_aggregates(resp, _schools(), CB, SETTINGS)
    peers = docs["A"]["benchmarks"]["all"]["peers"]
    assert len(peers) == 1                                   # only B: A is own, C has n < 10
    assert peers[0]["demographics.age.median"] == 40
    assert not any(k in peers[0] for k in ("school_id", "school_name", "n"))
    assert docs["A"]["metrics"]["demographics.age.median"] == 30


def test_demo_all_schools_doc_only_on_request_and_pooled():
    resp = pd.concat([_respondents("A", 12, 10), _respondents("B", 12, 0), _respondents("C", 5, 9)])
    resp["age"] = [30] * 12 + [40] * 12 + [50] * 5
    settings = {"reporting": dict(SETTINGS["reporting"], demo_all_schools_view=True)}
    docs, _, _ = build_aggregates(resp, _schools(), CB, settings)
    assert "ALL" not in docs                                   # not without include_demo
    docs, benches, kpis = build_aggregates(resp, _schools(), CB, settings, include_demo=True)
    d = docs["ALL"]
    assert d["demo"] is True and d["n"] == 29
    assert d["metrics"] == benches["all"]["metrics"]           # pooled = "all" benchmark
    # 12 promoters, 12 detractors, 5 promoters -> (17 - 12) / 29 = +17.2
    assert d["metrics"]["program.nps"] == 17.2
    assert len(d["benchmarks"]["all"]["peers"]) == 2           # A and B (C too small), none excluded
    assert "ALL" not in set(kpis.school_id)                    # KPI table stays school-only


def test_employment_flow_shares_and_protection():
    from pipeline.aggregate import employment_flow
    # 20 people: 12 full-time, 4 part-time, 1 self-employed; 2 seeking work, 1 retired
    df = pd.DataFrame({
        "job_employed": [1] * 17 + [2] * 3,
        "job_type": [1] * 12 + [2] * 4 + [3] + [np.nan] * 3,
        "job_status": [np.nan] * 17 + [3, 3, 2],
    })
    raw = employment_flow(df, 1, min_persons=1)            # protection off: pure arithmetic
    assert raw["employed"]["total"] == 85.0 and raw["not_employed"]["total"] == 15.0
    assert raw["employed"]["full_time"] == 60.0 and raw["employed"]["part_time"] == 20.0
    assert raw["not_employed"]["seeking_work"] == 10.0 and raw["n"] == 20
    prot = employment_flow(df, 1, min_persons=3)
    # 1 self-employed and 1 retired are hidden; each branch then needs a second hidden cell
    assert prot["employed"]["self_employed"] is None and prot["not_employed"]["retired"] is None
    for branch in ("employed", "not_employed"):
        hidden = sum(v is None for k, v in prot[branch].items() if k != "total")
        assert hidden != 1
    assert prot["employed"]["full_time"] == 60.0               # large cell stays visible
    assert employment_flow(df, 50) is None                     # below min_n
