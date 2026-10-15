"""
Synthetic data generator — Global Alumni Pulse 2026
===================================================

Creates a FAKE survey export that looks exactly like the real Qualtrics
export, so that the whole pipeline (cleaning -> derived variables ->
aggregates -> PDF reports -> portal) can be built and tested before the real
fieldwork starts.

Nothing in here is used for real data. The real data will arrive in
``data/raw/qualtrics/``; this script writes to ``data/synthetic/``.

How the simulation works (in plain words)
-----------------------------------------
Every simulated alumnus gets a few hidden ("latent") traits:

* ``career``      – how successful the career went (drives position, salary,
                    career satisfaction)
* ``disposition`` – general optimism / tendency to answer positively
* the school's own traits from ``schools.csv``: ``quality_effect``,
  ``network_effect``, ``ai_curriculum_effect`` and ``ranking_tier``

All visible answers are produced from these traits plus random noise. That
gives realistic correlations (e.g. good schools -> higher NPS; senior people
-> higher salaries; recent graduates -> better prepared for AI) which the
reports can later reveal. The hidden traits are saved to
``data/synthetic/ground_truth.csv`` so analyses can be checked against "the
truth".

On top of the valid interviews we add the usual dirt of a real survey:
non-consent, screen-outs, break-offs, speeders, bots, duplicates and typing
errors in the salary field. The cleaning step must find them.

Run it
------
    .venv/bin/python scripts/synthetic/generate.py            # default seed 2026
    .venv/bin/python scripts/synthetic/generate.py --seed 7   # another variant
"""

from __future__ import annotations

import argparse
import json
import math
import string
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline.codebook import Codebook  # noqa: E402
from pipeline.logic import blank_hidden  # noqa: E402

REF = ROOT / "data" / "reference"
OUT = ROOT / "data" / "synthetic"
TEXT_REQ_DIR = ROOT / ".work" / "text_requests"

REFERENCE_YEAR = 2026
FIELD_START = datetime(2026, 11, 3, 8, 0)
FIELD_END = datetime(2026, 12, 18, 20, 0)

DEGREES = ["bachelor", "master", "mba", "emba", "phd"]


# =============================================================================
# 1. Small, pure helper functions (unit-tested in tests/test_generator.py)
# =============================================================================

def likert(mu: float, rng: np.random.Generator, sd: float = 0.85,
           lo: int = 1, hi: int = 5) -> int:
    """Draw one answer on a lo..hi scale around the mean ``mu``.

    Step by step: add normal noise to the mean, round to the nearest whole
    number and clip into the allowed range.
    """
    return int(np.clip(round(mu + rng.normal(0, sd)), lo, hi))


def threshold_category(value: float, cuts: list[float]) -> int:
    """Map a continuous value to a category 1..len(cuts)+1.

    Example: cuts [-1, 0, 1] -> value -2 gives 1, 0.5 gives 3, 2 gives 4.
    """
    return int(np.searchsorted(cuts, value, side="right")) + 1


def pick_up_to(weights: dict, k: int, rng: np.random.Generator) -> list:
    """Pick ``k`` different options, probability proportional to weight.

    Options with weight <= 0 are never picked. If fewer than k options are
    possible, all of them are returned.
    """
    keys = [key for key, w in weights.items() if w > 0]
    if not keys:
        return []
    w = np.array([weights[key] for key in keys], dtype=float)
    k = min(k, len(keys))
    idx = rng.choice(len(keys), size=k, replace=False, p=w / w.sum())
    return [keys[i] for i in idx]


def bernoulli_set(probs: dict, rng: np.random.Generator, scale: float = 1.0,
                  at_least_one: bool = True) -> list:
    """Tick each option independently with its probability (times ``scale``).

    If nothing was ticked and ``at_least_one`` is set, the most likely option
    is ticked so that a "select all that apply" question is never empty.
    """
    chosen = [key for key, p in probs.items() if rng.random() < min(1.0, p * scale)]
    if not chosen and at_least_one and probs:
        chosen = [max(probs, key=probs.get)]
    return chosen


def experience_factor(years: float) -> float:
    """Salary multiplier for years since graduation (1.0 at about 9 years).

    Salaries rise fast early in the career and flatten later:
    0.55 + 0.6 * (1 - exp(-years / 9)), normalised to 1.0 at 9 years.
    """
    raw = 0.55 + 0.6 * (1 - math.exp(-years / 9))
    ref = 0.55 + 0.6 * (1 - math.exp(-1))
    return raw / ref


def degree_probabilities(shares: dict, region: str) -> np.ndarray:
    """Probability of each degree in DEGREES for one school (QA G4).

    Step by step: take the school's own degree shares, multiply each by the
    regional tilt in DEGREE_TILT and re-normalise so they sum to 1.
    """
    tilt = DEGREE_TILT.get(region, {})
    p = np.array([shares[d] * tilt.get(d, 1.0) for d in DEGREES], dtype=float)
    return p / p.sum()


def female_probability(region: str, degree: str, school_offset: float = 0.0) -> float:
    """Probability that a respondent is a woman (QA G4).

    Regional base share + correction for the degree + the school's own offset,
    kept within 0.15..0.70 so no school becomes absurd.
    """
    p = FEMALE_SHARE_REGION.get(region, 0.44) + FEMALE_SHARE_DEGREE.get(degree, 0.0) + school_offset
    return float(np.clip(p, 0.15, 0.70))


def n_mentions_up_to_3(rng: np.random.Generator) -> int:
    """How many options someone ticks when 'up to 3' are allowed (QA M8).

    Real respondents often stop after one or two answers, so the number is
    drawn: 1 with 22 %, 2 with 36 %, 3 with 42 % probability.
    """
    return int(rng.choice([1, 2, 3], p=[0.22, 0.36, 0.42]))


def round_like_a_human(amount: float, rng: np.random.Generator) -> int:
    """People round their income: 60 % to 1 000, 25 % to 5 000, 15 % exact."""
    u = rng.random()
    if u < 0.60:
        return int(round(amount, -3))
    if u < 0.85:
        return int(round(amount / 5000) * 5000)
    return int(round(amount))


def response_id(rng: np.random.Generator) -> str:
    """Qualtrics-style id: 'R_' + 15 letters/digits."""
    alphabet = list(string.ascii_letters + string.digits)
    return "R_" + "".join(rng.choice(alphabet, 15))


# =============================================================================
# 2. Option lists and weights (all numbers are plausible assumptions)
# =============================================================================

