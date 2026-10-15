import { readdirSync, readFileSync } from 'node:fs';
import {
  AGE_GROUPS_TOP_DOWN,
  benchmarkLabel,
  delta,
  joinedYear,
  mapAgeOverview,
  mapAgeWaves,
  mapPyramid,
  percentileRank,
  previousYear,
  pyramidTotal,
  suppressedCellCount,
} from '../../src/domain/age';
import { rawSchoolS001, rawSchoolUnpublished, rawWavesLateJoiner } from '../fixtures/age';

describe('mapAgeOverview', () => {
  const o = mapAgeOverview(rawSchoolS001);

  it('liest Kopfwerte und Lage-Kennzahlen', () => {
    expect(o).toMatchObject({ schoolId: 'S001', published: true, n: 28 });
    expect(o.stats).toEqual({ median: 31.5, q1: 27.75, q3: 36.25, mean: 33.6 });
  });

  it('Pyramide: feste Reihenfolge 65+ … < 25, 12 Zellen ergeben 100', () => {
    expect(o.pyramid!.map((r) => r.group)).toEqual([...AGE_GROUPS_TOP_DOWN]);
    expect(pyramidTotal(o.pyramid!)).toBeCloseTo(100, 1);
    expect(o.pyramid!.find((r) => r.group === '25-34')).toEqual({ group: '25-34', female: 29.6, male: 33.3 });
  });

  it('Anteil non-binary + keine Angabe wird separat ausgewiesen', () => {
    expect(o.excludedGenderShare).toBe(3.6);
  });

  it('Benchmarks in Anzeige-Reihenfolge mit deutschen Labels', () => {
    expect(o.benchmarks.map((b) => b.key)).toEqual(['all', 'region=Europe', 'aacsb=1']);
    expect(o.benchmarks[0]).toMatchObject({ label: 'All schools', nSchools: 4, n: 120 });
    expect(o.benchmarks[0].stats.median).toBe(34);
  });

  it('Peers: sortiert, ohne Einträge ohne Median und OHNE Namen/IDs', () => {
    const peers = o.benchmarks[0].peers;
    expect(peers.map((p) => p.median)).toEqual([29, 31.5, 36]);
    for (const p of peers) expect(Object.keys(p).sort()).toEqual(['median', 'q1', 'q3']);
    expect(JSON.stringify(o)).not.toContain('LEAK');
  });

  it('Benchmark ohne Pyramide/Peers -> pyramid null (bzw. Nullen) und leere Peers', () => {
    const eu = o.benchmarks.find((b) => b.key === 'region=Europe')!;
    expect(eu.pyramid).toBeNull();
    expect(eu.peers).toEqual([]);
  });

  it('published=false: keine eigenen Werte (Mindestfallzahl)', () => {
    const u = mapAgeOverview(rawSchoolUnpublished);
    expect(u.published).toBe(false);
    expect(u.pyramid).toBeNull();
    expect(u.stats).toEqual({ median: null, q1: null, q3: null, mean: null });
    expect(u.excludedGenderShare).toBeNull();
    expect(u.benchmarks).toHaveLength(3); // Benchmarks bleiben sichtbar
  });

  it('robust gegen leere/kaputte Eingaben', () => {
    expect(mapAgeOverview(null)).toMatchObject({ schoolId: '', published: false, benchmarks: [] });
    expect(mapPyramid(undefined)).toBeNull();
    expect(mapPyramid({ '25-34': { female: 'x' } })!.every((r) => r.female === 0)).toBe(true);
  });
});

