"""Tests for pipeline/codebook.py — does the YAML expand into the right columns?"""

from pipeline.codebook import Codebook


def test_codebook_loads_and_names_are_unique():
    cb = Codebook.load()
    assert len(cb.names) == len(set(cb.names)), "duplicate column names in codebook"


def test_skill_matrix_expands_to_17_importance_and_17_preparation_columns():
    cb = Codebook.load()
    imp = [n for n in cb.names if n.startswith("pgm_skill_imp_")]
    prep = [n for n in cb.names if n.startswith("pgm_skill_prep_")]
    assert len(imp) == 17 and len(prep) == 17
    # Preparation is only shown when importance >= 3 for the SAME skill
    assert cb["pgm_skill_prep_ai"].display_if == "pgm_skill_imp_ai >= 3"


def test_multi_select_expands_with_other_text_column():
    cb = Codebook.load()
    assert cb.multi_columns("ce_type") == [f"ce_type_{i}" for i in range(1, 8)]
    assert "ce_type_7_TEXT" in cb           # "Other" has a text field
    assert "ce_type_6_TEXT" not in cb       # normal options do not


def test_option_level_display_logic_is_combined_with_question_logic():
    cb = Codebook.load()
    cond = cb["ai_barrier_1"].display_if    # "organisation does not allow it"
    assert "ai_use_freq != 5" in cond and "job_employed == 1" in cond


def test_exclusive_and_max_select_flags():
    cb = Codebook.load()
    assert cb["out_soc_chall_19"].exclusive is True   # "I don't know"
    assert cb["out_soc_chall_1"].exclusive is False
    assert cb["out_soc_chall_1"].max_select == 3


def test_value_label_lookup_handles_missing_values():
    cb = Codebook.load()
    assert cb.value_label("pgm_satisfaction", 5) == "Very satisfied"
    assert cb.value_label("pgm_satisfaction", None) == ""
    assert cb.value_label("pgm_satisfaction", "x") == ""