SKILL_IMPORTANCE = {  # mean importance 1..5
    "leadership": 4.3, "strategy": 4.0, "finance": 3.7, "innovation": 3.9,
    "change_mgmt": 3.9, "negotiation": 3.8, "digital_transf": 3.9, "marketing": 3.3,
    "operations": 3.4, "esg": 3.2, "csr": 3.0, "ai": 4.1, "data_analytics": 3.9,
    "entrepreneurship": 3.2, "project_mgmt": 3.9, "people_mgmt": 4.1, "communication": 4.5,
}
SKILL_PREPARATION = {  # mean preparation 1..5 (AI is the big gap)
    "leadership": 3.4, "strategy": 3.7, "finance": 3.8, "innovation": 3.3,
    "change_mgmt": 3.1, "negotiation": 2.9, "digital_transf": 2.9, "marketing": 3.6,
    "operations": 3.3, "esg": 2.8, "csr": 2.9, "ai": 2.0, "data_analytics": 2.8,
    "entrepreneurship": 3.0, "project_mgmt": 3.1, "people_mgmt": 3.0, "communication": 3.4,
}

# --- Calibration after the independent QA review (qa/QA_report.md) ----------
# Each constant names the QA finding it answers; the target ranges are checked
# in tests/test_generator.py via scripts/synthetic/calibration.py.

#: M1 seniority: seniority = YEARS_FACTOR * log(1 + years) + 0.5 * career + ...
#: The cut points split it into six management levels (entry .. C-level).
#: Before: factor 1.2, cuts [0.9, 1.6, 2.4, 3.0, 3.6] -> 19 % C-level.
SENIORITY_YEARS_FACTOR = 0.9
SENIORITY_CUTS = [0.8, 1.5, 2.15, 2.85, 3.45]

#: M2 school NPS spread: smaller career bonus by ranking tier (was 0.3/0/-0.2)
#: and a smaller weight of school quality and response style in the NPS.
TIER_BONUS = {1: 0.15, 2: 0.0, 3: -0.1}
NPS_QUALITY_WEIGHT = 0.35     # was 1.0
NPS_BASE = 8.4                # was 7.9 (keeps the overall NPS near +30)
NPS_STYLE_WEIGHT = 1.0        # was 2.0 (cultural response style, e.g. Japan -0.35)

#: M3 left tail of the NPS: more individual noise and a small group of truly
#: disappointed alumni whose latent NPS is centred far below the rest.
NPS_NOISE_SD = 1.7            # was 1.3
UNHAPPY_SHARE = 0.065
UNHAPPY_SHIFT = -5.5
SATISFACTION_NOISE_SD = 1.05  # was 0.45: satisfaction has more of its own noise

#: M7 AI usage: cut points of the latent AI affinity (never .. daily) and of
#: the agentic-AI scale (never heard .. core workflow). Both moved upwards.
AI_FREQ_CUTS = [-1.2, -0.4, 0.3, 1.05]         # was [-1.5, -0.9, -0.4, 0.6]
AGENTIC_CUTS = [-0.9, 0.6, 1.7, 2.7]           # was [-1.3, 0.2, 1.3, 2.3]

#: Regional tilt of the degree mix (QA G4: the mix was identical in every
#: region). Multiplies the school's own shares before they are re-normalised:
#: the Americas award more MBAs, Europe (Bologna) more Master's degrees,
#: Asian schools more Master's and Executive MBAs.
DEGREE_TILT = {
    "Americas": {"bachelor": 0.85, "master": 0.85, "mba": 1.45, "emba": 1.0, "phd": 1.0},
    "Europe": {"bachelor": 1.1, "master": 1.15, "mba": 0.8, "emba": 0.9, "phd": 1.0},
    "Asia": {"bachelor": 0.9, "master": 1.05, "mba": 0.95, "emba": 1.25, "phd": 1.0},
}

#: Share of women by region of the school (QA G4) and correction by degree:
#: MBA and especially EMBA cohorts have clearly fewer women than Bachelor and
#: Master cohorts. Each school also gets its own random offset (see Simulator).
FEMALE_SHARE_REGION = {"Europe": 0.47, "Americas": 0.45, "Asia": 0.36}
FEMALE_SHARE_DEGREE = {"bachelor": 0.04, "master": 0.02, "mba": -0.06, "emba": -0.12, "phd": -0.03}

AGE_AT_GRADUATION = {"bachelor": (23, 1.5), "master": (25.5, 2), "mba": (29.5, 3),
                     "emba": (38, 5), "phd": (31, 3)}
DEGREE_SALARY = {"bachelor": 0.9, "master": 1.0, "mba": 1.2, "emba": 1.35, "phd": 1.05}
TIER_SALARY = {1: 1.15, 2: 1.0, 3: 0.9}
POSITION_SALARY = {1: 2.1, 2: 1.6, 3: 1.2, 4: 1.0, 5: 0.8, 6: 0.62, 7: 0.7, 8: 1.0, 9: 1.6,
                   10: 1.4, 11: 1.15, 12: 0.95, 13: 0.8, 14: 0.45, 15: 0.85, 16: 1.1, 17: 0.9}

# Where alumni move to when they do not live in the school's country (ISO2).
MOBILITY = {"US": 12, "GB": 10, "CH": 8, "DE": 8, "SG": 7, "AE": 6, "HK": 4, "AU": 4,
            "CA": 4, "NL": 4, "FR": 4, "IE": 3, "LU": 2, "CN": 3, "JP": 2, "IN": 2}
STAY_PROB = {"Europe": 0.76, "Americas": 0.87, "Asia": 0.80}

INDUSTRY_WEIGHTS = {9: 18, 6: 14, 12: 12, 14: 9, 11: 7, 17: 7, 8: 4, 13: 4, 15: 3, 5: 3,
                    4: 3, 1: 1, 2: 1, 3: 1, 18: 2, 7: 2, 10: 2, 16: 1, 19: 3}
FUNCTION_WEIGHTS = {1: 8, 2: 16, 3: 14, 4: 12, 5: 9, 6: 8, 7: 5, 8: 7, 9: 6, 10: 6,
                    11: 4, 12: 3, 13: 7, 14: 2, 15: 2}

SOC_CHALL_BASE = {1: 30, 16: 15, 2: 22, 3: 12, 5: 10, 6: 6, 7: 10, 8: 18, 9: 10, 10: 14,
                  11: 8, 12: 10, 13: 12, 14: 6, 17: 12}
ECON_CHALL_BASE = {1: 22, 16: 18, 12: 25, 7: 7, 2: 30, 17: 8, 3: 8, 4: 12, 13: 7, 5: 6,
                   6: 8, 9: 18, 15: 7, 10: 9, 18: 4, 19: 10}

