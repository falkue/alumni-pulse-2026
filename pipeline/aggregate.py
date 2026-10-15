"""
Aggregation: school profiles and benchmarks
===========================================

One function, :func:`profile`, turns a set of respondents into a flat
dictionary of key figures ("metrics"). The SAME function is used for

* a single school            -> what the school sees about itself
* a benchmark group          -> e.g. all European schools, all tier-1 schools

so school and benchmark figures are always computed identically.

Metric keys follow the pattern ``<section>.<item>.<statistic>``, e.g.
``program.nps``, ``program.rate_network.top2``, ``skills.ai.gap``,
``ai.task_1.share``. These keys are what the PDF report and the portal use.

Benchmarks and anonymity
------------------------
A benchmark group is only published if it contains at least
``min_schools_benchmark`` schools and ``min_n_benchmark`` respondents
(settings.yaml). Otherwise a single school could be identified.
Benchmark figures are POOLED over respondents (big schools weigh more); in
addition each school gets its percentile rank among the schools of the group
for the headline KPIs.
"""

from __future__ import annotations

import pandas as pd

from pipeline import metrics as m
from pipeline.codebook import Codebook
from pipeline.logic import display_mask
from pipeline.suppression import protected_shares

#: School attributes that may leave the pipeline (whitelist: anything else,
#: e.g. simulation parameters or internal notes, stays internal)
SCHOOL_FIELDS = ["school_id", "school_name", "school_short", "country", "iso2", "region",
                 "subregion", "city", "institution_type", "aacsb", "equis", "bgs_chapter",
                 "ranking_tier"]

#: Headline KPIs: shown on the first page and used for percentile ranks
HEADLINE_KPIS = ["program.nps", "program.satisfaction.top2", "career.satisfaction.top2",
                 "career.hopeful.top2", "career.salary_ppp_fte.median", "ai.daily.share",
                 "skills.ai.gap"]

#: School-level values that are shared ANONYMOUSLY with other schools of a
#: benchmark group (no names, no ids, sorted by value) so that a school can see
#: where it stands among its peers (e.g. the dot plot of median ages).
PEER_FIELDS = ["demographics.age.median", "demographics.age.q1", "demographics.age.q3"] + HEADLINE_KPIS

AGE_GROUPS = ["< 25", "25-34", "35-44", "45-54", "55-64", "65+"]


def age_gender_pyramid(df: pd.DataFrame, min_n: int, min_persons: int = 3) -> dict | None:
    """Share (in %) of each age group x gender cell among respondents with gender female/male.

    The base is everybody who answered female or male, so all 12 cells add up
    to 100 % (up to rounding: each cell is rounded on its own, the sum may be
    99.8-100.2). Non-binary and "prefer not to say" are excluded from the base
    (too few for a separate bar) and reported separately as gender shares.

    Small-cell protection: cells with 1 to min_persons-1 people are None, plus
    secondary suppression so that no hidden cell can be recovered from the
    published totals (gender shares = columns, age-group shares = rows).
    """
    base = df[df.dem_gender.isin([1, 2])]
    if len(base) < min_n:
        return None
    # Step 1: count persons per cell
    sexes = {"female": 1, "male": 2}
    counts = {(ag, sx): int(((base.age_group == ag) & (base.dem_gender == code)).sum())
              for ag in AGE_GROUPS for sx, code in sexes.items()}
    # Step 2: margins whose totals are published elsewhere
    columns = [[(ag, sx) for ag in AGE_GROUPS] for sx in sexes]
    rows = [[(ag, sx) for sx in sexes] for ag in AGE_GROUPS]
    # Step 3: percentages with protected cells set to None
    shares = protected_shares(counts, len(base), columns + rows + [list(counts)], min_persons)
    return {ag: {sx: shares[(ag, sx)] for sx in sexes} for ag in AGE_GROUPS}


