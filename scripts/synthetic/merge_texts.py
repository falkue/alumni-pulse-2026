"""
Merge the open answers written by the text agents into the synthetic export
==========================================================================

Input
  data/synthetic/alumni_pulse_2026_synthetic_qualtrics.csv   (numbers only)
  .work/text_responses/<chunk>_partNN.jsonl                  (one answer per line)
Output
  data/synthetic/alumni_pulse_2026_synthetic_qualtrics_with_texts.csv
  data/synthetic/open_answers_long.csv                        (ResponseId, field, language, text)

Step by step
  1. read all answer lines; if the same (ResponseId, field) appears twice,
     the last one wins (agents sometimes re-wrote an answer in a fix-up file),
  2. write each answer into its column of the matching respondent,
  3. duplicates of valid interviews (same person submitting twice) get the
     same texts as their original — realistic for a double submission,
  4. write the Qualtrics CSV again with the three header rows.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline.codebook import Codebook  # noqa: E402
from pipeline.ingest import read_qualtrics_csv  # noqa: E402
from scripts.synthetic.generate import write_qualtrics_csv  # noqa: E402

SYN = ROOT / "data" / "synthetic"
TEXT_DIR = ROOT / ".work" / "text_responses"
REQ_DIR = ROOT / ".work" / "text_requests"


def load_answers(text_dir: Path = TEXT_DIR) -> pd.DataFrame:
    """All answers as a long table; later files override earlier ones."""
    rows = []
    for part in sorted(text_dir.glob("*_part*.jsonl")):
        for line in part.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                rows.append({"ResponseId": rec["ResponseId"], "field": rec["field"],
                             "text": str(rec["text"]).strip(), "source": part.name})
    df = pd.DataFrame(rows)
    return df.drop_duplicates(["ResponseId", "field"], keep="last").reset_index(drop=True)


def merge(export: pd.DataFrame, answers: pd.DataFrame, truth: pd.DataFrame) -> pd.DataFrame:
    """Write answers into the wide export (returns a copy)."""
    out = export.copy()
    for field in answers.field.unique():
        out[field] = out[field].astype("object")
    idx = {rid: i for i, rid in enumerate(out.ResponseId)}
    for a in answers.itertuples():
        if a.ResponseId in idx:
            out.at[idx[a.ResponseId], a.field] = a.text
    # duplicates copy the texts of the interview they duplicate
    dups = truth[truth.case_type == "duplicate"][["ResponseId", "duplicate_of"]]
    text_fields = list(answers.field.unique())
    for d in dups.itertuples():
        if d.ResponseId in idx and d.duplicate_of in idx:
            out.loc[idx[d.ResponseId], text_fields] = out.loc[idx[d.duplicate_of], text_fields].values
    return out


def main() -> None:
    cb = Codebook.load()
    export = read_qualtrics_csv(SYN / "alumni_pulse_2026_synthetic_qualtrics.csv", cb)
    truth = pd.read_csv(SYN / "ground_truth.csv")
    answers = load_answers()

    # language per respondent from the requests (for the long table)
    req = pd.concat([pd.read_json(f, lines=True) for f in REQ_DIR.glob("*.jsonl")])
    answers = answers.merge(req[["ResponseId", "language", "school"]], on="ResponseId", how="left")

    merged = merge(export, answers, truth)
    write_qualtrics_csv(merged, cb, SYN / "alumni_pulse_2026_synthetic_qualtrics_with_texts.csv")
    answers.drop(columns="source").to_csv(SYN / "open_answers_long.csv", index=False)
    print(f"merged {len(answers)} open answers into {merged.ResponseId.isin(answers.ResponseId).sum()} respondents")
    print(answers.field.value_counts().to_string())


if __name__ == "__main__":
    main()
