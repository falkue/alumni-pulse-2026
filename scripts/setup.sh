#!/bin/bash
# =============================================================================
# One-time setup on a new computer — Global Alumni Pulse 2026
# =============================================================================
# Run from the project root:   bash scripts/setup.sh
#
# Step by step:
#   1. Python virtual environment in ~/.venvs/alumni_pulse_2026 (OUTSIDE the
#      project, because iCloud-/OneDrive-synced folders block thousands of small
#      files) and a symlink .venv -> that folder.
#   2. Python packages from requirements.txt.
#   3. Portal packages (npm install in portal/).
#   4. Copy of the data-protection guard hook to ~/.claude/hooks/ as a fallback.
#   5. Run all tests once.
# Nothing here touches real survey data.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VENV="$HOME/.venvs/alumni_pulse_2026"

echo "1/5  Python environment in $VENV"
if command -v uv >/dev/null 2>&1; then
  [ -d "$VENV" ] || uv venv -q --python 3.12 "$VENV"
  uv pip install -q --python "$VENV/bin/python" -r requirements.txt
else
  PY=$(command -v python3.12 || command -v python3)
  [ -d "$VENV" ] || "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -q -r requirements.txt
fi
[ -e .venv ] || ln -s "$VENV" .venv

echo "2/5  Python packages installed: $(.venv/bin/python -c 'import pandas; print("pandas", pandas.__version__)')"

echo "3/5  Portal packages (npm install)"
command -v npm >/dev/null 2>&1 || { echo "   Node.js >= 20 is missing: https://nodejs.org"; exit 1; }
npm --prefix portal install --silent

echo "4/5  Guard hook fallback copy in ~/.claude/hooks/"
mkdir -p "$HOME/.claude/hooks"
cp .claude/hooks/alumni_pulse_guard.sh "$HOME/.claude/hooks/alumni_pulse_guard.sh"
chmod +x "$HOME/.claude/hooks/alumni_pulse_guard.sh" .claude/hooks/alumni_pulse_guard.sh

echo "5/5  Tests"
.venv/bin/pytest -q | tail -1
npm --prefix portal test --silent 2>&1 | tail -3

echo
echo "Done. Start the portal with:  npm --prefix portal run dev   ->  http://localhost:5174"
