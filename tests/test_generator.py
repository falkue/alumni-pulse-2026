"""Tests for scripts/synthetic/generate.py.

Two kinds of tests:
* helper functions with exactly known results, and
* a small end-to-end run (3 schools) that must respect the survey logic.
"""

import math

import numpy as np
import pandas as pd
import pytest

from pipeline.codebook import Codebook
from pipeline.logic import blank_hidden, logic_violations
from scripts.synthetic import calibration as cal
from scripts.synthetic import generate as g

CB = Codebook.load()


# ----------------------------------------------------------------- helpers
def test_likert_stays_in_range_and_follows_the_mean():
    rng = np.random.default_rng(0)
    draws = [g.likert(4.2, rng) for _ in range(4000)]
    assert min(draws) >= 1 and max(draws) <= 5
    assert abs(np.mean(draws) - 4.2) < 0.15        # clipping pulls slightly down
    assert g.likert(99, rng) == 5 and g.likert(-99, rng) == 1


def test_threshold_category():
    cuts = [-1, 0, 1]
    assert [g.threshold_category(x, cuts) for x in (-2, -1, -0.5, 0.5, 1, 2)] == [1, 2, 2, 3, 4, 4]


def test_pick_up_to_respects_k_and_zero_weights():
    rng = np.random.default_rng(1)
    for _ in range(200):
        picked = g.pick_up_to({1: 5, 2: 0, 3: 1, 4: 1}, 3, rng)
        assert len(picked) == 3 and 2 not in picked and len(set(picked)) == 3
    assert g.pick_up_to({1: 0}, 2, rng) == []
    assert sorted(g.pick_up_to({1: 1, 2: 1}, 5, rng)) == [1, 2]


def test_bernoulli_set_never_empty_when_required():
    rng = np.random.default_rng(2)
    assert g.bernoulli_set({1: 0.0, 2: 0.0001}, rng) == [2]
    assert g.bernoulli_set({1: 0.0}, rng, at_least_one=False) == []


def test_experience_factor_is_one_at_nine_years_and_increasing():
    assert g.experience_factor(9) == pytest.approx(1.0)
    values = [g.experience_factor(y) for y in range(0, 40, 5)]
    assert values == sorted(values)
    assert g.experience_factor(0) == pytest.approx(0.55 / (0.55 + 0.6 * (1 - math.exp(-1))))


def test_round_like_a_human():
    rng = np.random.default_rng(3)
    vals = [g.round_like_a_human(123456.7, rng) for _ in range(1000)]
    assert set(vals) <= {123000, 125000, 123457}
    assert 0.5 < np.mean([v == 123000 for v in vals]) < 0.7


def test_truncate_after_block_keeps_only_earlier_blocks():
    r = {"consent": 1, "dem_birth_year": 1990, "job_employed": 1, "pgm_nps": 9, "ResponseId": "R_x"}
    out = g.truncate_after_block(r, CB, "Employment")
    assert out == {"consent": 1, "dem_birth_year": 1990, "job_employed": 1, "ResponseId": "R_x"}


# ---------------------------------------------------------- end to end
@pytest.fixture(scope="module")
def small_run():
    schools = pd.read_csv(g.REF / "schools.csv").iloc[[0, 25, 40]].copy()
    schools["n_respondents"] = [60, 60, 60]
    return g.generate(seed=11, schools=schools), schools


def test_each_school_gets_exactly_its_valid_interviews(small_run):
    (df, truth), schools = small_run
    valid = truth[truth.case_type == "valid"]
    assert valid.school_id.value_counts().to_dict() == {s: 60 for s in schools.school_id}


def test_simulator_itself_produces_no_hidden_answers():
    """blank_hidden() must not change anything the simulator produced."""
    rng = np.random.default_rng(5)
    schools = pd.read_csv(g.REF / "schools.csv")
    countries = pd.read_csv(g.REF / "countries.csv", keep_default_na=False)
    sim = g.Simulator(schools, countries, CB, rng)
    rows = [sim.respondent(schools.iloc[i % 50])[0] for i in range(300)]
    df = pd.DataFrame(rows).reindex(columns=CB.names)
    df["ResponseId"] = [f"R_{i}" for i in range(len(df))]
    cleaned = blank_hidden(df, CB)
    changed = (df.notna() != cleaned.notna()).sum()
    assert changed[changed > 0].empty, f"simulator wrote hidden answers: {changed[changed > 0].to_dict()}"


def test_valid_interviews_have_no_logic_violations(small_run):
    (df, truth), _ = small_run
    valid = df[df.ResponseId.isin(truth.loc[truth.case_type == "valid", "ResponseId"])]
    v = logic_violations(valid, CB)
    assert v.empty, v.head(20).to_string()


def test_dirty_cases_are_present(small_run):
    (df, truth), _ = small_run
    kinds = set(truth.case_type)
    assert {"valid", "partial", "no_consent", "screen_out", "speeder"} <= kinds
    assert (df.loc[df.consent == 2].drop(columns=[c for c in df.columns if c.startswith(("Start", "End", "Rec", "Resp", "Dur", "Fin", "Prog", "Stat", "User", "Q_", "Distr"))])
            .drop(columns="consent").isna().all(axis=None))


def test_salary_only_for_employed(small_run):
    (df, _), _ = small_run
    assert df.loc[df.job_employed != 1, "sal_disclose_1"].isna().all()


