import { readdirSync, readFileSync } from 'node:fs';
import { employedShare, flowOptions, mapEmploymentFlow, mapEmploymentOverview } from '../../src/domain/employment';
import { rawEmploymentS040 } from '../fixtures/age';

describe('mapEmploymentFlow', () => {
  const flow = mapEmploymentFlow(rawEmploymentS040.metrics['career.employment.flow'])!;

  it('liest Äste, Blätter (Reihenfolge) und n', () => {
    expect(flow.n).toBe(29);
    const [emp, not] = flow.branches;
    expect(emp).toMatchObject({ key: 'employed', label: 'Employed', total: 72.4 });
    expect(emp.leaves.map((l) => l.label)).toEqual(['Full-time', 'Part-time', 'Self-employed', 'Other employment']);
    expect(not.leaves.map((l) => l.key)).toEqual(['seeking_work', 'not_seeking_work', 'student', 'retired', 'other_situation']);
    expect(employedShare(flow)).toBe(72.4);
  });

  it('null bleibt null (ausgeblendet), 0 bleibt 0', () => {
    const [emp, not] = flow.branches;
    expect(emp.leaves.find((l) => l.key === 'part_time')!.value).toBeNull();
    expect(not.leaves.find((l) => l.key === 'student')!.value).toBe(0);
  });

  it('ein ausgeblendetes Ast-Total ergibt sich aus 100 % minus dem anderen', () => {
    const f = mapEmploymentFlow({ employed: { total: null }, not_employed: { total: 12.5 } })!;
    expect(f.branches[0].total).toBe(87.5);
    expect(mapEmploymentFlow({ employed: { total: null }, not_employed: { total: null } })!.branches[0].total).toBeNull();
  });

  it('fehlende Kennzahl -> null', () => {
    expect(mapEmploymentFlow(undefined)).toBeNull();
  });
});

describe('mapEmploymentOverview + flowOptions', () => {
  it('Hochschule: Your school / eigene Region / All schools', () => {
    const o = mapEmploymentOverview(rawEmploymentS040);
    expect(o).toMatchObject({ schoolId: 'S040', region: 'Asia', isDemo: false, published: true });
    // region=Europe ohne Kennzahl wird verworfen
    expect(o.benchmarks.map((b) => b.key)).toEqual(['all', 'region=Asia']);
    expect(flowOptions(o).map((x) => x.label)).toEqual(['Your school', 'Region Asia', 'All schools']);
  });

  it('unveröffentlicht: keine eigene Option', () => {
    const o = mapEmploymentOverview({ ...rawEmploymentS040, published: false });
    expect(o.own).toBeNull();
    expect(flowOptions(o).map((x) => x.key)).toEqual(['region=Asia', 'all']);
  });

  it('Demo ALL: nur All schools + Regionen, keine eigene Zeile', () => {
    const o = mapEmploymentOverview({ ...rawEmploymentS040, demo: true, school: { school_id: 'ALL', region: 'All regions' } });
    expect(o.region).toBeNull();
    expect(flowOptions(o).map((x) => x.label)).toEqual(['All schools', 'Region Asia']);
  });
});

// Plausibilität gegen die echten SYNTHETISCHEN Pipeline-Dateien
const AGG = '../data/processed/aggregates/schools/';
const files = (() => {
  try {
    return readdirSync(AGG).filter((f) => /^(S\d{3}|ALL)\.json$/.test(f));
  } catch {
    return [];
  }
})();
describe.skipIf(files.length === 0)('synthetische Aggregate: career.employment.flow', () => {
  it.each(files)('%s: Äste summieren ~100, sichtbare Blätter <= Ast', (f) => {
    const o = mapEmploymentOverview(JSON.parse(readFileSync(AGG + f, 'utf8')));
    for (const flow of [o.own, ...o.benchmarks.map((b) => b.flow)]) {
      if (!flow) continue;
      const [e, n] = flow.branches;
      if (e.total !== null && n.total !== null) expect(Math.abs(e.total + n.total - 100)).toBeLessThanOrEqual(0.2);
      for (const b of flow.branches) {
        const visible = b.leaves.reduce((s, l) => s + (l.value ?? 0), 0);
        if (b.total !== null) expect(visible).toBeLessThanOrEqual(b.total + 0.3);
      }
    }
  });
});
