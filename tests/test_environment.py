"""Tests for pipeline/environment.py — the data-protection boundary.

All tests pass a hand-made environment dict, so nothing here touches real data.
"""

import pytest

from pipeline.codebook import PROJECT_ROOT
from pipeline.environment import (DATA_DIR_VAR, MODE_VAR, DataPolicyError, resolve_context,
                                  running_inside_claude_code)


def test_default_is_synthetic_inside_project():
    ctx = resolve_context({})
    assert ctx.mode == "synthetic" and not ctx.is_production
    assert ctx.raw_dir == PROJECT_ROOT / "data" / "synthetic"


def test_production_is_refused_inside_claude_code(tmp_path):
    env = {MODE_VAR: "production", DATA_DIR_VAR: str(tmp_path), "CLAUDECODE": "1"}
    with pytest.raises(DataPolicyError, match="inside Claude Code"):
        resolve_context(env)


def test_production_outside_claude_code_uses_secure_folder(tmp_path):
    ctx = resolve_context({MODE_VAR: "production", DATA_DIR_VAR: str(tmp_path)})
    assert ctx.is_production
    assert ctx.raw_dir == tmp_path.resolve() / "raw"
    assert ctx.portal_export_dir == tmp_path.resolve() / "firestore_export"


def test_secure_folder_inside_project_is_rejected():
    env = {MODE_VAR: "production", DATA_DIR_VAR: str(PROJECT_ROOT / "data")}
    with pytest.raises(DataPolicyError, match="OUTSIDE"):
        resolve_context(env)


def test_missing_secure_folder_and_unknown_mode(tmp_path):
    with pytest.raises(DataPolicyError, match="not found"):
        resolve_context({MODE_VAR: "production", DATA_DIR_VAR: str(tmp_path / "nope")})
    with pytest.raises(DataPolicyError, match="Unknown"):
        resolve_context({MODE_VAR: "prod"})


def test_claude_code_detection():
    assert running_inside_claude_code({"CLAUDECODE": "1"})
    assert not running_inside_claude_code({})
