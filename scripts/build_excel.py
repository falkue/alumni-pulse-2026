"""
Build the Excel workbook of the synthetic dataset (for browsing and brainstorming)
================================================================================

Writes data/synthetic/Alumni_Pulse_2026_synthetic_dataset.xlsx with the sheets

  README            what this is and how the sheets relate
  Responses_labels  valid respondents, codes replaced by labels, + derived variables
  Responses_codes   the same respondents with numeric codes (for analysis tools)
  Open_answers      all free-text answers in long format (one row per answer)
  School_KPIs       headline KPIs per school
  Schools           reference data of the 50 (fictional) schools
  Codebook          every variable with label, type, values and display condition
  Case_status       every raw row with its cleaning decision

Synthetic mode only — this script refuses to run in production mode.
Run after scripts/run_pipeline.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.codebook import Codebook  # noqa: E402
from pipeline.environment import resolve_context  # noqa: E402
from pipeline.labels import apply_labels  # noqa: E402

OUT = ROOT / "data" / "synthetic" / "Alumni_Pulse_2026_synthetic_dataset.xlsx"

README = [
    ("What", "SYNTHETIC test data for the Global Alumni Pulse 2026 — all schools and people are fictional."),
    ("Purpose", "Report mock-ups, analysis brainstorming and pipeline tests before real fieldwork."),
    ("Schools", "50 fictional business schools: 25 Europe, 10 Americas, 15 Asia."),
    ("Respondents", "Valid interviews after cleaning; raw file also contains break-offs, speeders, bots, duplicates."),
    ("Format", "The raw CSV mirrors a Qualtrics numeric export (3 header rows); see codebook/codebook.yaml."),
    ("Derived variables", "age_group, highest_degree, nps_group, gap_<skill>, salary_ppp(_fte)(_clean), salary_flag ..."),
    ("Salary", "salary_ppp = local amount / PPP factor of the country of work; *_clean excludes flagged values."),
    ("Caution", "Numbers are produced by a simulation model; patterns are plausible, not empirical findings."),
]


def codebook_table(cb: Codebook) -> pd.DataFrame:
    return pd.DataFrame([{
        "column": c.name, "question": c.question, "block": c.block, "type": c.type, "label": c.label,
        "values": "; ".join(f"{k}={v}" for k, v in c.values.items()) if c.type != "multi_option" else "1=ticked",
        "display_if": c.display_if,
    } for c in cb.columns])


def main() -> None:
    ctx = resolve_context()
    if ctx.is_production:
        raise SystemExit("build_excel.py is for synthetic data only.")
    cb = Codebook.load()
    proc = ROOT / "data" / "processed"
    resp = pd.read_parquet(proc / "respondents" / "respondents.parquet")
    schools = pd.read_csv(ROOT / "data" / "reference" / "schools.csv")
    kpis = pd.read_csv(proc / "aggregates" / "school_kpis.csv")
    cases = pd.read_csv(ROOT / "data" / "interim" / "cases_classified.csv")
    texts_path = ROOT / "data" / "synthetic" / "open_answers_long.csv"
    texts = pd.read_csv(texts_path) if texts_path.exists() else pd.DataFrame()

    # put school id/name first, drop empty helper columns
    resp = resp.merge(schools[["school_id", "school_name", "region"]], on="school_id", how="left")
    first = ["ResponseId", "school_id", "school_name", "region"]
    resp = resp[first + [c for c in resp.columns if c not in first]]
    resp = resp.dropna(axis=1, how="all")

    with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
        pd.DataFrame(README, columns=["Topic", "Explanation"]).to_excel(xw, sheet_name="README", index=False)
        apply_labels(resp, cb).to_excel(xw, sheet_name="Responses_labels", index=False)
        resp.to_excel(xw, sheet_name="Responses_codes", index=False)
        if not texts.empty:
            texts.to_excel(xw, sheet_name="Open_answers", index=False)
        kpis.to_excel(xw, sheet_name="School_KPIs", index=False)
        schools.to_excel(xw, sheet_name="Schools", index=False)
        codebook_table(cb).to_excel(xw, sheet_name="Codebook", index=False)
        cases.to_excel(xw, sheet_name="Case_status", index=False)
        # readable widths + frozen header row
        for ws in xw.book.worksheets:
            ws.freeze_panes = "A2"
            for col in ws.columns:
                width = max(len(str(c.value or "")) for c in list(col)[:200])
                ws.column_dimensions[col[0].column_letter].width = min(max(10, width + 2), 60)
    print(f"written {OUT.relative_to(ROOT)}: {len(resp)} respondents, {len(texts)} open answers")


if __name__ == "__main__":
    main()
