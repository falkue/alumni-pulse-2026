"""Tests for scripts/synthetic/merge_texts.py."""

import json

import numpy as np
import pandas as pd

from scripts.synthetic.merge_texts import load_answers, merge


def test_load_answers_last_one_wins(tmp_path):
    (tmp_path / "eu_part01.jsonl").write_text(
        json.dumps({"ResponseId": "R_1", "field": "pgm_nps_txt", "text": " first "}) + "\n\n", encoding="utf-8")
    (tmp_path / "eu_part02.jsonl").write_text(
        json.dumps({"ResponseId": "R_1", "field": "pgm_nps_txt", "text": "second"}) + "\n", encoding="utf-8")
    df = load_answers(tmp_path)
    assert len(df) == 1 and df.text.iloc[0] == "second"


def test_merge_writes_texts_and_copies_them_to_duplicates():
    export = pd.DataFrame({"ResponseId": ["R_1", "R_2", "R_3"],
                           "pgm_change_one_txt": [np.nan, np.nan, np.nan]})
    answers = pd.DataFrame({"ResponseId": ["R_1", "R_9"], "field": ["pgm_change_one_txt"] * 2,
                            "text": ["more AI", "unknown id is ignored"]})
    truth = pd.DataFrame({"ResponseId": ["R_3"], "case_type": ["duplicate"], "duplicate_of": ["R_1"]})
    out = merge(export, answers, truth)
    assert out.pgm_change_one_txt.tolist()[0] == "more AI"
    assert pd.isna(out.pgm_change_one_txt.iloc[1])
    assert out.pgm_change_one_txt.iloc[2] == "more AI"       # duplicate got the same text
    assert pd.isna(export.pgm_change_one_txt.iloc[0])        # input not modified
