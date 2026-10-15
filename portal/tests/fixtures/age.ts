/**
 * Kleine, handgeschriebene Roh-Dokumente im Pipeline-Format (snake_case,
 * punktgetrennte Metriken) für Tests zu Frage 1 (Alter).
 * Bewusst klein und vollständig nachrechenbar.
 */
const pyramid = (cells: Record<string, [number, number]>) =>
  Object.fromEntries(Object.entries(cells).map(([g, [female, male]]) => [g, { female, male }]));

/** Hochschule S001, veröffentlicht, mit zwei Benchmarks. Pyramide summiert auf 100. */
export const rawSchoolS001 = {
  school: { school_id: 'S001', school_name: 'Alpha', region: 'Europe' },
  n: 28,
  published: true,
  metrics: {
    'demographics.age.median': 31.5,
    'demographics.age.q1': 27.75,
    'demographics.age.q3': 36.25,
    'demographics.age.mean': 33.6,
    'demographics.gender.dist': { '1': 42.9, '2': 53.6, '3': 0.0, '99': 3.6 },
    'demographics.age_gender.pyramid': pyramid({
      '< 25': [0, 7.4], '25-34': [29.6, 33.3], '35-44': [7.4, 11.1],
      '45-54': [7.4, 0], '55-64': [0, 0], '65+': [0, 3.8],
    }),
  },
  benchmarks: {
    // absichtlich nicht in Anzeige-Reihenfolge geliefert
    'aacsb=1': {
      label: 'AACSB', n_schools: 30, n: 900,
      metrics: { 'demographics.age.median': 33 },
      peers: [{ 'demographics.age.median': 35 }],
    },
    all: {
      label: 'All participating schools', n_schools: 4, n: 120,
      metrics: {
        'demographics.age.median': 34, 'demographics.age.q1': 30, 'demographics.age.q3': 41,
        'demographics.age_gender.pyramid': pyramid({
          '< 25': [1.4, 1.9], '25-34': [21.2, 27.2], '35-44': [13.6, 18.3],
          '45-54': [5.2, 6.7], '55-64': [1.4, 2.3], '65+': [0.3, 0.5],
        }),
      },
      // unsortiert + ein Eintrag ohne Median + ein (unerlaubter) Name -> darf nicht durchkommen
      peers: [
        { 'demographics.age.median': 36, 'demographics.age.q1': 31, 'demographics.age.q3': 42, school_name: 'LEAK' },
        { 'demographics.age.median': 29, 'demographics.age.q1': 27, 'demographics.age.q3': 32 },
        { 'program.nps': 10 },
        { 'demographics.age.median': 31.5, 'demographics.age.q1': 28, 'demographics.age.q3': 35 },
      ],
    },
    'region=Europe': { label: 'Europe', n_schools: 20, n: 600, metrics: {}, peers: [] },
  },
};

/** Gleiche Hochschule, aber unter Mindestfallzahl. */
export const rawSchoolUnpublished = {
  ...rawSchoolS001,
  school: { school_id: 'S099' },
  n: 6,
  published: false,
};

/** Wellen: Einstieg erst 2024 (2022/2023 = null). */
export const rawWavesLateJoiner = {
  school_id: 'S010',
  simulated: true,
  metric: 'demographics.age',
  note: '2026 = synthetic dataset; 2022-2025 simulated',
  waves: [2022, 2023, 2024, 2025, 2026],
  own: {
    '2022': null,
    '2023': null,
    '2024': { median: 30, q1: 27, q3: 34, n: 15 },
    '2025': { median: 31, q1: 28, q3: 35, n: 18 },
    '2026': { median: 32.5, q1: 28, q3: 36, n: 21 },
  },
  benchmarks: {
    'region=Europe': {
      label: 'Europe',
      waves: { '2026': { band: { median: 34, p25: 32, p75: 36, n_schools: 3 }, peers: [{ median: 36, q1: 30, q3: 40 }, { median: 33, q1: 29, q3: 37 }] } },
    },
    all: {
      label: 'All',
      waves: {
        '2022': { band: { median: 33, p25: 31, p75: 35.5, n_schools: 2 }, peers: [{ median: 33, q1: 30, q3: 36 }, { median: 31, q1: 28, q3: 34 }] },
        '2026': { band: { median: 34, p25: 33, p75: 36, n_schools: 4 }, peers: [{ median: 35, q1: 30, q3: 40 }, { median: 32.5, q1: 29, q3: 36 }, { median: 30, q1: 26, q3: 33 }] },
      },
    },
  },
};