def protected_distribution(values: pd.Series, codes: list, min_n: int, min_persons: int) -> dict | None:
    """Percentage distribution over ``codes`` (base = valid answers) with small-cell protection."""
    s = values.dropna()
    s = s[s.isin(codes)]
    if len(s) < min_n:
        return None
    counts = {c: int((s == c).sum()) for c in codes}
    return protected_shares(counts, len(s), [list(codes)], min_persons)


#: Employment flow (career question 1 + follow-ups): leaf label -> (branch, column, code)
EMPLOYMENT_LEAVES = {
    "employed": {"full_time": ("job_type", 1), "part_time": ("job_type", 2),
                 "self_employed": ("job_type", 3), "other_employment": ("job_type", 4)},
    "not_employed": {"student": ("job_status", 1), "retired": ("job_status", 2),
                     "seeking_work": ("job_status", 3), "not_seeking_work": ("job_status", 4),
                     "other_situation": ("job_status", 5)},
}


def employment_flow(df: pd.DataFrame, min_n: int, min_persons: int = 3) -> dict | None:
    """Shares (in % of all respondents) for the employment Sankey.

    Structure: {"employed": {"total": x, "full_time": ..., ...},
                "not_employed": {"total": y, "seeking_work": ..., ...}}
    Step by step:
      1. count people per branch (job_employed 1/2) and per leaf (job_type / job_status),
      2. protect small cells: a leaf with 1-2 people is None, and secondary
         suppression inside each branch (the branch total is published),
      3. branch totals are protected as well (margin = all respondents).
    Leaves that nobody chose are kept as 0.0 so the chart can show them as empty.
    """
    base = df[df.job_employed.isin([1, 2])]
    if len(base) < min_n:
        return None
    counts, margins = {}, []
    for branch, code in (("employed", 1), ("not_employed", 2)):
        part = base[base.job_employed == code]
        keys = []
        for leaf, (col, val) in EMPLOYMENT_LEAVES[branch].items():
            counts[(branch, leaf)] = int((part[col] == val).sum())
            keys.append((branch, leaf))
        # people of the branch whose follow-up answer is missing would break the margin -> count them as "other"
        missing = len(part) - sum(counts[k] for k in keys)
        other = (branch, "other_employment" if branch == "employed" else "other_situation")
        counts[other] += missing
        margins.append(keys)
    totals = {("total", "employed"): int((base.job_employed == 1).sum()),
              ("total", "not_employed"): int((base.job_employed == 2).sum())}
    leaf_shares = protected_shares(counts, len(base), margins, min_persons)
    total_shares = protected_shares(totals, len(base), [list(totals)], min_persons)
    out = {}
    for branch in ("employed", "not_employed"):
        out[branch] = {"total": total_shares[("total", branch)]}
        out[branch].update({leaf: leaf_shares[(branch, leaf)] for leaf in EMPLOYMENT_LEAVES[branch]})
    out["n"] = int(len(base))
    return out


