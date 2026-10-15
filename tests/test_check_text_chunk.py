"""Tests for scripts/synthetic/check_text_chunk.py (checker for the text agents)."""

import json

from scripts.synthetic.check_text_chunk import MAX_SAME_OPENING, check, opening


def _setup(tmp_path, requests, answers):
    """Write one chunk with its requests and one answer file into a fake .work folder."""
    (tmp_path / "text_chunks").mkdir()
    (tmp_path / "text_responses").mkdir()
    (tmp_path / "text_chunks" / "c.jsonl").write_text(
        "\n".join(json.dumps(r) for r in requests), encoding="utf-8")
    (tmp_path / "text_responses" / "c_part01.jsonl").write_text(
        "\n".join(json.dumps(a) for a in answers) + "\n", encoding="utf-8")


def test_opening_normalises_case_and_punctuation():
    assert opening("Honestly, the CAREER service was great.") == "honestly the career service"
    assert opening("Ok") == "ok"


def test_complete_chunk_passes_and_short_answers_may_repeat(tmp_path):
    reqs = [{"ResponseId": f"R_{i}", "fields": ["f"]} for i in range(25)]
    answers = [{"ResponseId": f"R_{i}", "field": "f", "text": "n/a"} for i in range(10)]
    answers += [{"ResponseId": f"R_{i}", "field": "f", "text": f"Answer number {i} is different here"}
                for i in range(10, 25)]
    _setup(tmp_path, reqs, answers)
    assert check("c", tmp_path) == []


def test_missing_extra_duplicate_and_invalid_are_reported(tmp_path):
    reqs = [{"ResponseId": "R_1", "fields": ["f", "g"]}]
    answers = [{"ResponseId": "R_1", "field": "f", "text": "ok"},
               {"ResponseId": "R_1", "field": "f", "text": "again"},
               {"ResponseId": "R_2", "field": "f", "text": "who"},
               {"ResponseId": "R_1", "field": "g", "text": "  "}]
    _setup(tmp_path, reqs, answers)
    problems = " | ".join(check("c", tmp_path))
    assert "MISSING 1" in problems and "EXTRA 1" in problems and "DUPLICATE 1" in problems
    assert "invalid line" in problems


def test_repeated_openings_are_reported(tmp_path):
    n = MAX_SAME_OPENING + 1
    reqs = [{"ResponseId": f"R_{i}", "fields": ["f"]} for i in range(n)]
    answers = [{"ResponseId": f"R_{i}", "field": "f", "text": f"Schools should teach how to use tool {i}"}
               for i in range(n)]
    _setup(tmp_path, reqs, answers)
    assert any("schools should teach how" in p for p in check("c", tmp_path))