OTHER_TEXTS = {
    "edu_deg_other_TEXT": [("Diplom-Kaufmann (FH)", 2), ("Licenciatura en Administración", 1),
                           ("PGDM", 3), ("Grande École diploma (PGE)", 2), ("BBA (Hons)", 1),
                           ("Lizenziat oec.", 2), ("DBA", 5)],
    "job_type_4_TEXT": ["Fixed-term contract", "Board mandates", "Internship", "Portfolio career"],
    "job_status_5_TEXT": ["Parental leave", "Sabbatical", "Career break – caring for family",
                          "Military service", "Travelling"],
    "job_function_oth_txt": ["Procurement", "Investor relations", "Sustainability",
                             "Internal audit", "Real estate asset management"],
    "ce_type_7_TEXT": ["Language course", "Coaching certification", "Yoga teacher training",
                       "Board director programme"],
    "out_soc_chall_15_TEXT": ["Mental health", "Pension system", "Water scarcity"],
    "out_econ_chall_11_TEXT": ["Demographic decline", "Populism"],
    "ai_barrier_9_TEXT": ["Company policy under review", "Output quality in my language"],
    "ai_task_12_TEXT": ["Translation", "Learning new topics"],
    "ai_agentic_task_11_TEXT": ["Travel planning"],
    "ai_skill_need_10_TEXT": ["Critical thinking about AI"],
    "ai_access_7_TEXT": ["Client-provided tools"],
}

NATIVE_LANG = {"CH": "de", "DE": "de", "AT": "de", "FR": "fr", "BE": "fr", "IT": "it",
               "ES": "es", "MX": "es", "BR": "pt", "CN": "zh", "JP": "ja", "KR": "ko",
               "NL": "nl", "SE": "sv", "PL": "pl", "VN": "vi", "ID": "id", "TH": "th"}

#: Probability that an open answer is written in the local language of the
#: school's country (default 10 %). QA: Mexico and Brazil had almost no
#: Spanish/Portuguese answers, so they get a higher share.
LOCAL_LANGUAGE_PROB = {"MX": 0.35, "BR": 0.40}
DEFAULT_LOCAL_LANGUAGE_PROB = 0.10

#: Length / style of a single open answer (QA: texts were too uniform, 15.8
#: words on average, almost no one-word or non-answers).
ANSWER_STYLES = {"non_answer": 0.06, "very_short": 0.20, "normal": 0.58, "long": 0.16}

TEXT_FIELDS = {  # field -> base probability that a respondent writes something
    "pgm_most_valuable_tx": 0.55, "pgm_change_one_txt": 0.50, "car_satisfaction_why": 0.42,
    "ai_bschool_role_txt": 0.38, "ai_opp_concern_4": 0.33, "final_comments_txt": 0.08,
}


# =============================================================================
# 3. Simulation of one valid interview
# =============================================================================

