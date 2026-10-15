# Data governance — real survey data

**Rule:** Real survey data exported from Qualtrics is **never** read, searched,
edited or processed by Claude Code (or any other AI coding assistant). Real data
is processed only

1. by the local Python scripts of this project, **started by a human in their own
   terminal**, or
2. in Firebase (portal), which receives **aggregated** figures only.

Claude Code works exclusively with the **synthetic** data in `data/synthetic/`
to build and test code, reports and the portal.

## Four protective layers

| Layer | What it does | Where |
|---|---|---|
| 1. Storage location | Real data lives **outside** the project folder, default `~/AlumniPulse_SecureData/` (`raw/`, `interim/`, `processed/`, `reports/`, `firestore_export/`, `qa/`). The project's `data/raw/` stays empty. | file system |
| 2. Claude Code deny rules | `Read(...)` and `Edit(...)` on the secure folder are denied. | `~/.claude/settings.json` (all sessions) and `.claude/settings.json` (project) |
| 3. Claude Code guard hook | Every tool call (Bash, Read, Grep, MCP file tools …) whose path or command mentions the secure folder or the production switch is blocked before it runs. | `.claude/hooks/alumni_pulse_guard.sh`, copy in `~/.claude/hooks/` |
| 4. Code-level check | Production mode refuses to start inside a Claude Code shell (`CLAUDECODE=1`), refuses a secure folder inside the project and writes all outputs to the secure folder. Console output: counts only. | `pipeline/environment.py` (unit-tested in `tests/test_environment.py`) |

## Runbook for a real export (done by a human)

```bash
# once: create the secure folder (ideally on an encrypted volume, not in iCloud)
mkdir -p ~/AlumniPulse_SecureData/raw

# 1. Export from Qualtrics: CSV, "numeric values", country/text fields as text
#    -> save into ~/AlumniPulse_SecureData/raw/

# 2. In your OWN terminal (not inside Claude Code):
cd ~/Downloads/alumni_pulse_2026
export ALUMNI_PULSE_MODE=production
.venv/bin/python scripts/run_pipeline.py

# 3. Check ~/AlumniPulse_SecureData/qa/pipeline_summary.json
# 4. Upload ~/AlumniPulse_SecureData/firestore_export/ to Firebase (upload script, later)
```

## Development rules

* New code is developed and tested only against the synthetic data; the
  synthetic export has exactly the format of the real export.
* Never copy real data (or extracts, screenshots, error messages with row
  content) into the project folder, a chat or an issue.
* Bugs found with real data are reproduced with synthetic data before asking
  Claude Code for help.
* If the real data must be stored somewhere else, set `ALUMNI_PULSE_DATA_DIR`
  and add the folder name to `MARKERS` in the guard hook and to the deny rules.
* Firebase receives only school-level aggregates that respect the minimum
  numbers in `config/settings.yaml` (no respondent-level data, no free texts
  without review).

## Limits

The hook recognises the protected folder by its **name**. A command that reaches
the data without naming it (e.g. via a renamed symlink) would not be caught —
hence layers 1 and 4 and the rule that real data never enters the project
folder. The settings are local to this Mac; on another computer they must be
installed again.