# ------------------------------------------- calibration helpers (QA M8, G4)
def test_degree_probabilities_apply_regional_tilt_and_sum_to_one():
    shares = {"bachelor": 0.2, "master": 0.4, "mba": 0.2, "emba": 0.1, "phd": 0.1}
    p_am = g.degree_probabilities(shares, "Americas")
    p_eu = g.degree_probabilities(shares, "Europe")
    assert p_am.sum() == pytest.approx(1.0) and p_eu.sum() == pytest.approx(1.0)
    mba = g.DEGREES.index("mba")
    assert p_am[mba] > 0.2 > p_eu[mba]            # more MBAs in the Americas, fewer in Europe
    # unknown region: the school's own shares, only re-normalised
    assert list(g.degree_probabilities(shares, "Mars")) == pytest.approx([0.2, 0.4, 0.2, 0.1, 0.1])
    # a degree a school does not award stays impossible
    assert g.degree_probabilities({**shares, "phd": 0.0}, "Asia")[g.DEGREES.index("phd")] == 0


def test_female_probability_by_region_degree_and_limits():
    assert g.female_probability("Europe", "master") == pytest.approx(0.47 + 0.02)
    assert g.female_probability("Asia", "emba") == pytest.approx(0.36 - 0.12)
    assert g.female_probability("Asia", "mba") < g.female_probability("Europe", "mba")
    assert g.female_probability("Europe", "bachelor", 0.5) == 0.70     # clipped at the top
    assert g.female_probability("Asia", "emba", -0.5) == 0.15          # clipped at the bottom


def test_n_mentions_up_to_3_is_variable():
    rng = np.random.default_rng(4)
    draws = np.array([g.n_mentions_up_to_3(rng) for _ in range(5000)])
    assert set(draws) == {1, 2, 3}
    assert abs((draws == 3).mean() - 0.42) < 0.03 and abs((draws == 1).mean() - 0.22) < 0.03


# ------------------------------- target ranges after the QA review (full run)
@pytest.fixture(scope="module")
def full_run():
    """The real 50-school dataset with the default seed, valid interviews only."""
    df, truth = g.generate(seed=2026)
    valid = truth.loc[truth.case_type == "valid", ["ResponseId", "school_id"]]
    out = df.merge(valid, on="ResponseId")
    schools = pd.read_csv(g.REF / "schools.csv").set_index("school_id")
    out["region"] = out.school_id.map(schools.region)
    return out


@pytest.mark.parametrize("metric", sorted(cal.TARGETS))
def test_calibration_target_ranges(full_run, metric):
    """Every QA target range (scripts/synthetic/calibration.TARGETS) is met."""
    value = cal.all_metrics(full_run)[metric]
    lo, hi = cal.TARGETS[metric]
    assert lo is None or value >= lo, f"{metric} = {value:.3f} below {lo}"
    assert hi is None or value <= hi, f"{metric} = {value:.3f} above {hi}"


def test_c_level_below_ten_percent_and_below_senior_plus_middle(full_run):
    """M1: C-level < 10 % and the pyramid is a pyramid (C-level < senior < middle)."""
    pos = full_run.job_position.dropna()
    share = pos.value_counts(normalize=True)
    assert share[1] < 0.10
    assert share[1] < share[2] < share[3]


def test_school_nps_sd_below_20(full_run):
    """M2: school NPS spread below 20 points, overall NPS still clearly positive."""
    assert cal.school_nps(full_run).std() < 20
    assert 20 <= cal.nps(full_run.pgm_nps) <= 40


def test_gender_and_degree_mix_differ_by_region(full_run):
    """G4: fewer women in Asian schools; more MBAs among alumni in the Americas."""
    fem = cal.female_share_by(full_run, "region")
    assert fem["Asia"] < fem["Europe"] - 0.05
    mba = full_run.groupby("region").edu_deg_mba.apply(lambda s: (s == 1).mean())
    assert mba["Americas"] > mba["Europe"] + 0.05


# ------------------------------------------------ open-answer requests (QA texts)
def test_tone_from_nps_boundaries():
    assert [g.tone_from_nps(s) for s in (0, 3, 4, 6, 7, 8, 9, 10)] == [
        "very negative", "very negative", "critical", "critical", "mixed", "mixed", "positive", "positive"]


def test_answer_style_distribution():
    rng = np.random.default_rng(8)
    draws = pd.Series([g.answer_style(rng) for _ in range(6000)]).value_counts(normalize=True)
    assert set(draws.index) == set(g.ANSWER_STYLES)
    for style, p in g.ANSWER_STYLES.items():
        assert abs(draws[style] - p) < 0.03


def test_text_requests_carry_tone_styles_and_local_language(small_run):
    (df, truth), schools = small_run
    valid_ids = truth.loc[truth.case_type == "valid", "ResponseId"]
    valid = df[df.ResponseId.isin(valid_ids)]
    tr = truth.set_index("ResponseId").loc[valid.ResponseId].reset_index()
    tr.index = valid.index
    req = g.text_requests(valid, tr, pd.read_csv(g.REF / "schools.csv"), CB, np.random.default_rng(1))
    assert not req.empty
    for row in req.itertuples():
        assert row.tone == g.tone_from_nps(row.profile["nps"])
        assert set(row.styles) == set(row.fields)
        assert set(row.styles.values()) <= set(g.ANSWER_STYLES)
    assert set(req.language) <= {"en"} | set(g.NATIVE_LANG.values())