class Simulator:
    """Holds the reference data and produces respondents school by school."""

    def __init__(self, schools: pd.DataFrame, countries: pd.DataFrame, cb: Codebook,
                 rng: np.random.Generator):
        self.schools = schools
        self.countries = countries.set_index("iso2")
        self.country_by_name = countries.set_index("country")
        self.cb = cb
        self.rng = rng
        # QA G4: every school gets its own small deviation in the share of
        # women (drawn once per school, so the school's alumni share it).
        self.school_female_offset: dict[str, float] = {}

    # ------------------------------------------------------------ utilities
    def _choice(self, weights: dict):
        keys = list(weights)
        w = np.array([weights[k] for k in keys], dtype=float)
        return keys[self.rng.choice(len(keys), p=w / w.sum())]

    def _other_text(self, col: str):
        opts = OTHER_TEXTS[col]
        pick = opts[self.rng.integers(len(opts))]
        return pick[0] if isinstance(pick, tuple) else pick

    # --------------------------------------------------------------- person
    def respondent(self, s: pd.Series) -> tuple[dict, dict]:
        """Simulate one complete, valid interview for school ``s``.

        Returns (answers, truth) — ``truth`` holds the hidden traits.
        """
        rng = self.rng
        r: dict = {"consent": 1}
        region, iso = s.region, s.iso2

        # --- hidden traits ---------------------------------------------------
        disposition = rng.normal(0, 1)
        tier_bonus = TIER_BONUS[int(s.ranking_tier)]
        career = rng.normal(0, 0.85) + 0.25 * s.quality_effect + 0.1 * s.network_effect + tier_bonus
        # cultural response style: Japanese/Korean respondents avoid extremes,
        # Indian and US respondents answer more positively
        style = {"JP": -0.35, "KR": -0.2, "IN": 0.25, "US": 0.15}.get(iso, 0.0)

        # --- 1. highest degree and degree matrix ------------------------------
        shares = {d: s[f"share_{d}"] for d in DEGREES}
        highest = DEGREES[rng.choice(5, p=degree_probabilities(shares, region))]
        status = {d: 4 for d in DEGREES}
        status[highest] = 1
        lower_completed = {  # P(also completed a lower degree)
            "master": {"bachelor": 0.85}, "mba": {"bachelor": 0.9, "master": 0.3},
            "emba": {"bachelor": 0.85, "master": 0.35}, "phd": {"bachelor": 0.9, "master": 0.9},
        }
        for d, p in lower_completed.get(highest, {}).items():
            if rng.random() < p:
                status[d] = 1
        if highest == "bachelor" and rng.random() < 0.06:
            status["master"] = 2                     # currently enrolled in a master
        if highest in ("bachelor", "master") and rng.random() < 0.12:
            status["mba"] = 3                        # considering an MBA
        if highest == "mba" and rng.random() < 0.05:
            status["phd"] = 3
        for d in DEGREES:
            r[f"edu_deg_{d}"] = status[d]
        r["edu_deg_other"] = 4
        if rng.random() < 0.03:                     # an extra national degree
            text, level = OTHER_TEXTS["edu_deg_other_TEXT"][rng.integers(7)]
            r["edu_deg_other"], r["edu_deg_other_TEXT"], r["edu_other_level"] = 1, text, level

        # --- 2. graduation year and age ---------------------------------------
        years = int(min(rng.gamma(1.6, 6.0), 45))
        grad_year = REFERENCE_YEAR - years
        mu_age, sd_age = AGE_AT_GRADUATION[highest]
        birth = int(round(grad_year - rng.normal(mu_age, sd_age)))
        birth = int(np.clip(birth, 1936, 2004))
        age = REFERENCE_YEAR - birth
        r.update(dem_birth_year=birth, edu_grad_year=grad_year)
        r["edu_school_1"], r["edu_school_5"] = s.country, s.school_name

        if s.school_id not in self.school_female_offset:
            self.school_female_offset[s.school_id] = float(rng.normal(0, 0.04))
        female_share = female_probability(region, highest, self.school_female_offset[s.school_id])
        g = rng.random()
        r["dem_gender"] = 1 if g < female_share else (3 if g < female_share + 0.01 else
                                                      (99 if g < female_share + 0.03 else 2))
        female = r["dem_gender"] == 1

        # --- 3. country of residence and of work ------------------------------
        if rng.random() < STAY_PROB[region]:
            res_iso = iso
        else:
            res_iso = self._choice({k: v for k, v in MOBILITY.items() if k != iso})
        work_iso = res_iso if rng.random() < 0.95 else self._choice(
            {k: v for k, v in MOBILITY.items() if k != res_iso})
        r["dem_country_res"] = self.countries.loc[res_iso, "country"]

        # --- 4. employment ------------------------------------------------------
        retired = (age >= 67 and rng.random() < 0.6) or (60 <= age < 67 and rng.random() < 0.2)
        employed = False
        if retired:
            r["job_employed"], r["job_status"] = 2, 2
            r["job_retire_year"] = int(min(REFERENCE_YEAR, birth + rng.integers(60, 67)))
        else:
            p_seek = 0.035 + (0.03 if years <= 1 else 0) + (0.02 if region == "Asia" else 0)
            u = rng.random()
            if u < p_seek:
                r["job_employed"], r["job_status"] = 2, 3
            elif u < p_seek + 0.015:
                r["job_employed"], r["job_status"] = 2, 4
            elif u < p_seek + 0.023:
                r["job_employed"], r["job_status"] = 2, 5
                r["job_status_5_TEXT"] = self._other_text("job_status_5_TEXT")
            else:
                employed = True
                r["job_employed"] = 1
                pt = 0.07 + (0.06 if female and region == "Europe" else 0)
                self_emp = 0.08 + 0.003 * max(0, age - 35)
                r["job_type"] = self._choice({1: 1 - pt - self_emp - 0.02, 2: pt, 3: self_emp, 4: 0.02})
                if r["job_type"] == 4:
                    r["job_type_4_TEXT"] = self._other_text("job_type_4_TEXT")
                if r["job_type"] == 2:
                    r["job_workload_pct"] = self._choice({40: 5, 50: 15, 60: 20, 70: 15, 80: 35, 90: 10})
                elif r["job_type"] == 3:
                    r["job_workload_pct"] = self._choice({60: 5, 70: 5, 80: 15, 90: 15, 100: 60})
        unemployed_seeking = r.get("job_status") == 3

        # --- 5. organisation, position, industry, function ---------------------
        has_job_info = employed or retired
        seniority = (SENIORITY_YEARS_FACTOR * math.log1p(years) + 0.5 * career + rng.normal(0, 0.5)
                     + {"bachelor": -0.2, "master": 0, "mba": 0.4, "emba": 1.0, "phd": 0.2}[highest])
        if has_job_info:
            if employed and r["job_type"] == 3:
                org = self._choice({1: 35, 2: 45, 7: 20})
            else:
                org = self._choice({1: 7, 2: 22, 3: 46, 4: 45 if highest == "phd" else 6,
                                    5: 11, 6: 5, 7: 3})
            r["job_org_type"] = org
            if org == 7:
                r["job_org_type_TEXT"] = None  # (no text column in export for org_type)
            if employed and r["job_type"] == 3:
                pos = 8
            elif org == 4:  # academic careers
                if highest == "phd":
                    pos = threshold_category(seniority, [1.8, 2.6, 3.3, 4.2])
                    pos = {1: 14, 2: 12, 3: 11, 4: 10, 5: 9}[pos]
                else:
                    pos = self._choice({15: 40, 16: 25, 13: 30, 9: 5})
            else:
                level = threshold_category(seniority, SENIORITY_CUTS)
                pos = {1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1}[level]
                u = rng.random()
                if u < 0.04:
                    pos = 7
                elif u < 0.05:
                    pos = 17
            r["job_position"] = pos
            if pos == 17:
                r["job_position_TEXT"] = None

            if org == 4:
                ind = 7
            elif org == 5:
                ind = 10 if rng.random() < 0.7 else self._choice(INDUSTRY_WEIGHTS)
            elif org == 6:
                ind = 16
            else:
                ind = self._choice(INDUSTRY_WEIGHTS)
            r["job_industry"] = ind

            if pos <= 8:
                fw = dict(FUNCTION_WEIGHTS)
                if pos == 1:
                    fw[1] += 120
                if ind == 6:
                    fw[5] += 60
                if ind == 9:
                    fw[2] += 40
                if ind == 12:
                    fw[8] += 25; fw[9] += 15; fw[10] += 15
                if pos == 8:
                    fw[14] += 40
                r["job_function"] = self._choice(fw)
                if r["job_function"] == 15:
                    r["job_function_oth_txt"] = self._other_text("job_function_oth_txt")
            r["job_country"] = self.countries.loc[work_iso, "country"]
        function = r.get("job_function", 0)
        tech_function = function in (8, 9, 10)
        senior = r.get("job_position") in (1, 2, 9, 10)

        # --- 6. salary ------------------------------------------------------------
        salary_ppp = None
        injected = ""
        if employed:
            wc = self.countries.loc[work_iso]
            noise_sd = 0.55 if r["job_type"] == 3 else 0.25
            salary_ppp = (wc.salary_level_ppp_usd * experience_factor(years)
                          * POSITION_SALARY[r["job_position"]] * DEGREE_SALARY[highest]
                          * TIER_SALARY[int(s.ranking_tier)] * (0.92 if female else 1.0)
                          * math.exp(0.15 * career + rng.normal(0, noise_sd)))
            if r["job_type"] in (2, 3):
                salary_ppp *= r["job_workload_pct"] / 100
            p_hide = {"Europe": 0.14, "Americas": 0.10, "Asia": 0.20}[region]
            if rng.random() < p_hide:
                r["sal_disclose_2"] = 1
            else:
                local = round_like_a_human(salary_ppp * wc.ppp_lcu_per_intl_dollar, rng)
                u = rng.random()           # typical typing errors (about 1.5 %)
                if u < 0.005:
                    local, injected = round(local / 12), "salary_monthly"
                elif u < 0.010:
                    local, injected = local * 10, "salary_extra_zero"
                elif u < 0.015:
                    local, injected = round(local / 1000), "salary_in_thousands"
                r["sal_disclose_1"] = max(int(local), 1)

        # --- 7. evaluation of the programme -------------------------------------
        Q, N, A = s.quality_effect, s.network_effect, s.ai_curriculum_effect
        applied = s.institution_type == "applied_sciences_university"
        exec_deg = highest in ("mba", "emba")
        for key, base in SKILL_IMPORTANCE.items():
            mu = base + style * 0.5
            if not (employed or retired):
                mu -= 0.2
            if key == "finance" and function == 2: mu += 0.6
            if key == "marketing" and function == 3: mu += 0.8
            if key == "ai" and (tech_function or region == "Asia"): mu += 0.3
            if key == "data_analytics" and tech_function: mu += 0.6
            if key in ("leadership", "strategy") and senior: mu += 0.3
            if key == "people_mgmt" and years < 3: mu -= 0.3
            if key == "esg" and region == "Europe": mu += 0.2
            r[f"pgm_skill_imp_{key}"] = likert(mu, rng)
            if r[f"pgm_skill_imp_{key}"] >= 3:
                mu = SKILL_PREPARATION[key] + 0.45 * Q + 0.15 * disposition + style * 0.5
                if key in ("ai", "data_analytics", "digital_transf"):
                    mu += 0.7 * A
                if key == "ai":
                    mu += 0.8 if grad_year >= 2023 else (0.3 if grad_year >= 2019 else
                                                          (-0.3 if grad_year < 2015 else 0))
                if key == "data_analytics" and grad_year >= 2023: mu += 0.3
                if applied and key in ("project_mgmt", "operations"): mu += 0.3
                if exec_deg and key in ("leadership", "strategy"): mu += 0.3
                if highest == "phd" and key == "data_analytics": mu += 0.3
                r[f"pgm_skill_prep_{key}"] = likert(mu, rng)

        pos_bias = 0.2 * disposition + style
        r["pgm_rate_relevance"] = likert(3.8 + 0.5 * Q + 0.25 * career + pos_bias, rng)
        r["pgm_rate_leadership_prep"] = likert(3.5 + 0.4 * Q + (0.3 if exec_deg else 0) + pos_bias, rng)
        r["pgm_rate_theory_practice"] = likert(3.4 + 0.3 * Q + (0.5 if applied else 0)
                                               - (0.2 if highest == "phd" else 0) + pos_bias, rng)
        r["pgm_rate_reputation"] = likert(3.6 + 0.3 * (2 - s.ranking_tier) + 0.4 * Q + pos_bias, rng)
        r["pgm_rate_interaction"] = likert(3.7 + 0.5 * Q + (0.2 if s.alumni_base_size < 8000 else 0)
                                           + pos_bias, rng)
        r["pgm_rate_network"] = likert(3.5 + 0.8 * N + (0.3 if exec_deg else 0) + pos_bias, rng)

        # NPS: a latent "willingness to recommend" built from school quality,
        # career, optimism, network and response style plus individual noise.
        # About 5 % are truly disappointed alumni (latent shifted far down).
        unhappy = rng.random() < UNHAPPY_SHARE
        nps_latent = (NPS_BASE + NPS_QUALITY_WEIGHT * Q + 0.35 * career + 0.6 * disposition + 0.3 * N
                      + NPS_STYLE_WEIGHT * style + rng.normal(0, NPS_NOISE_SD)
                      + (UNHAPPY_SHIFT if unhappy else 0.0))
        r["pgm_nps"] = int(np.clip(round(nps_latent), 0, 10))
        # Satisfaction follows the same latent attitude but with its own noise,
        # so the two questions correlate clearly but not perfectly.
        r["pgm_satisfaction"] = int(np.clip(round(nps_latent * 0.42 + 0.7
                                                  + rng.normal(0, SATISFACTION_NOISE_SD)), 1, 5))

        # --- 8. continuing education ---------------------------------------------
        if rng.random() < 0.35 + 0.02 * min(years, 15):
            r["ce_any"] = 1
            dach = iso in ("CH", "DE", "AT")
            ce = bernoulli_set({1: 0.55, 2: 0.20, 3: 0.35 if dach else 0.05, 4: 0.12 if dach else 0.02,
                                5: 0.5 if function == 2 else 0.3, 6: 0.4 if senior else 0.25,
                                7: 0.03}, rng)
            for c in ce:
                r[f"ce_type_{c}"] = 1
            if 7 in ce:
                r["ce_type_7_TEXT"] = self._other_text("ce_type_7_TEXT")
        else:
            r["ce_any"] = 2

        # --- 9. wellbeing and outlook ---------------------------------------------
        res = self.countries.loc[res_iso]
        r["car_satisfaction"] = likert(3.7 + 0.45 * career + 0.3 * disposition + style
                                       - (0.9 if unemployed_seeking else 0), rng)
        hopeful_region = {"IN": 0.4, "ID": 0.4, "VN": 0.4, "JP": -0.4}.get(res_iso,
                                                                         -0.1 if region == "Europe" else 0)
        r["car_hopeful"] = likert(3.4 + 0.35 * disposition + 0.2 * career - 0.015 * (age - 35)
                                  + hopeful_region - (0.4 if unemployed_seeking else 0), rng)
        wb = {1: 3.7 + 0.45 * disposition, 2: 3.6 + 0.3 * disposition - 0.01 * (age - 40),
              3: 3.4 + 0.4 * career + 0.3 * disposition - (1.0 if unemployed_seeking else 0)}
        for i, mu in wb.items():
            if rng.random() > 0.03:          # 3 % leave a wellbeing item blank
                r[f"wb_{i}"] = likert(mu + style * 0.5, rng)
        stress_mu = (2.9 - 0.25 * disposition + (0.3 if r.get("job_position") in (1, 2, 3) else 0)
                     + (0.2 if age < 30 else 0) - (0.8 if retired else 0))
        r["wb_stress"] = likert(stress_mu, rng, sd=0.9)
        if employed or r.get("job_status") == 1:
            r["wb_work_life"] = likert(3.6 - 0.45 * (r["wb_stress"] - 2.9) + 0.1 * disposition, rng)
        r["out_global"] = likert(2.55 + 0.3 * disposition + (0.4 if region == "Asia" else 0), rng)
        r["out_country"] = likert(3.0 + 1.0 * res.econ_outlook_bias + 0.3 * disposition, rng)

        self._challenges(r, res_iso, region)

        # --- 10. AI focus ---------------------------------------------------------------
        a = (0.3 + (0.5 if region == "Asia" else 0) + (0.4 if function in (4, 5, 8, 9, 10) else 0)
             - 0.025 * (age - 35) + 0.2 * A + rng.normal(0, 1)
             - (0.7 if not (employed or retired) else 0) - (1.2 if retired else 0))
        freq = threshold_category(a, AI_FREQ_CUTS)
        r["ai_use_freq"] = freq
        self._ai_block(r, freq, employed, retired, region, function, tech_function, senior, age)

        # --- 11. closing ------------------------------------------------------------------
        if s.bgs_chapter == 1:
            r["bgs_member"] = self._choice({1: 18, 2: 60, 4: 22})
        else:
            r["bgs_member"] = self._choice({1: 2, 2: 80, 4: 18})
        r["ft_interview_consent"] = 1 if rng.random() < 0.22 else 2

        # remove helper keys that are not export columns
        r.pop("job_org_type_TEXT", None)
        r.pop("job_position_TEXT", None)

        truth = {"career": round(career, 3), "disposition": round(disposition, 3),
                 "years_since_grad": years, "highest_degree": highest,
                 "salary_ppp_true": round(salary_ppp) if salary_ppp else None,
                 "residence_iso2": res_iso, "work_iso2": work_iso if has_job_info else None,
                 "injected_issue": injected}
        return r, truth

    # ------------------------------------------------------------ sub-blocks
    def _challenges(self, r: dict, res_iso: str, region: str) -> None:
        """Up to three societal and three economic challenges."""
        rng = self.rng
        soc = dict(SOC_CHALL_BASE)
        if region == "Europe":
            soc[7] += 6; soc[11] += 6; soc[17] += 8; soc[13] += 6
        if res_iso == "US":
            soc[8] += 18; soc[3] += 10; soc[2] += 5
        if res_iso in ("JP", "KR", "CN"):
            soc[13] += 15
        if region == "Asia":
            soc[5] += 6; soc[16] += 6; soc[10] += 4
        if res_iso == "IN":
            soc[14] += 10; soc[5] += 6; soc[9] += 6
        if res_iso == "CH":
            soc[2] += 10; soc[3] += 8
        self._multi_with_dont_know(r, "out_soc_chall", soc, dont_know=19, other=15)

        econ = dict(ECON_CHALL_BASE)
        if region == "Asia":
            econ[12] += 8
        if region == "Europe":
            econ[2] += 8
        self._multi_with_dont_know(r, "out_econ_chall", econ, dont_know=20, other=11)

    def _multi_with_dont_know(self, r, name, weights, dont_know, other):
        rng = self.rng
        if rng.random() < 0.02:
            r[f"{name}_{dont_know}"] = 1
            return
        weights = dict(weights)
        weights[other] = 1.5
        for c in pick_up_to(weights, n_mentions_up_to_3(rng), rng):
            r[f"{name}_{c}"] = 1
            if c == other:
                r[f"{name}_{c}_TEXT"] = self._other_text(f"{name}_{c}_TEXT")

    def _ai_block(self, r, freq, employed, retired, region, function, tech, senior, age):
        """AI intro, AI usage, agentic AI and AI-in-the-organisation questions."""
        rng = self.rng
        # Barriers (shown unless daily use)
        if freq != 5:
            if rng.random() < (0.18 if freq == 4 else 0.06):
                r["ai_barrier_15"] = 1
            else:
                w = {12: 14, 13: 8, 10: 18, 11: 9, 4: 20 + (8 if region == "Europe" else 0),
                     3: 12, 5: 8, 6: 20, 7: 12, 17: 4, 9: 2}
                if employed:
                    w[1] = 10 + (6 if r.get("job_org_type") == 3 else 0)
                if r["job_employed"] == 2:
                    w[8] = 60 if retired else 5
                if freq == 1:
                    w[2] = 15
                k = self._choice({1: 20, 2: 40, 3: 40})
                for c in pick_up_to(w, k, rng):
                    r[f"ai_barrier_{c}"] = 1
                    if c == 9:
                        r["ai_barrier_9_TEXT"] = self._other_text("ai_barrier_9_TEXT")
        # AI block (shown unless "never")
        if freq != 1:
            scale = {2: 0.6, 3: 0.8, 4: 1.0, 5: 1.15}[freq]
            tasks = bernoulli_set({1: 0.85, 4: 0.62, 5: 0.70, 6: 0.40 + (0.2 if function in (2, 9) else 0),
                                   7: 0.18 + (0.45 if tech else 0), 8: 0.58, 9: 0.30, 10: 0.15,
                                   11: 0.28, 12: 0.03}, rng, scale)
            for c in tasks:
                r[f"ai_task_{c}"] = 1
            if 12 in tasks:
                r["ai_task_12_TEXT"] = self._other_text("ai_task_12_TEXT")

            b = (freq - 3) * 0.6 + (0.4 if tech else 0) - 0.02 * (age - 35) + rng.normal(0, 1)
            agentic = threshold_category(b, AGENTIC_CUTS)
            r["ai_agentic_use"] = agentic
            if agentic >= 3:
                at = bernoulli_set({1: 0.60, 2: 0.45, 3: 0.35, 4: 0.18, 5: 0.25,
                                    6: 0.60 if tech else 0.15, 7: 0.10, 8: 0.15, 9: 0.22,
                                    10: 0.30 if agentic == 5 else 0.10, 11: 0.02}, rng)
                for c in at:
                    r[f"ai_agentic_task_{c}"] = 1
                if 11 in at:
                    r["ai_agentic_task_11_TEXT"] = self._other_text("ai_agentic_task_11_TEXT")

            need_w = {1: 35 + (10 if age > 45 else 0), 4: 30 + (12 if senior else 0),
                      5: 32 + 6 * (freq - 3), 6: 38 + (12 if senior else 0), 7: 30,
                      8: 22 + (8 if region == "Europe" else 0), 9: 28, 10: 1}
            for c in pick_up_to(need_w, n_mentions_up_to_3(rng), rng):
                r[f"ai_skill_need_{c}"] = 1
                if c == 10:
                    r["ai_skill_need_10_TEXT"] = self._other_text("ai_skill_need_10_TEXT")

            hw = {1: 12, 2: 45, 3: 25, 4: 7, 5: 2, 99: 9}
            if r.get("job_position") in (5, 6, 7):
                hw[1] += 6
            if tech:
                hw[4] += 6
            r["ai_headcount_outlook"] = self._choice(hw)

        # AI in the organisation (employed only)
        if employed:
            org = r.get("job_org_type")
            large, sme = org == 3, org in (1, 2)
            asia, europe = region == "Asia", region == "Europe"
            r["ai_org_perf_assessed"] = likert(2.4 + (0.5 if asia else 0) + (0.2 if large else 0), rng, 1.0)
            r["ai_org_guidelines"] = likert(3.3 + (0.5 if large else 0) + (0.2 if europe else 0)
                                            - (0.4 if sme else 0), rng, 1.0)
            r["ai_org_roi_expected"] = likert(3.6 + (0.3 if large else 0), rng, 1.0)
            r["ai_org_junior_tasks"] = likert(3.0 + (0.4 if function in (5, 8, 9) else 0), rng, 1.0)
            r["ai_org_trust_outputs"] = likert(2.4 + 0.2 * (freq - 3), rng, 1.0)
            r["ai_org_ethics_concern"] = likert(3.6 + (0.3 if europe else 0) - (0.3 if asia else 0), rng, 1.0)

            self_emp = r.get("job_type") == 3
            enrolled = any(r.get(f"edu_deg_{d}") == 2 for d in DEGREES + ["other"])
            acc = bernoulli_set({1: 0.9 if self_emp else 0.62 + (0.15 if large else 0) - (0.1 if sme else 0),
                                 3: 0.45, 4: 0.30 + (0.2 if self_emp else 0),
                                 6: 0.5 if enrolled else 0.0, 7: 0.02}, rng)
            for c in acc:
                r[f"ai_access_{c}"] = 1
            if 7 in acc:
                r["ai_access_7_TEXT"] = self._other_text("ai_access_7_TEXT")

            u = rng.random()
            if u < 0.04:
                r["ai_org_meas_9"] = 1
            elif u < 0.04 + (0.18 if org in (2, 5, 6) else 0.06):
                r["ai_org_meas_8"] = 1
            else:
                for c in bernoulli_set({1: 0.70, 2: 0.40, 3: 0.40 if large else 0.20,
                                        4: 0.45 if large else 0.20, 5: 0.40, 6: 0.12, 7: 0.55}, rng):
                    r[f"ai_org_meas_{c}"] = 1
            r["ai_time_saved"] = self._choice({1: 22, 2: 30, 3: 24, 4: 12, 6: 4,
                                               5: 8 + (12 if freq <= 2 else 0)})


