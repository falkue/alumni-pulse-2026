# Portal spec — Question 1 (year of birth → age): two charts for the school view

Approved by the project owner on 15 Oct 2026 (chat mock-ups). Integrate both into the
**school (customer) view**, section "Overview / Who answered" (or a new section
"Demographics"). Reference implementation for chart B (D3, hard-coded old numbers, subset of schools, NOT
production code): `q1_age_benchmark_longitudinal_reference.html`. Chart A is specified below
(the chat mock-up showed regions; in the school view it compares own school vs. benchmark).
Use the portal's own design tokens; keep the visual logic.

## Data sources (aggregates only — never respondent-level data)

| Need | File | Keys |
|---|---|---|
| Own school, 2026 | `data/processed/aggregates/schools/<school_id>.json` | `metrics["demographics.age.median" / ".q1" / ".q3" / ".mean"]`, `metrics["demographics.age_gender.pyramid"]` = `{age_group: {female, male}}` in % (12 cells sum to 100), `metrics["demographics.age_group.dist"]`, `metrics["demographics.gender.dist"]` (keys "1" female, "2" male, "3" non-binary, "99" prefer not to say), `n`, `published` |
| Benchmark, 2026 | same file, `benchmarks[<key>]` | keys `"all"`, `"region=<Region>"`, `"ranking_tier=<n>"`, `"institution_type=<type>"`, `"aacsb=<0/1>"`; each has `label`, `n_schools`, `n`, `metrics` (same keys as above, pooled) and `peers` = list of ANONYMOUS other schools `{ "demographics.age.median", ".q1", ".q3", + headline KPIs }`, sorted, no names/ids |
| Waves 2022–2026 (MOCK) | `data/processed/aggregates/waves_mock/<school_id>.json` | `simulated: true`, `waves`, `own[year]` = `{median,q1,q3,n}` or `null` (school not yet in study), `benchmarks["all" / "region=<R>"].waves[year]` = `{band: {median,p25,p75,n_schools}, peers: [{median,q1,q3}]}` |

Load the waves file through the data adapter like the other aggregates (later Firestore:
`aggregates/{schoolId}/waves/{year}`). Show a clear badge "Simulated history (mock-up)"
whenever `simulated` is true.

## Chart A — age pyramid (own school vs. benchmark)

* Horizontal back-to-back bars: female left, male right; age groups top→bottom
  `65+, 55-64, 45-54, 35-44, 25-34, < 25`; x-axis in % (shared scale both sides).
* Own school = solid bars; selected benchmark = thin outline/ghost bars or a tick mark
  per cell at the same position, so differences are visible at a glance.
* Benchmark selector (segmented control): All schools / own region / tier / type / AACSB
  — only groups present in `benchmarks`.
* Header line: `n = …, median age …` for school and benchmark.
* Value labels at bar ends (1 decimal); hover shows "female 25-34: 29.6 % (benchmark 21.0 %)".
* Footnote: non-binary / prefer-not-to-say excluded from the pyramid base (show their share).
* If `published` is false or the pyramid is null: show "fewer than 10 responses — not shown".

## Chart B — median age vs. peers, with wave slider (approved favourite)

* Dot plot, one row per school sorted by median age: dot = median, horizontal bar = middle
  50 % (q1–q3). Own school in accent blue (bigger dot, thicker bar, label "Your school");
  **other schools grey and anonymous** (no names, no tooltips with names — only values).
* Dashed vertical line = benchmark median (from `band.median` per wave; for 2026 you may use
  the pooled `metrics["demographics.age.median"]` of the benchmark).
* Controls: benchmark toggle (All schools / own region), wave slider 2022–2026 with
  play/pause (≈1.1 s per wave), checkbox "Show trajectory" (light-blue dots/line of the own
  school's earlier waves on its row).
* KPI cards above: median age (Δ vs. previous wave), benchmark median (Δ), middle 50 % + n,
  percentile rank among schools in the wave (ties count half) + number of schools.
* If the school has no value in a wave: card "Not yet in the study (joined <year>)",
  still show the peers.
* Below: small trend chart 2022–2026 — own median line (accent) vs. benchmark median
  (dashed grey) and grey band p25–p75; highlight the selected wave.
* Mobile: rows 13 px high; hide tick labels except the own school; controls wrap.

## Rules

* Tenant separation: a school only ever loads its own files; peers stay anonymous.
* No new metrics computed in the browser beyond rank/delta from the delivered values.
* Unit tests for the data mapping (pyramid cells sum to 100, rank calculation, missing
  wave handling, suppression when `published` is false).
