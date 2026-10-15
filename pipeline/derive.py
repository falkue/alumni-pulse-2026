"""
Derived variables
=================

Turns raw answers into the analysis variables used in reports. These
re-implement (and therefore double-check) the embedded-data logic of the
Qualtrics survey flow:

    age, age_group              from the year of birth
    highest_degree              PhD > EMBA > MBA > Master > Bachelor (completed only;
                                an "other" degree counts at the level the person chose)
    years_since_grad            reference year - graduation year
    employment_status           Employed full-time / part-time / Self-employed /
                                Employed other / Student / Retired / Not employed
    nps_group                   promoter (9-10), passive (7-8), detractor (0-6)
    gap_<skill>                 importance - preparation (only where preparation was asked)
    ai_intensity                never / occasional / regular
    agentic_user                1 if experimenting or more, else 0
    salary_ppp                  annual gross salary in international PPP dollars
    salary_ppp_fte              ... scaled to a full-time position
    salary_flag                 why a salary is excluded from salary statistics ('' = ok)
    residence_region / work_region / residence_continent
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.codebook import Codebook

AGE_BINS = [0, 25, 35, 45, 55, 65, 200]
AGE_LABELS = ["< 25", "25-34", "35-44", "45-54", "55-64", "65+"]

#: Degree precedence, lowest -> highest. Matches the order of the Qualtrics
#: branches (the last matching branch wins).
DEGREE_ORDER = [("bachelor", "Bachelor", 1), ("master", "Master", 2), ("mba", "MBA", 3),
                ("emba", "EMBA", 4), ("phd", "PhD", 5)]


def age_and_group(birth_year: pd.Series, reference_year: int) -> tuple[pd.Series, pd.Series]:
    """Age in the reference year and the Qualtrics age group."""
    age = reference_year - birth_year
    group = pd.cut(age, AGE_BINS, right=False, labels=AGE_LABELS)
    return age, group.astype("string")


def highest_degree(df: pd.DataFrame) -> pd.Series:
    """Highest COMPLETED degree.

    Step by step: go through the degrees from lowest to highest and overwrite
    the result whenever a degree is completed — exactly like the survey flow.
    An "other" degree counts at its self-classified level (edu_other_level 1-5).
    """
    result = pd.Series(pd.NA, index=df.index, dtype="string")
    other_done = df["edu_deg_other"] == 1
    for key, label, level in DEGREE_ORDER:
        done = (df[f"edu_deg_{key}"] == 1) | (other_done & (df["edu_other_level"] == level))
        result = result.mask(done, label)
    # Completed only an unclassifiable "other" degree
    unclassified = result.isna() & other_done
    return result.mask(unclassified, "Unclassified")


def employment_status(df: pd.DataFrame) -> pd.Series:
    """One readable employment status per respondent."""
    conditions = [
        df.job_type == 1, df.job_type == 2, df.job_type == 3, df.job_type == 4,
        df.job_status == 1, df.job_status == 2, df.job_status.isin([3, 4, 5]),
    ]
    labels = ["Employed full-time", "Employed part-time", "Self-employed", "Employed other",
              "Student", "Retired", "Not employed"]
    return pd.Series(np.select(conditions, labels, default=""), index=df.index).replace("", pd.NA)


def nps_group(score: pd.Series) -> pd.Series:
    """promoter (9-10) / passive (7-8) / detractor (0-6); missing stays missing."""
    out = pd.Series(pd.NA, index=score.index, dtype="string")
    out[score >= 9] = "promoter"
    out[(score >= 7) & (score <= 8)] = "passive"
    out[score <= 6] = "detractor"
    return out


def skill_gaps(df: pd.DataFrame, cb: Codebook) -> pd.DataFrame:
    """gap_<skill> = importance - preparation. Positive = school under-prepared."""
    return pd.DataFrame({f"gap_{k}": df[f"pgm_skill_imp_{k}"] - df[f"pgm_skill_prep_{k}"]
                         for k in cb.skills}, index=df.index)


def robust_z(values: pd.Series) -> pd.Series:
    """Robust z-score: (x - median) / (1.4826 * MAD). 1.4826 makes MAD comparable to SD."""
    med = values.median()
    mad = (values - med).abs().median()
    if not mad or np.isnan(mad):
        return pd.Series(0.0, index=values.index)
    return (values - med) / (1.4826 * mad)


def position_adjusted_log_salary(logs: pd.Series, position: pd.Series, min_group: int = 20) -> pd.Series:
    """Log salary relative to the same position (all countries), in robust z units.

    Step by step:
      1. robust z of the log salary within each position code, i.e.
         (log salary - median of the position) / (1.4826 * MAD of the position).
         Dividing by the position's own spread matters: self-employed incomes
         scatter far more than those of specialists, so a high founder income
         is not a typing error,
      2. people without a position code, or in a position with fewer than
         ``min_group`` salaries (e.g. deans), are compared with everybody in
         such small groups together — a spread from 3 people is meaningless.
    The country median is removed afterwards by the robust z within country,
    so the result is "log salary minus position and country median".
    """
    sizes = logs.notna().groupby(position).transform("sum")
    known = position.notna() & (sizes >= min_group)
    out = robust_z(logs[~known]).reindex(logs.index) if (~known).any() else pd.Series(np.nan, index=logs.index)
    if known.any():
        out[known] = logs[known].groupby(position[known]).transform(robust_z)
    return out


def salary_variables(df: pd.DataFrame, countries: pd.DataFrame, settings: dict) -> pd.DataFrame:
    """Convert salaries to PPP dollars and flag implausible values.

    Step by step:
      1. look up the PPP conversion factor of the country of work,
      2. salary_ppp = local amount / PPP factor,
      3. full-time equivalent: divide by workload share for part-time / self-employed,
      4. flag values outside absolute limits ("implausible") and robust outliers
         within the country of work ("outlier"); with
         ``salary_z_adjust_position`` the z-score uses the salary relative to
         the typical salary of the same position (QA M4). Flagged salaries are set to NaN
         in salary_ppp_clean, the original stays in sal_disclose_1.
    """
    cfg = settings["cleaning"]
    ppp = df["job_country"].map(countries.set_index("country").ppp_lcu_per_intl_dollar)
    salary_ppp = df["sal_disclose_1"] / ppp
    workload = df["job_workload_pct"].where(df["job_type"].isin([2, 3]), 100).fillna(100)
    fte = salary_ppp / (workload.clip(lower=10) / 100)

    flag = pd.Series("", index=df.index, dtype="object")
    implausible = (salary_ppp < cfg["salary_ppp_min"]) | (salary_ppp > cfg["salary_ppp_max"])
    flag[implausible] = "implausible"
    # robust z within country of work, computed on log FTE salaries
    logs = np.log(fte.where(~implausible))
    if cfg.get("salary_z_adjust_position", False) and "job_position" in df:
        # QA M4: position explains much of the salary spread, which hides
        # typing errors (x10 gives only z of about 2-3.6). So first remove the
        # typical salary of the position, then compare within the country.
        logs = position_adjusted_log_salary(logs, df["job_position"])
    z = logs.groupby(df["job_country"]).transform(robust_z)
    flag[(flag == "") & (z.abs() > cfg["salary_robust_z_max"])] = "outlier"
    flag[salary_ppp.isna()] = ""

    ok = flag == ""
    return pd.DataFrame({
        "salary_ppp": salary_ppp.round(0),
        "salary_ppp_fte": fte.round(0),
        "salary_flag": flag,
        "salary_ppp_clean": salary_ppp.where(ok).round(0),
        "salary_ppp_fte_clean": fte.where(ok).round(0),
    }, index=df.index)


def derive_all(df: pd.DataFrame, cb: Codebook, countries: pd.DataFrame, settings: dict) -> pd.DataFrame:
    """Add all derived variables to a (cleaned) response table."""
    out = df.copy()
    ref = settings["reference_year"]
    out["age"], out["age_group"] = age_and_group(out["dem_birth_year"], ref)
    out["highest_degree"] = highest_degree(out)
    out["years_since_grad"] = ref - out["edu_grad_year"]
    out["employment_status"] = employment_status(out)
    out["nps_group"] = nps_group(out["pgm_nps"])
    out["ai_intensity"] = out["ai_use_freq"].map({1: "never", 2: "occasional", 3: "occasional",
                                                  4: "regular", 5: "regular"}).astype("string")
    out["agentic_user"] = out["ai_agentic_use"].map(lambda v: np.nan if pd.isna(v) else int(v >= 3))
    c = countries.set_index("country")
    out["residence_region"] = out["dem_country_res"].map(c.region)
    out["residence_continent"] = out["dem_country_res"].map(c.continent)
    out["work_region"] = out["job_country"].map(c.region)
    out["mobile"] = (out["dem_country_res"] != out["edu_school_1"]).astype(int)
    out = pd.concat([out, skill_gaps(out, cb), salary_variables(out, countries, settings)], axis=1)
    return out