def profile(df: pd.DataFrame, cb: Codebook, min_n: int, min_persons: int = 3) -> dict:
    """All key figures for one group of (valid, derived) respondents.

    ``min_persons``: smallest number of people a published breakdown cell may
    represent (small-cell protection for demographic breakdowns).
    """
    p: dict = {"n": int(len(df))}

    # --- demographics (question 1: year of birth -> age) -----------------------
    p["demographics.age.median"] = m.median(df.age, min_n)
    p["demographics.age.q1"] = m.quantile(df.age, 0.25, min_n)
    p["demographics.age.q3"] = m.quantile(df.age, 0.75, min_n)
    p["demographics.age.mean"] = m.mean(df.age, min_n, digits=1)
    p["demographics.age_group.dist"] = protected_distribution(df.age_group, AGE_GROUPS, min_n, min_persons)
    p["demographics.gender.dist"] = protected_distribution(df.dem_gender, [1, 2, 3, 99], min_n, min_persons)
    p["demographics.age_gender.pyramid"] = age_gender_pyramid(df, min_n, min_persons)

    # --- programme evaluation -------------------------------------------------
    p["program.nps"] = m.nps(df.pgm_nps, min_n)
    for grp in ("promoter", "passive", "detractor"):
        p[f"program.nps_{grp}.share"] = m.share(df.nps_group, grp, min_n)
    p["program.satisfaction.mean"] = m.mean(df.pgm_satisfaction, min_n)
    p["program.satisfaction.top2"] = m.top_box(df.pgm_satisfaction, min_n=min_n)
    for item in ("relevance", "leadership_prep", "theory_practice", "reputation",
                 "interaction", "network"):
        p[f"program.rate_{item}.mean"] = m.mean(df[f"pgm_rate_{item}"], min_n)
        p[f"program.rate_{item}.top2"] = m.top_box(df[f"pgm_rate_{item}"], min_n=min_n)

    # --- skills: importance, preparation, gap --------------------------------------
    for key in cb.skills:
        p[f"skills.{key}.importance"] = m.mean(df[f"pgm_skill_imp_{key}"], min_n)
        p[f"skills.{key}.preparation"] = m.mean(df[f"pgm_skill_prep_{key}"], min_n)
        p[f"skills.{key}.gap"] = m.mean(df[f"gap_{key}"], min_n)

    # --- career and salary -------------------------------------------------------------
    p["career.employed.share"] = m.share(df.job_employed, 1, min_n)
    p["career.employment.flow"] = employment_flow(df, min_n, min_persons)
    p["career.satisfaction.top2"] = m.top_box(df.car_satisfaction, min_n=min_n)
    p["career.satisfaction.mean"] = m.mean(df.car_satisfaction, min_n)
    p["career.hopeful.top2"] = m.top_box(df.car_hopeful, min_n=min_n)
    p["career.salary_ppp_fte.median"] = m.median(df.salary_ppp_fte_clean, min_n)
    # base: employed respondents only (the salary question is shown only to them)
    employed = df[df.job_employed == 1]
    p["career.salary_disclosed.share"] = m.share(employed.sal_disclose_2.fillna(0), 0, min_n)
    p["career.mobile.share"] = m.share(df.mobile, 1, min_n)
    p["career.position.dist"] = m.distribution(df.job_position, list(cb["job_position"].values), min_n)
    p["career.org_type.dist"] = m.distribution(df.job_org_type, list(cb["job_org_type"].values), min_n)
    p["career.industry.dist"] = m.distribution(df.job_industry, list(cb["job_industry"].values), min_n)
    p["career.ce_any.share"] = m.share(df.ce_any, 1, min_n)

    # --- wellbeing and outlook ------------------------------------------------------------
    for i, name in ((1, "private_life"), (2, "health"), (3, "finances")):
        p[f"wellbeing.{name}.mean"] = m.mean(df[f"wb_{i}"], min_n)
    p["wellbeing.stress_high.share"] = m.share(df.wb_stress, [4, 5], min_n)
    p["wellbeing.work_life.top2"] = m.top_box(df.wb_work_life, min_n=min_n)
    p["outlook.global.mean"] = m.mean(df.out_global, min_n)
    p["outlook.country.mean"] = m.mean(df.out_country, min_n)

    # --- AI ---------------------------------------------------------------------------------
    p["ai.use_freq.dist"] = m.distribution(df.ai_use_freq, [1, 2, 3, 4, 5], min_n)
    p["ai.daily.share"] = m.share(df.ai_use_freq, 5, min_n)
    p["ai.never.share"] = m.share(df.ai_use_freq, 1, min_n)
    p["ai.agentic_user.share"] = m.share(df.agentic_user, 1, min_n)
    p["ai.agentic_use.dist"] = m.distribution(df.ai_agentic_use, [1, 2, 3, 4, 5], min_n)
    p["ai.headcount_reduce.share"] = m.share(df.ai_headcount_outlook[df.ai_headcount_outlook != 99],
                                             [1, 2], min_n)
    for item in ("perf_assessed", "guidelines", "roi_expected", "junior_tasks",
                 "trust_outputs", "ethics_concern"):
        p[f"ai.org_{item}.top2"] = m.top_box(df[f"ai_org_{item}"], min_n=min_n)
    p["ai.time_saved.dist"] = m.distribution(df.ai_time_saved, list(cb["ai_time_saved"].values), min_n)

    # --- multi-select questions: share per option, base = people who saw it --------------
    multi_sections = {"out_soc_chall": "outlook", "out_econ_chall": "outlook", "ce_type": "career",
                      "ai_barrier": "ai", "ai_task": "ai", "ai_agentic_task": "ai",
                      "ai_skill_need": "ai", "ai_access": "ai", "ai_org_meas": "ai"}
    for q, section in multi_sections.items():
        cols = cb.multi_columns(q)
        shown = display_mask(df.assign(screened_in=1), cb.question_specs[q].get("display_if", ""))
        shares = m.multi_share(df, cols, shown, min_n)
        short = q.replace("ai_", "") if section == "ai" else q
        for col, val in shares.items():
            p[f"{section}.{short}_{cb[col].option_code}.share"] = val
    return p