/**
 * Gepoolte Demo-Sicht "ALL" (alle Hochschulen): demo-Flag, n_schools,
 * percentile_ranks leer, Benchmarks ohne Region-Bezug; Peers = alle Hochschulen.
 */
export const rawSchoolAll = {
  ...rawSchoolS001,
  school: { school_id: 'ALL', school_name: 'All participating schools (demo)', region: 'All regions', country: null },
  demo: true,
  n: 120,
  n_schools: 4,
  percentile_ranks: {},
};

/** Wellen der Demo-Sicht: eigene (= gepoolte) Werte in allen Jahren, nur Benchmark "all". */
export const rawWavesAll = {
  school_id: 'ALL',
  simulated: true,
  demo: true,
  note: 'Demo view: all schools pooled',
  waves: [2025, 2026],
  own: {
    '2025': { median: 33.5, q1: 29.5, q3: 40.5, n: 100 },
    '2026': { median: 34, q1: 30, q3: 41, n: 120 },
  },
  benchmarks: {
    all: {
      label: 'All',
      waves: {
        '2025': { band: { median: 33, p25: 31, p75: 35, n_schools: 4 }, peers: [{ median: 30, q1: 27, q3: 34 }, { median: 33, q1: 29, q3: 37 }, { median: 34, q1: 30, q3: 40 }, { median: 36, q1: 31, q3: 42 }] },
        '2026': { band: { median: 34, p25: 32, p75: 36, n_schools: 4 }, peers: [{ median: 31, q1: 27, q3: 35 }, { median: 34, q1: 30, q3: 39 }, { median: 34, q1: 30, q3: 41 }, { median: 37, q1: 32, q3: 43 }] },
      },
    },
  },
};

/**
 * Erwerbsstatus (career.employment.flow) im Pipeline-Format – S040-ähnlich mit
 * ausgeblendeten Blättern (null) und Benchmarks "all" + "region=Asia".
 */
export const rawEmploymentS040 = {
  school: { school_id: 'S040', region: 'Asia' },
  n: 29,
  published: true,
  metrics: {
    'career.employment.flow': {
      employed: { total: 72.4, full_time: 58.6, part_time: null, self_employed: null, other_employment: null },
      not_employed: { total: 27.6, student: 0.0, retired: 0.0, seeking_work: 17.2, not_seeking_work: null, other_situation: null },
      n: 29,
    },
  },
  benchmarks: {
    all: {
      metrics: {
        'career.employment.flow': {
          employed: { total: 92.6, full_time: 74.9, part_time: 7.9, self_employed: 8.0, other_employment: 1.8 },
          not_employed: { total: 7.4, student: 0.0, retired: 0.6, seeking_work: 4.3, not_seeking_work: 1.5, other_situation: 1.0 },
          n: 1499,
        },
      },
    },
    'region=Asia': {
      metrics: {
        'career.employment.flow': {
          employed: { total: 91.3, full_time: 74.6, part_time: 4.9, self_employed: 9.2, other_employment: 2.6 },
          not_employed: { total: 8.7, student: 0.0, retired: 0.5, seeking_work: 6.6, not_seeking_work: 1.2, other_situation: 0.4 },
          n: 426,
        },
      },
    },
    'region=Europe': { metrics: {} },
  },
};

/** KI-Interpretation (Format wie insights/career_employment/texts/<id>.json). */
export const rawInsightS040 = {
  school_id: 'S040',
  chart_id: 'career_employment_status',
  language: 'en',
  headline: 'Fewer graduates in work than in the region, with more actively seeking a job.',
  how_to_read: 'Flows run from all respondents (left) to employed or not employed (middle) and on to the detailed situation (right). The hatched flows group categories hidden because fewer than 3 people chose them.',
  key_findings: ['72.4 % of respondents are employed, 58.6 % full-time.', '17.2 % are seeking work.'],
  benchmark: 'Employment is 18.9 pp below the regional figure of 91.3 % and 20.2 pp below all schools (92.6 %).',
  caveats: 'With n = 29, a single person shifts a share by several points; several categories are hidden.',
  generated_by: { provider: 'Anthropic', model: 'claude-sonnet-5-5', mode: 'prototype – generated with Claude Code from synthetic data' },
  generated_at: '2026-10-15T09:40:00Z',
};