# =============================================================================
# 4. Metadata, invalid cases and output
# =============================================================================

def add_metadata(r: dict, rng: np.random.Generator, finished: bool = True,
                 duration: float | None = None, progress: int = 100) -> dict:
    """Add the Qualtrics system columns (dates, duration, ids ...)."""
    span = (FIELD_END - FIELD_START).total_seconds()
    # most interviews come in shortly after the invitation waves -> skewed early
    start = FIELD_START + timedelta(seconds=float(span * rng.beta(1.3, 2.6)))
    if duration is None:
        duration = float(np.exp(rng.normal(math.log(960), 0.45)))
    end = start + timedelta(seconds=duration)
    fmt = "%Y-%m-%d %H:%M:%S"
    r.update({
        "ResponseId": response_id(rng),
        "StartDate": start.strftime(fmt), "EndDate": end.strftime(fmt),
        "Status": 0, "Progress": progress, "Duration (in seconds)": int(duration),
        "Finished": 1 if finished else 0, "RecordedDate": end.strftime(fmt),
        "UserLanguage": "EN", "Q_RecaptchaScore": round(float(rng.uniform(0.7, 1.0)), 2),
        "Q_RelevantIDDuplicate": "",
        "Distribution": rng.choice(["school", "ft", "aacsb", "bgs"], p=[0.70, 0.14, 0.09, 0.07]),
    })
    return r


