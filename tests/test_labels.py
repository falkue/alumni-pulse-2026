"""Tests for pipeline/labels.py."""

import numpy as np
import pandas as pd

from pipeline.codebook import Codebook
from pipeline.labels import apply_labels

CB = Codebook.load()


def test_single_multi_and_untouched_columns():
    df = pd.DataFrame({"pgm_satisfaction": [5, np.nan, 7], "ce_type_3": [1, np.nan, np.nan],
                       "dem_birth_year": [1990, 1985, 1970], "other": ["a", "b", "c"]})
    out = apply_labels(df, CB)
    assert out.pgm_satisfaction.tolist() == ["Very satisfied", "", 7]   # 7 unknown -> kept
    assert out.ce_type_3.tolist() == ["x", "", ""]
    assert out.dem_birth_year.tolist() == [1990, 1985, 1970]
    assert out.other.tolist() == ["a", "b", "c"]


def test_rename_columns():
    out = apply_labels(pd.DataFrame({"pgm_nps": [10]}), CB, rename_columns=True)
    assert list(out.columns) == ["pgm_nps | Likelihood to recommend (0-10)"]
    assert out.iloc[0, 0] == "10"