describe('mapAgeWaves', () => {
  const w = mapAgeWaves(rawWavesLateJoiner);

  it('Jahre, simulated-Flag und Notiz', () => {
    expect(w.years).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(w.simulated).toBe(true);
    expect(w.note).toContain('simulated');
  });

  it('fehlende Wellen (spätere Teilnahme) sind null; Einstiegsjahr', () => {
    expect(w.own[2022]).toBeNull();
    expect(w.own[2023]).toBeNull();
    expect(w.own[2024]).toEqual({ median: 30, q1: 27, q3: 34, n: 15 });
    expect(joinedYear(w)).toBe(2024);
  });

  it('Benchmarks: nur gelieferte Jahre, Band + sortierte Peers', () => {
    const all = w.benchmarks.find((b) => b.key === 'all')!;
    expect(Object.keys(all.waves).map(Number)).toEqual([2022, 2026]);
    expect(all.waves[2026].band).toEqual({ median: 34, p25: 33, p75: 36, nSchools: 4 });
    expect(all.waves[2026].peers.map((p) => p.median)).toEqual([30, 32.5, 35]);
    expect(w.benchmarks.map((b) => b.key)).toEqual(['all', 'region=Europe']);
  });

  it('Vorjahr', () => {
    expect(previousYear(w, 2026)).toBe(2025);
    expect(previousYear(w, 2022)).toBeNull();
  });

  it('Hochschule ohne jede Welle -> joinedYear null', () => {
    expect(joinedYear(mapAgeWaves({ waves: [2025, 2026], own: {} }))).toBeNull();
  });
});

describe('percentileRank', () => {
  it('Anteil kleiner + Gleichstände halb (inkl. eigener Hochschule)', () => {
    // eigene 32.5; Peers 30, 32.5, 35 -> unter: 1, gleich: 2 -> (1 + 1) / 4 = 50 %
    expect(percentileRank(32.5, [{ median: 30, q1: null, q3: null }, { median: 32.5, q1: null, q3: null }, { median: 35, q1: null, q3: null }])).toEqual({ rank: 50, nSchools: 4 });
  });
  it('jüngste Hochschule allein / ohne Peers', () => {
    expect(percentileRank(25, [{ median: 30, q1: null, q3: null }])).toEqual({ rank: 25, nSchools: 2 });
    expect(percentileRank(40, [])).toEqual({ rank: 50, nSchools: 1 });
  });
});

describe('delta und Labels', () => {
  it('delta rundet auf 1 Dezimale, fehlende Werte -> null', () => {
    expect(delta(32.5, 31)).toBe(1.5);
    expect(delta(31, 31.3)).toBe(-0.3);
    expect(delta(null, 31)).toBeNull();
    expect(delta(31, undefined)).toBeNull();
  });
  it('benchmarkLabel', () => {
    expect(benchmarkLabel('all')).toBe('All schools');
    expect(benchmarkLabel('region=Asia')).toBe('Region Asia');
    expect(benchmarkLabel('ranking_tier=2')).toBe('Ranking tier 2');
    expect(benchmarkLabel('institution_type=public_university')).toBe('Public universities');
    expect(benchmarkLabel('aacsb=0')).toBe('Not AACSB accredited');
  });
});

/**
 * Plausibilitätsprüfung gegen die echten SYNTHETISCHEN Pipeline-Dateien
 * (../data/processed/aggregates). Läuft nur, wenn die Dateien vorhanden sind.
 */
// Pfade relativ zum Arbeitsverzeichnis portal/ (wie in tests/scripts/csv.test.ts)
const AGG = '../data/processed/aggregates/';
const files = (() => {
  try {
    return readdirSync(`${AGG}schools/`).filter((f) => /^S\d{3}\.json$/.test(f));
  } catch {
    return [];
  }
})();

describe.skipIf(files.length === 0)('synthetische Pipeline-Aggregate', () => {
  it.each(files)('%s: Pyramide ~100, Peers anonym, Wellen konsistent', (f) => {
    const o = mapAgeOverview(JSON.parse(readFileSync(`${AGG}schools/${f}`, 'utf8')));
    if (o.published && o.pyramid) {
      // Ohne ausgeblendete Zellen ~100; mit ausgeblendeten Zellen weniger (nie mehr)
      const total = pyramidTotal(o.pyramid);
      if (suppressedCellCount(o.pyramid) === 0) expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.5);
      else expect(total).toBeLessThanOrEqual(100.5);
      // null bleibt null (nie 0): jede Zelle ist Zahl oder null
      for (const r of o.pyramid) for (const v of [r.female, r.male]) expect(v === null || typeof v === 'number').toBe(true);
    }
    for (const b of o.benchmarks) for (const p of b.peers) expect(Object.keys(p).sort()).toEqual(['median', 'q1', 'q3']);

    const w = mapAgeWaves(JSON.parse(readFileSync(`${AGG}waves_mock/${f}`, 'utf8')));
    expect(w.schoolId).toBe(o.schoolId);
    expect(w.years.at(-1)).toBe(2026);
    // 2026 der Wellen-Datei = Stand der Schul-Datei
    if (o.published) expect(w.own[2026]?.median).toBe(o.stats.median);
  });
});

