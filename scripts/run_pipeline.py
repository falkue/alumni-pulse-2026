"""
Run the complete analysis pipeline
==================================

    raw Qualtrics export  ->  cleaning  ->  derived variables  ->  aggregates

Usage (from the project root):

    .venv/bin/python scripts/run_pipeline.py                 # synthetic data (default)
    .venv/bin/python scripts/run_pipeline.py --raw <file>    # another synthetic export

Real data (production mode) are processed ONLY by a human in their own
terminal, never from Claude Code - see pipeline/environment.py and
docs/data_governance.md. In production mode the newest CSV in the secure
raw/ folder is used and every output is written to the secure folder.

Outputs (synthetic mode; production mode writes the same tree into the secure folder)
-------
data/interim/cases_classified.csv          every response with its case_status
data/processed/respondents/respondents.parquet / .csv
                                            valid responses + derived variables
data/processed/aggregates/schools/<id>.json one document per school (report + portal)
data/processed/aggregates/benchmarks/<group>.json
data/processed/aggregates/school_kpis.csv   headline KPIs, one row per school
qa/pipeline_summary.json                    counts and exclusions for the methods section
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.aggregate import build_aggregates  # noqa: E402
from pipeline.clean import classify_cases, exclusion_table  # noqa: E402
from pipeline.codebook import Codebook  # noqa: E402
from pipeline.derive import derive_all  # noqa: E402
from pipeline.environment import resolve_context  # noqa: E402
from pipeline.ingest import load_settings, read_qualtrics_csv  # noqa: E402
from pipeline.logic import logic_violations  # noqa: E402


def _json_default(obj):
    """Make numpy/pandas values JSON-serialisable."""
    if hasattr(obj, "item"):
        return obj.item()
    if pd.isna(obj):
        return None
    raise TypeError(type(obj))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1, default=_json_default)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", help="path to the Qualtrics CSV (default: settings.yaml)")
    args = ap.parse_args(argv)

    ctx = resolve_context()          # raises DataPolicyError if the run is not allowed
    settings = load_settings()
    cb = Codebook.load()
    if ctx.is_production:
        exports = sorted(ctx.raw_dir.glob("*.csv"), key=lambda f: f.stat().st_mtime)
        if not exports:
            raise SystemExit(f"No Qualtrics CSV found in {ctx.raw_dir}")
        raw_path = ctx.raw_dir / args.raw if args.raw else exports[-1]
    else:
        raw_path = ROOT / (args.raw or settings["paths"]["raw_export"])
    schools = pd.read_csv(ROOT / settings["paths"]["schools"])
    countries = pd.read_csv(ROOT / settings["paths"]["countries"], keep_default_na=False)
    interim, processed, qa = ctx.interim_dir, ctx.processed_dir, ctx.qa_dir
    print(f"mode: {ctx.mode}")

    # 1. ingest
    raw = read_qualtrics_csv(raw_path, cb)
    print(f"read {len(raw)} rows from {raw_path.name}")

    # 2. classify cases
    classified = classify_cases(raw, schools, settings)
    for d in (interim, processed, qa):
        d.mkdir(parents=True, exist_ok=True)
    classified[["ResponseId", "school_id", "case_status", "Finished", "Progress",
                "Duration (in seconds)", "Q_RecaptchaScore", "straightline_items"]] \
        .to_csv(interim / "cases_classified.csv", index=False)
    excl = exclusion_table(classified)
    print(excl.to_string(index=False))

    # 3. logic check on valid cases (should be empty for clean data)
    valid = classified[classified.case_status == "valid"].copy()
    violations = logic_violations(valid, cb)
    violations.to_csv(qa / "logic_violations.csv", index=False)

    # 4. derived variables
    resp = derive_all(valid, cb, countries, settings)
    out_dir = processed / "respondents"
    out_dir.mkdir(parents=True, exist_ok=True)
    resp.to_parquet(out_dir / "respondents.parquet", index=False)
    resp.to_csv(out_dir / "respondents.csv", index=False)

    # 5. aggregates for reports and portal
    school_docs, bench_docs, kpis = build_aggregates(resp, schools, cb, settings,
                                                   include_demo=not ctx.is_production)
    agg = processed / "aggregates"
    for sid, doc in school_docs.items():
        write_json(agg / "schools" / f"{sid}.json", doc)
    for key, doc in bench_docs.items():
        write_json(agg / "benchmarks" / f"{key.replace('=', '__')}.json", doc)
    kpis.to_csv(agg / "school_kpis.csv", index=False)

    summary = {
        "mode": ctx.mode,
        "raw_file": raw_path.name,
        "rows_read": len(raw),
        "exclusions": dict(zip(excl.case_status, excl.n.astype(int))),
        "median_duration_seconds": classified.attrs.get("median_duration"),
        "valid_respondents": len(resp),
        "schools_with_published_profile": sum(d["published"] for d in school_docs.values()),
        "benchmark_groups_published": [k for k, d in bench_docs.items() if d["published"]],
        "benchmark_groups_suppressed": [k for k, d in bench_docs.items() if not d["published"]],
        "salary_flags": resp.salary_flag.value_counts().to_dict(),
        "logic_violations": len(violations),
        "unknown_columns": raw.attrs.get("unknown_columns", []),
    }
    write_json(qa / "pipeline_summary.json", summary)
    print(json.dumps({k: summary[k] for k in ("valid_respondents", "salary_flags",
                                               "logic_violations", "benchmark_groups_suppressed")},
                     indent=1, default=_json_default))


if __name__ == "__main__":
    main()
