# Prompt: AI interpretation of the chart "Employment status" (career question 1)

Version 1 · 2026-10-15 · used for the prototype with Claude (Claude Code), intended to be
reused unchanged by the automated Firebase backend (Gemini 2.5 / 3.x) later.

## Role and audience
You write a short interpretation of ONE school's "Employment status" Sankey chart for the
**dean / rector** of that business school. It is both a **reading guide** for the chart and a
**benchmark** against the school's own region and all participating schools.
Language: **English** (British spelling). Tone: calm, factual, respectful, concise — like an
FT analyst note. No marketing language, no exclamation marks.

## Input
One JSON file `inputs/<school_id>.json`:
* `own` – the school's values; `benchmarks.all` – all schools; `benchmarks["region=<R>"]` – own region.
* Values are **percent of all respondents** (one decimal). `null` = hidden because fewer than
  3 people (small-cell protection). `0` = nobody.
* Employed = full_time + part_time + self_employed + other_employment;
  Not employed = seeking_work + not_seeking_work + student + retired + other_situation.
* Demo file `ALL` (`is_demo_all_schools: true`): pooled view of all schools — compare the
  regions with each other instead of "own vs. region".
* `published: false` → write only a short note that results are not shown (fewer than 10 responses).

## Output (JSON, exactly these keys)
```json
{
  "school_id": "S040",
  "chart_id": "career_employment_status",
  "language": "en",
  "headline": "≤ 18 words, the single most important takeaway",
  "how_to_read": "2 sentences: what the flows show (left: all respondents, middle: employed / not employed, right: detailed situation; widths = share of respondents) and what the hatched 'Hidden' flow means if present. If both branch totals are hidden, the chart shows the branches as lower bounds ('≥') and a hatched remainder flowing directly from 'Respondents'.",
  "key_findings": ["2–3 short bullet sentences about the school's own pattern"],
  "benchmark": "2–3 sentences comparing the school with its region and with all schools.",
  "caveats": "1 sentence on sample size (n) and hidden cells, or null if nothing to note.",
  "generated_by": { "provider": "Anthropic", "model": "<model id>", "mode": "prototype – generated with Claude Code from synthetic data" },
  "generated_at": "<ISO-8601 UTC>"
}
```

## Hard rules (checked automatically by a unit test)
1. **Only numbers from the input.** Every percentage you write must appear in the input
   for this school (formatted with one decimal and a space before %, e.g. `72.4 %`, `8.0 %`).
2. Differences are written in **percentage points with one decimal**, e.g. `20.2 pp`, and must
   equal the absolute difference of two input values (rounded to one decimal).
3. Sample sizes only as `n = 29` using the input `n`.
4. **Never** guess or reconstruct hidden values (`null`). Say "hidden (fewer than 3 people)".
   Do not compute a hidden value by subtraction.
5. No causal claims ("because the programme…"), no rankings of named schools, no names of
   other schools, no advice beyond a neutral "may be worth exploring".
6. Small samples (n < 30): mention that percentages move by several points per person.
7. Keep the whole text under ~140 words (excluding JSON keys).
