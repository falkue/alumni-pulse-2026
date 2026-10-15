"""
Mock longitudinal data (survey waves 2022-2026) — FOR THE PORTAL MOCK-UP ONLY
=============================================================================

The real study starts in 2026, so there is no history yet. To design the
"development over time" views in the portal, this script invents four earlier
waves for the age figures (question 1) — and nothing else.

How it works, step by step
--------------------------
1. Start from each school's REAL synthetic 2026 values (median age, quartiles, n)
   in data/processed/aggregates/schools/<id>.json.
2. Walk backwards year by year: every school gets its own slow trend
   (about +0.25 years of median age per wave, varying between schools) plus
   random noise; the quartiles move with the median. n shrinks a little per
   year back (the study grows over time).
3. About 30 % of the schools join the study later (2023, 2024 or 2025) and
   therefore have no values before their first wave.
4. Write one file per school (tenant separation, like the real aggregates) to
   data/processed/aggregates/waves_mock/<id>.json containing
     - the school's own values per wave,
     - per benchmark group ("all" and the school's region): the median and
       middle-50 % band of the school medians per wave, and the ANONYMOUS
       values of the other schools (no names, no ids, sorted).
   Every file carries "simulated": true so the portal can label it.

Deterministic (fixed seed), synthetic mode only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline.environment import resolve_context  # noqa: E402

AGG = ROOT / "data" / "processed" / "aggregates"
OUT = AGG / "waves_mock"
WAVES = [2022, 2023, 2024, 2025, 2026]
MIN_N_SCHOOL = 10


def half(v: float) -> float:
    """Round to the nearest 0.5 (medians of whole ages are x.0 or x.5)."""
    return round(v * 2) / 2


def simulate_history(current: dict, rng: np.random.Generator) -> dict:
    """Invent earlier waves for one school.

    ``current`` = {"median", "q1", "q3", "n"} for 2026.
    Returns {year: {...} or None}; years before the school joined are None.
    """
    u = rng.random()
    join = 2022 if u < 0.7 else (2023 if u < 0.8 else (2024 if u < 0.9 else 2025))
    slope = 0.25 + 0.45 * rng.normal()
    med, q1, q3, n = current["median"], current["q1"], current["q3"], current["n"]
    out = {}
    for year in reversed(WAVES):
        if year < join:
            out[year] = None
            continue
        out[year] = {"median": half(med), "q1": half(q1), "q3": half(q3), "n": int(max(MIN_N_SCHOOL, round(n)))}
        step = slope + 0.6 * rng.normal()
        med -= step
        q1 = min(q1 - (0.8 * step + 0.3 * rng.normal()), med - 1)
        q3 = max(q3 - (1.1 * step + 0.4 * rng.normal()), med + 1)
        n *= 0.82 + 0.12 * rng.random()
    out[2026] = {"median": current["median"], "q1": current["q1"], "q3": current["q3"], "n": current["n"]}
    return dict(sorted(out.items()))


def band(values: list[float]) -> dict | None:
    """Median and middle-50 % band of a list of school medians."""
    if not values:
        return None
    a = np.array(values, dtype=float)
    return {"median": round(float(np.median(a)), 2), "p25": round(float(np.quantile(a, 0.25)), 2),
            "p75": round(float(np.quantile(a, 0.75)), 2), "n_schools": len(values)}


def build(school_docs: dict, seed: int = 2026) -> dict:
    """Return {school_id: mock document} for all schools with a published 2026 profile."""
    rng = np.random.default_rng(seed)
    hist, region = {}, {}
    for sid in sorted(school_docs):
        d = school_docs[sid]
        if not d["published"] or d.get("demo"):        # the demo pseudo-school is handled below
            continue
        mt = d["metrics"]
        hist[sid] = simulate_history({"median": mt["demographics.age.median"], "q1": mt["demographics.age.q1"],
                                      "q3": mt["demographics.age.q3"], "n": d["n"]}, rng)
        region[sid] = d["school"]["region"]

    docs = {}
    for sid in hist:
        groups = {"all": ("All participating schools", list(hist)),
                  f"region={region[sid]}": (region[sid], [s for s in hist if region[s] == region[sid]])}
        bench = {}
        for key, (label, members) in groups.items():
            per_wave = {}
            for y in WAVES:
                present = [s for s in members if hist[s][y] is not None]
                peers = sorted(({"median": hist[s][y]["median"], "q1": hist[s][y]["q1"], "q3": hist[s][y]["q3"]}
                                for s in present if s != sid), key=lambda r: (r["median"], r["q1"]))
                per_wave[y] = {"band": band([hist[s][y]["median"] for s in present]), "peers": peers}
            bench[key] = {"label": label, "waves": per_wave}
        docs[sid] = {"school_id": sid, "simulated": True, "metric": "demographics.age",
                     "note": "2026 = synthetic dataset; 2022-2025 simulated for the portal mock-up only",
                     "waves": WAVES, "own": hist[sid], "benchmarks": bench}
    # Demo pseudo-school "ALL": own history from the pooled figures, compared
    # with all real schools (it is never a peer of anybody itself).
    demo = next((d for d in school_docs.values() if d.get("demo")), None)
    if demo:
        mt = demo["metrics"]
        own = simulate_history({"median": mt["demographics.age.median"], "q1": mt["demographics.age.q1"],
                                "q3": mt["demographics.age.q3"], "n": demo["n"]}, rng)
        own = {y: own[2026] if y == 2026 else (v or None) for y, v in own.items()}
        # the pooled view exists in every wave (it is the whole study)
        for y in WAVES:
            if own[y] is None:
                own[y] = {**own[2026], "n": int(own[2026]["n"] * (0.6 + 0.1 * (y - 2022)))}
        per_wave = {}
        for y in WAVES:
            present = [s for s in hist if hist[s][y] is not None]
            per_wave[y] = {"band": band([hist[s][y]["median"] for s in present]),
                           "peers": sorted(({"median": hist[s][y]["median"], "q1": hist[s][y]["q1"],
                                             "q3": hist[s][y]["q3"]} for s in present),
                                           key=lambda r: (r["median"], r["q1"]))}
        sid = demo["school"]["school_id"]
        docs[sid] = {"school_id": sid, "simulated": True, "demo": True, "metric": "demographics.age",
                     "note": "Demo view: all schools pooled; 2022-2025 simulated for the portal mock-up only",
                     "waves": WAVES, "own": own,
                     "benchmarks": {"all": {"label": "All participating schools", "waves": per_wave}}}
    return docs


def main() -> None:
    if resolve_context().is_production:
        raise SystemExit("mock_waves.py is for synthetic data only.")
    school_docs = {p.stem: json.loads(p.read_text()) for p in (AGG / "schools").glob("*.json")}
    docs = build(school_docs)
    OUT.mkdir(parents=True, exist_ok=True)
    for sid, doc in docs.items():
        (OUT / f"{sid}.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    joined_late = sum(doc["own"][2022] is None for doc in docs.values())
    print(f"written {len(docs)} mock files to {OUT.relative_to(ROOT)}; {joined_late} schools join after 2022")


if __name__ == "__main__":
    main()
