#!/bin/bash
# =============================================================================
# Alumni Pulse 2026 — data-protection guard for Claude Code (PreToolUse hook)
# =============================================================================
# Policy: REAL survey data exported from Qualtrics must never be read,
# searched, edited or processed by Claude Code. It is processed only by the
# local scripts, started by a human in their own terminal, or in Firebase.
#
# How it works, step by step:
#   1. Claude Code passes the planned tool call as JSON on stdin.
#   2. We collect every value whose key looks like a path or a command
#      (file_path, path, pattern, glob, command, cwd, source, url ...),
#      for ALL tools, including MCP tools such as file servers.
#      Free text (file contents, prompts, descriptions) is ignored on purpose,
#      so documentation may still mention the policy.
#   3. If any of them points at the secure real-data directory or tries to
#      switch the pipeline into production mode, the call is denied.
#
# Protected markers (case-insensitive):
#   AlumniPulse_SecureData   default real-data directory (~/AlumniPulse_SecureData)
#   ALUMNI_PULSE_MODE        environment switch for production runs
#   ALUMNI_PULSE_DATA_DIR    environment variable pointing to the real data
# If the real data are stored elsewhere, add that folder name to MARKERS.
# =============================================================================
MARKERS='alumnipulse_securedata|alumni_pulse_mode|alumni_pulse_data_dir'

input=$(cat)
targets=$(jq -r '
  .tool_input // {} |
  [paths(scalars) as $p
   | select(($p | map(tostring) | join(".")) | test("path|file|dir|pattern|glob|command|cwd|source|dest|url|target|query"; "i"))
   | getpath($p) | tostring] | join("\n")' <<<"$input" 2>/dev/null)

if printf '%s' "$targets" | tr '[:upper:]' '[:lower:]' | grep -qE "$MARKERS"; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: "Alumni Pulse data policy: real survey data (AlumniPulse_SecureData, production mode) may only be processed by the local scripts run by a human or in Firebase — never by Claude Code. See docs/data_governance.md."}}'
fi
exit 0