#: Blocks in survey order; used to cut break-offs at a block border.
BLOCK_ORDER = ["Demographics", "Education", "University", "University2", "Employment",
               "Industry & Employer", "Function", "Function Other", "Working Country", "Salary",
               "Evaluation", "contin_ed_overview", "Sec IV", "AI Intro", "AI", "AI_Organisation",
               "AI Outlook", "Abschluss"]


def truncate_after_block(r: dict, cb: Codebook, last_block: str) -> dict:
    """Keep only answers from blocks up to and including ``last_block``."""
    keep = set(BLOCK_ORDER[: BLOCK_ORDER.index(last_block) + 1]) | {"meta", "Intro"}
    return {k: v for k, v in r.items() if k not in cb or cb[k].block in keep}


def straightline(r: dict, cb: Codebook, rng: np.random.Generator) -> dict:
    """Speeder pattern: the same value in every rating matrix, no texts."""
    v = int(rng.integers(3, 6))
    for k in list(r):
        if k.startswith(("pgm_skill_imp_", "pgm_skill_prep_", "pgm_rate_", "ai_org_")):
            r[k] = v
    return r


def write_qualtrics_csv(df: pd.DataFrame, cb: Codebook, path: Path) -> None:
    """Write a CSV with the three Qualtrics header rows.

    Row 1: column names, row 2: question text, row 3: ImportId JSON.
    """
    cols = [c for c in cb.names if c in df.columns]
    header2 = [cb[c].label for c in cols]
    header3 = [json.dumps({"ImportId": c}) for c in cols]
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        pd.DataFrame([header2, header3], columns=cols).to_csv(fh, index=False)
        df[cols].to_csv(fh, index=False, header=False)


