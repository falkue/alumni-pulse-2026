import { checkInsightNumbers, collectNumbers, mapChartInsight } from '../../src/domain/insights';

const inputs = { own: { n: 29, employed_total: 72.4, part_time: null, student: 0 }, benchmarks: { all: { n: 1499, employed_total: 92.6 } } };

describe('checkInsightNumbers', () => {
  it('akzeptiert Werte, Differenzen in pp und n aus den Eingaben', () => {
    expect(checkInsightNumbers('72.4 % employed vs 92.6 % overall, a gap of 20.2 pp (n = 29; n = 1,499). 0.0 % students.', inputs)).toEqual({ ok: true, unknown: [] });
  });
  it('meldet erfundene Zahlen', () => {
    const r = checkInsightNumbers('Part-time is 5.0 % and the gap is 19.0 pp, n = 30.', inputs);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['5.0 %', '19.0 pp', 'n = 30']);
  });
  it('ignoriert null (ausgeblendet) – sie dürfen nicht zitiert werden', () => {
    expect(collectNumbers(inputs)).not.toContain(null);
  });
  it('"fewer than 3 people" ist keine geprüfte Zahl', () => {
    expect(checkInsightNumbers('hidden (fewer than 3 people)', inputs).ok).toBe(true);
  });
});

describe('mapChartInsight', () => {
  it('snake_case -> camelCase, leere caveats -> null', () => {
    const i = mapChartInsight({ school_id: 'S1', chart_id: 'c', headline: 'h', how_to_read: 'r', key_findings: ['a', 1], benchmark: 'b', caveats: ' ', generated_by: { provider: 'Anthropic', model: 'claude-x', mode: 'm' }, generated_at: '2026-10-15T10:00:00Z' });
    expect(i).toMatchObject({ schoolId: 'S1', howToRead: 'r', keyFindings: ['a'], caveats: null, generatedBy: { model: 'claude-x' } });
  });
});