def peer_values(group_schools: list, own_id: str, school_profiles: dict, cfg: dict) -> list[dict]:
    """Anonymous school-level values of the OTHER schools in a benchmark group.

    Step by step: take every other school of the group that is large enough to
    be shown (n >= min_n_school), keep only PEER_FIELDS (no name, no id), and
    sort the list by the first field so that the order reveals nothing.
    """
    rows = [{f: school_profiles[o][f] for f in PEER_FIELDS}
            for o in group_schools
            if o != own_id and school_profiles[o]["n"] >= cfg["min_n_school"]]
    key = PEER_FIELDS[0]
    return sorted(rows, key=lambda r: (r[key] is None, r[key] if r[key] is not None else 0))


DEMO_ALL_ID = "ALL"


def demo_all_schools_doc(bench_docs: dict, school_profiles: dict, cfg: dict) -> dict:
    """Pseudo-school "ALL" for demonstrations of the school (customer) view.

    It looks exactly like a school document, but "own" figures are the pooled
    figures of ALL participating schools. Benchmarks are the published groups
    (e.g. a region), and the peers are all schools of the group (no school is
    excluded because "ALL" is not one of them). Percentile ranks make no sense
    for a pooled pseudo-school and are therefore empty. Marked ``demo: true``.
    """
    pooled = bench_docs["all"]
    benches = {k: b for k, b in bench_docs.items() if b["published"]}
    return {
        "school": {"school_id": DEMO_ALL_ID, "school_name": "All participating schools (demo)",
                   "school_short": "ALL", "country": None, "iso2": None, "region": "All regions",
                   "subregion": None, "city": None, "institution_type": "all", "aacsb": None,
                   "equis": None, "bgs_chapter": None, "ranking_tier": None},
        "demo": True,
        "n": pooled["n"], "n_schools": pooled["n_schools"], "published": True,
        "metrics": pooled["metrics"],
        "benchmarks": {k: {"label": b["label"], "n_schools": b["n_schools"], "n": b["n"],
                           "metrics": b["metrics"],
                           "peers": peer_values(b["schools"], DEMO_ALL_ID, school_profiles, cfg)}
                       for k, b in benches.items()},
        "percentile_ranks": {kpi: {} for kpi in HEADLINE_KPIS},
    }


# =============================================================================
# Benchmark groups
# =============================================================================

def benchmark_groups(schools: pd.DataFrame, group_types: list[str]) -> list[dict]:
    """List all benchmark groups, e.g. {'type': 'region', 'value': 'Europe', 'schools': [...]}."""
    groups = []
    for gtype in group_types:
        if gtype == "all":
            groups.append({"key": "all", "type": "all", "label": "All participating schools",
                           "schools": list(schools.school_id)})
            continue
        for value, part in schools.groupby(gtype):
            label = {"region": f"{value}", "ranking_tier": f"Ranking tier {value}",
                     "institution_type": str(value).replace("_", " ").title(),
                     "aacsb": "AACSB accredited" if value == 1 else "Not AACSB accredited"}[gtype]
            groups.append({"key": f"{gtype}={value}", "type": gtype, "label": label,
                           "schools": list(part.school_id)})
    return groups