def text_requests(df: pd.DataFrame, truth: pd.DataFrame, schools: pd.DataFrame,
                  cb: Codebook, rng: np.random.Generator) -> pd.DataFrame:
    """Decide WHO writes WHICH open answer and describe the person for the text writers.

    The texts themselves are written later by language-model agents; this
    function only prepares compact profiles so the texts fit the numbers.
    """
    s = schools.set_index("school_name")
    rows = []
    for i, r in df.iterrows():
        verbosity = rng.uniform(0.4, 1.6)
        fields = [f for f, p in TEXT_FIELDS.items() if rng.random() < p * verbosity]
        if "ai_opp_concern_4" in fields and rng.random() < 0.85:
            fields.append("ai_opp_concern_5")
        elif rng.random() < 0.04 * verbosity:
            fields.append("ai_opp_concern_5")
        if not fields:
            continue
        school = s.loc[r["edu_school_5"]]
        iso = school.iso2
        p_local = LOCAL_LANGUAGE_PROB.get(iso, DEFAULT_LOCAL_LANGUAGE_PROB)
        lang = NATIVE_LANG.get(iso, "en") if rng.random() < p_local else "en"
        label = cb.value_label
        rows.append({
            "ResponseId": r["ResponseId"], "region": school.region, "school": r["edu_school_5"],
            "school_type": school.institution_type, "school_notes": school.notes,
            "language": lang, "fields": fields,
            # writing instructions for the text agents (QA: couple tone to NPS,
            # vary the length, allow short and non-answers)
            "tone": tone_from_nps(int(r["pgm_nps"])),
            "styles": {f: answer_style(rng) for f in fields},
            "profile": {
                "age": REFERENCE_YEAR - int(r["dem_birth_year"]),
                "gender": label("dem_gender", r["dem_gender"]),
                "lives_in": r["dem_country_res"],
                "highest_degree": truth.loc[i, "highest_degree"],
                "graduated": int(r["edu_grad_year"]),
                "situation": (label("job_type", r.get("job_type")) if r["job_employed"] == 1
                              else label("job_status", r.get("job_status"))),
                "position": label("job_position", r.get("job_position")),
                "industry": label("job_industry", r.get("job_industry")),
                "function": label("job_function", r.get("job_function")),
                "programme_satisfaction": label("pgm_satisfaction", r["pgm_satisfaction"]),
                "nps": int(r["pgm_nps"]),
                "career_satisfaction": label("car_satisfaction", r["car_satisfaction"]),
                "hopeful": label("car_hopeful", r["car_hopeful"]),
                "ai_use": label("ai_use_freq", r["ai_use_freq"]),
                "agentic_ai": label("ai_agentic_use", r.get("ai_agentic_use")),
                "weakest_prepared_skill": _weakest_skill(r, cb),
            },
        })
    return pd.DataFrame(rows)