describe('Demo-Sicht "ALL"', () => {
  it('Überblick: Demo-Flag, Zahl der Hochschulen, Benchmarks bleiben wählbar', async () => {
    const { rawSchoolAll } = await import('../fixtures/age');
    const o = mapAgeOverview(rawSchoolAll);
    expect(o).toMatchObject({ schoolId: 'ALL', isDemo: true, nSchools: 4, published: true });
    expect(o.benchmarks.length).toBeGreaterThan(1);
  });
  it('Wellen: Demo-Flag; normale Hochschulen haben isDemo=false', async () => {
    const { rawWavesAll } = await import('../fixtures/age');
    expect(mapAgeWaves(rawWavesAll).isDemo).toBe(true);
    expect(mapAgeWaves(rawWavesLateJoiner).isDemo).toBe(false);
    expect(mapAgeOverview(rawSchoolS001)).toMatchObject({ isDemo: false, nSchools: null });
  });
});

describe.skipIf(files.length === 0)('synthetische Demo-Datei ALL.json', () => {
  it('ist als Demo markiert, hat 50 Hochschulen, keine Region-Benchmarks in den Wellen', () => {
    const o = mapAgeOverview(JSON.parse(readFileSync(`${AGG}schools/ALL.json`, 'utf8')));
    expect(o).toMatchObject({ schoolId: 'ALL', isDemo: true, nSchools: 50, published: true });
    expect(pyramidTotal(o.pyramid!)).toBeLessThanOrEqual(100.5);
    const w = mapAgeWaves(JSON.parse(readFileSync(`${AGG}waves_mock/ALL.json`, 'utf8')));
    expect(w.isDemo).toBe(true);
    expect(w.benchmarks.map((b) => b.key)).toEqual(['all']);
    expect(w.years.every((y) => w.own[y] !== null)).toBe(true);
  });
});

describe('Kleinzellenschutz (null = ausgeblendet)', () => {
  const pyr = {
    '< 25': { female: null, male: 0.0 },
    '25-34': { female: 31.0, male: 27.6 },
    '35-44': { female: null, male: null },
    '45-54': { female: null, male: null },
    '55-64': { female: null, male: 0.0 },
    '65+': { female: 0.0, male: 0.0 },
  };
  const doc = (gender: Record<string, number | null>) => ({
    ...rawSchoolS001,
    metrics: { ...rawSchoolS001.metrics, 'demographics.age_gender.pyramid': pyr, 'demographics.gender.dist': gender },
  });

  it('null bleibt null, 0.0 bleibt 0 – nie verwechselt', () => {
    const rows = mapAgeOverview(doc({ '1': 55.2, '2': 44.8, '3': 0, '99': 0 })).pyramid!;
    const row = (g: string) => rows.find((r) => r.group === g)!;
    expect(row('< 25')).toEqual({ group: '< 25', female: null, male: 0 });
    expect(row('35-44')).toEqual({ group: '35-44', female: null, male: null });
    expect(row('65+')).toEqual({ group: '65+', female: 0, male: 0 });
    expect(suppressedCellCount(rows)).toBe(6);
    // Summe nur über sichtbare Zellen
    expect(pyramidTotal(rows)).toBeCloseTo(58.6, 5);
  });

  it('Gender-Fussnote: null nie als 0 addieren', () => {
    expect(mapAgeOverview(doc({ '3': 0, '99': 3.6 }))).toMatchObject({ excludedGenderShare: 3.6, excludedGenderSuppressed: false });
    expect(mapAgeOverview(doc({ '3': null, '99': 3.6 }))).toMatchObject({ excludedGenderShare: 3.6, excludedGenderSuppressed: true });
    expect(mapAgeOverview(doc({ '3': null, '99': null }))).toMatchObject({ excludedGenderShare: null, excludedGenderSuppressed: true });
  });

  it('suppressedCellCount mit null-Pyramide', () => {
    expect(suppressedCellCount(null)).toBe(0);
  });
});