def build_aggregates(resp: pd.DataFrame, schools: pd.DataFrame, cb: Codebook,
                     settings: dict, include_demo: bool = False) -> tuple[dict, dict, pd.DataFrame]:
    """Compute everything the reports need.

    Returns
      school_docs  school_id -> dict (meta, own metrics, benchmark metrics, ranks)
      bench_docs   group key -> dict (label, n_schools, n, metrics) or suppressed
      kpi_table    one row per school with the headline KPIs (for tables/Excel)

    ``include_demo`` adds the pseudo-school "ALL" (see :func:`demo_all_schools_doc`);
    only in synthetic mode and only if ``reporting.demo_all_schools_view`` is true.
    """
    cfg = settings["reporting"]

    # Step 1: one profile per school
    school_profiles = {}
    for sid in schools.school_id:
        part = resp[resp.school_id == sid]
        school_profiles[sid] = profile(part, cb, cfg["min_n_cell"], cfg.get("min_cell_persons", 3))

    # Step 2: one profile per benchmark group (if big enough)
    bench_docs = {}
    for g in benchmark_groups(schools, cfg["benchmark_groups"]):
        part = resp[resp.school_id.isin(g["schools"])]
        n_schools = int(part.school_id.nunique())
        publishable = n_schools >= cfg["min_schools_benchmark"] and len(part) >= cfg["min_n_benchmark"]
        bench_docs[g["key"]] = {
            "key": g["key"], "type": g["type"], "label": g["label"],
            "n_schools": n_schools, "n": int(len(part)), "published": publishable,
            "metrics": profile(part, cb, cfg["min_n_cell"], cfg.get("min_cell_persons", 3)) if publishable else None,
            "schools": g["schools"],
        }

    # Step 3: per school document with matching benchmarks and percentile ranks
    school_docs = {}
    for _, s in schools.iterrows():
        sid = s.school_id
        own = school_profiles[sid]
        shown = own["n"] >= cfg["min_n_school"]
        keys = ["all"] + [f"{t}={s[t]}" for t in cfg["benchmark_groups"] if t != "all"]
        benches = {k: bench_docs[k] for k in keys if k in bench_docs and bench_docs[k]["published"]}
        ranks = {}
        for kpi in HEADLINE_KPIS:
            ranks[kpi] = {}
            for k, b in benches.items():
                others = [school_profiles[o][kpi] for o in b["schools"]
                          if school_profiles[o]["n"] >= cfg["min_n_school"]]
                ranks[kpi][k] = m.percentile_rank(own[kpi], others) if shown else None
        school_docs[sid] = {
            "school": {k: (s[k].item() if hasattr(s[k], "item") else s[k]) for k in SCHOOL_FIELDS},
            "n": own["n"], "published": shown,
            "metrics": own if shown else None,
            "benchmarks": {k: {"label": b["label"], "n_schools": b["n_schools"], "n": b["n"],
                               "metrics": b["metrics"],
                               "peers": peer_values(b["schools"], sid, school_profiles, cfg)}
                           for k, b in benches.items()},
            "percentile_ranks": ranks,
        }

    # Step 3b: optional demo document "all schools as if they were one school"
    if include_demo and cfg.get("demo_all_schools_view", False):
        school_docs[DEMO_ALL_ID] = demo_all_schools_doc(bench_docs, school_profiles, cfg)

    # Step 4: flat KPI table
    rows = []
    for sid, prof in school_profiles.items():
        row = {"school_id": sid, "n": prof["n"]}
        shown = prof["n"] >= cfg["min_n_school"]          # same rule as the school documents
        row.update({k: (prof[k] if shown else None) for k in HEADLINE_KPIS})
        rows.append(row)
    kpi_table = schools[["school_id", "school_name", "country", "region", "ranking_tier",
                         "institution_type", "aacsb"]].merge(pd.DataFrame(rows), on="school_id")
    return school_docs, bench_docs, kpi_table
