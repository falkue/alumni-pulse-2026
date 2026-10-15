"""
Run modes and data locations — the data-protection boundary in code
===================================================================

The project knows two run modes:

``synthetic`` (default)
    Works on the synthetic test data inside the project folder
    (``data/synthetic`` -> ``data/interim`` / ``data/processed``).
    This is the ONLY mode in which Claude Code may run the scripts.

``production``
    Works on the REAL Qualtrics export. Switched on by a human in their own
    terminal:

        export ALUMNI_PULSE_MODE=production
        export ALUMNI_PULSE_DATA_DIR=~/AlumniPulse_SecureData   # optional, this is the default
        .venv/bin/python scripts/run_pipeline.py

    In production mode
      * every input and output lives in the secure data directory OUTSIDE the
        project folder (raw/, interim/, processed/, reports/, firestore_export/),
      * the scripts refuse to start inside a Claude Code session
        (Claude Code sets the environment variable CLAUDECODE=1 in every shell
        it opens),
      * console output is limited to counts (no row-level data).

Together with the Claude Code hook (.claude/hooks/alumni_pulse_guard.sh) and
the deny rules in .claude/settings.json this ensures that real survey data is
processed only by the local scripts or in Firebase, never by Claude Code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from pipeline.codebook import PROJECT_ROOT

MODE_VAR = "ALUMNI_PULSE_MODE"
DATA_DIR_VAR = "ALUMNI_PULSE_DATA_DIR"
DEFAULT_SECURE_DIR = Path.home() / "AlumniPulse_SecureData"


class DataPolicyError(RuntimeError):
    """Raised when a run would break the data-protection rules."""


@dataclass(frozen=True)
class RunContext:
    """Where to read from and write to for the current run."""

    mode: str               # "synthetic" or "production"
    raw_dir: Path           # Qualtrics exports
    interim_dir: Path       # classified cases (row level)
    processed_dir: Path     # respondents + aggregates
    reports_dir: Path       # PDF reports
    portal_export_dir: Path  # JSON for Firestore upload
    qa_dir: Path            # QA summaries

    @property
    def is_production(self) -> bool:
        return self.mode == "production"


def running_inside_claude_code(env: dict | None = None) -> bool:
    """True if the current process was started from a Claude Code shell."""
    env = os.environ if env is None else env
    return env.get("CLAUDECODE") == "1" or "CLAUDE_CODE_ENTRYPOINT" in env


def resolve_context(env: dict | None = None) -> RunContext:
    """Work out the run mode and all folders from environment variables.

    Step by step:
      1. read ALUMNI_PULSE_MODE (default "synthetic"); anything else is an error,
      2. synthetic -> project folders,
      3. production -> refuse inside Claude Code, then use the secure folder,
         which must exist and must NOT lie inside the project folder.
    """
    env = os.environ if env is None else env
    mode = env.get(MODE_VAR, "synthetic").strip().lower()

    if mode == "synthetic":
        data = PROJECT_ROOT / "data"
        return RunContext("synthetic", data / "synthetic", data / "interim", data / "processed",
                          PROJECT_ROOT / "reports" / "output", PROJECT_ROOT / "portal" / "firestore_export",
                          PROJECT_ROOT / "qa")

    if mode != "production":
        raise DataPolicyError(f"Unknown {MODE_VAR}={mode!r}; use 'synthetic' or 'production'.")

    if running_inside_claude_code(env):
        raise DataPolicyError(
            "Production mode refused: this process runs inside Claude Code. Real survey data "
            "may only be processed by a human in their own terminal (see docs/data_governance.md).")

    secure = Path(env.get(DATA_DIR_VAR, str(DEFAULT_SECURE_DIR))).expanduser().resolve()
    if PROJECT_ROOT.resolve() in (secure, *secure.parents):
        raise DataPolicyError(f"The secure data folder must lie OUTSIDE the project folder: {secure}")
    if not secure.is_dir():
        raise DataPolicyError(f"Secure data folder not found: {secure}. Create it first (see docs).")
    return RunContext("production", secure / "raw", secure / "interim", secure / "processed",
                      secure / "reports", secure / "firestore_export", secure / "qa")