def tone_from_nps(score: int) -> str:
    """Tone of the open answers, coupled to the NPS (QA: tone was independent of NPS).

    Detractors (0-6) write critically, passives (7-8) mixed, promoters (9-10)
    positively; 0-3 are openly angry or disappointed.
    """
    if score <= 3:
        return "very negative"
    if score <= 6:
        return "critical"
    if score <= 8:
        return "mixed"
    return "positive"


def answer_style(rng: np.random.Generator) -> str:
    """Draw the length/style of one open answer from ANSWER_STYLES."""
    keys = list(ANSWER_STYLES)
    return keys[rng.choice(len(keys), p=np.array([ANSWER_STYLES[k] for k in keys]))]


def _weakest_skill(r: pd.Series, cb: Codebook) -> str:
    """Skill with the largest gap importance - preparation (for text context)."""
    best, gap = "", -9
    for key, label in cb.skills.items():
        imp, prep = r.get(f"pgm_skill_imp_{key}"), r.get(f"pgm_skill_prep_{key}")
        if pd.notna(imp) and pd.notna(prep) and imp - prep > gap:
            best, gap = label, imp - prep
    return best


# =============================================================================
# 5. Main programme
# =============================================================================

def generate(seed: int = 2026, schools: pd.DataFrame | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build the full synthetic export. Returns (export, ground_truth)."""
    rng = np.random.default_rng(seed)
    cb = Codebook.load()
    schools = pd.read_csv(REF / "schools.csv") if schools is None else schools
    countries = pd.read_csv(REF / "countries.csv", keep_default_na=False)
    sim = Simulator(schools, countries, cb, rng)

    rows, truths = [], []

    # Step 1: valid interviews, exactly n_respondents per school
    for _, school in schools.iterrows():
        for _ in range(int(school.n_respondents)):
            r, t = sim.respondent(school)
            add_metadata(r, rng)
            t.update(ResponseId=r["ResponseId"], school_id=school.school_id, case_type="valid")
            rows.append(r); truths.append(t)
    n_valid = len(rows)

    # Step 2: survey dirt, sized relative to the number of valid interviews
    def extra(n_share: float) -> int:
        return int(round(n_valid * n_share))

    pick_school = lambda: schools.iloc[rng.choice(len(schools), p=schools.n_respondents / schools.n_respondents.sum())]

    for _ in range(extra(0.01)):                      # declined consent
        r = add_metadata({"consent": 2}, rng, duration=rng.uniform(15, 60))
        rows.append(r); truths.append({"ResponseId": r["ResponseId"], "case_type": "no_consent"})

    for _ in range(extra(0.02)):                      # screened out: no completed degree
        base, _t = sim.respondent(pick_school())
        r = {k: base[k] for k in ("consent", "dem_birth_year", "dem_gender", "dem_country_res")}
        r.update({f"edu_deg_{d}": 4 for d in DEGREES + ["other"]})
        r["edu_deg_master"] = 2
        r["edu_deg_mba"] = rng.choice([3, 4])
        add_metadata(r, rng, duration=rng.uniform(60, 180))
        rows.append(r); truths.append({"ResponseId": r["ResponseId"], "case_type": "screen_out"})

    for _ in range(extra(0.07)):                      # break-offs
        school = pick_school()
        r, t = sim.respondent(school)
        stop = BLOCK_ORDER[int(rng.integers(0, len(BLOCK_ORDER) - 1))]
        r = truncate_after_block(r, cb, stop)
        progress = int(100 * (BLOCK_ORDER.index(stop) + 1) / (len(BLOCK_ORDER) + 1))
        add_metadata(r, rng, finished=False, progress=progress,
                     duration=rng.uniform(60, 900))
        t.update(ResponseId=r["ResponseId"], school_id=school.school_id, case_type="partial")
        rows.append(r); truths.append(t)

    for _ in range(extra(0.015)):                     # speeders / straight-liners
        school = pick_school()
        r, t = sim.respondent(school)
        r = straightline(r, cb, rng)
        add_metadata(r, rng, duration=rng.uniform(150, 280))
        t.update(ResponseId=r["ResponseId"], school_id=school.school_id, case_type="speeder")
        rows.append(r); truths.append(t)

    for _ in range(extra(0.005)):                     # bots: implausible answers, low reCAPTCHA
        school = pick_school()
        r, t = sim.respondent(school)
        for k in list(r):
            if k.startswith(("pgm_", "wb_", "car_", "out_")) and isinstance(r[k], int) and k != "pgm_nps":
                r[k] = int(rng.integers(1, 6))
        r["pgm_nps"] = int(rng.integers(0, 11))
        add_metadata(r, rng, duration=rng.uniform(90, 200))
        r["Q_RecaptchaScore"] = round(float(rng.uniform(0.1, 0.4)), 2)
        t.update(ResponseId=r["ResponseId"], school_id=school.school_id, case_type="bot")
        rows.append(r); truths.append(t)

    for _ in range(extra(0.005)):                     # duplicates of valid interviews
        j = int(rng.integers(0, n_valid))
        r = dict(rows[j])
        add_metadata(r, rng)
        r["Q_RelevantIDDuplicate"] = "true"
        t = dict(truths[j]); t.update(ResponseId=r["ResponseId"], case_type="duplicate",
                                      duplicate_of=rows[j]["ResponseId"])
        rows.append(r); truths.append(t)

    # Step 3: assemble, shuffle into arrival order, enforce survey logic
    df = pd.DataFrame(rows)
    for c in cb.names:
        if c not in df.columns:
            df[c] = np.nan
    df = df[cb.names]
    df = blank_hidden(df, cb)
    df = df.sort_values("StartDate").reset_index(drop=True)
    truth = pd.DataFrame(truths)
    return df, truth


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args(argv)

    cb = Codebook.load()
    df, truth = generate(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)
    write_qualtrics_csv(df, cb, OUT / "alumni_pulse_2026_synthetic_qualtrics.csv")
    truth.to_csv(OUT / "ground_truth.csv", index=False)

    # Text requests for the writer agents, one file per region
    schools = pd.read_csv(REF / "schools.csv")
    valid_ids = set(truth.loc[truth.case_type == "valid", "ResponseId"])
    valid = df[df.ResponseId.isin(valid_ids)]
    tr = truth.set_index("ResponseId").loc[valid.ResponseId].reset_index()
    tr.index = valid.index
    req = text_requests(valid, tr, schools, cb, np.random.default_rng(args.seed + 1))
    TEXT_REQ_DIR.mkdir(parents=True, exist_ok=True)
    for region, part in req.groupby("region"):
        part.to_json(TEXT_REQ_DIR / f"{region.lower()}.jsonl", orient="records",
                     lines=True, force_ascii=False)

    print(f"rows written: {len(df)}  (valid {len(valid_ids)})")
    print(truth.case_type.value_counts().to_string())
    print(f"text requests: {len(req)} respondents, "
          f"{int(req.fields.str.len().sum())} open answers")


if __name__ == "__main__":
    main()
