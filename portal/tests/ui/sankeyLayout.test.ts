import { mapEmploymentFlow, type EmploymentFlow } from '../../src/domain/employment';
import { branchLeaves, buildSankey, HIDDEN_LABEL, ribbonPath, SANKEY, SANKEY_MOBILE } from '../../src/ui/school/career/sankeyLayout';
import { rawEmploymentS040 } from '../fixtures/age';

const s040 = () => mapEmploymentFlow(rawEmploymentS040.metrics['career.employment.flow'])!;
const all = () => mapEmploymentFlow(rawEmploymentS040.benchmarks.all.metrics['career.employment.flow'])!;

describe('branchLeaves (Prozent -> Sankey-Werte, Hidden-Rest)', () => {
  it('ohne ausgeblendete Blätter: nur Werte > 0, kein Rest', () => {
    const leaves = branchLeaves(all().branches[1]);
    expect(leaves.map((l) => l.label)).toEqual(['Seeking work', 'Not seeking work', 'Retired', 'Other situation']); // Student = 0 fällt weg
    expect(leaves.some((l) => l.label === HIDDEN_LABEL)).toBe(false);
  });

  it('mit ausgeblendeten Blättern: Rest = Ast-Total minus sichtbare Blätter', () => {
    const emp = branchLeaves(s040().branches[0]);
    expect(emp.map((l) => [l.label, l.value])).toEqual([['Full-time', 58.6], [HIDDEN_LABEL, 13.8]]);
    const not = branchLeaves(s040().branches[1]);
    expect(not.map((l) => [l.label, l.value])).toEqual([['Seeking work', 17.2], [HIDDEN_LABEL, 10.4]]);
  });

  it('Rest <= 0 erzeugt keinen Knoten', () => {
    const f: EmploymentFlow = mapEmploymentFlow({ employed: { total: 50, full_time: 50, part_time: null }, not_employed: { total: 50, seeking_work: 50 } })!;
    expect(branchLeaves(f.branches[0]).map((l) => l.label)).toEqual(['Full-time']);
  });
});

describe('buildSankey', () => {
  it('Knoten, Ströme und Liste ausgeblendeter Blätter', () => {
    const m = buildSankey(s040())!;
    expect(m.nodes.map((n) => n.id)).toEqual(['respondents', 'employed', 'not_employed', 'full_time', 'employed_hidden', 'seeking_work', 'not_employed_hidden']);
    expect(m.links).toHaveLength(6);
    expect(m.hiddenLeaves).toEqual(['Part-time', 'Self-employed', 'Other employment', 'Not seeking work', 'Other situation']);
  });

  it('Summen stimmen: Ast-Knoten = Summe seiner Ströme, Höhe proportional', () => {
    const m = buildSankey(s040())!;
    const emp = m.nodes.find((n) => n.id === 'employed')!;
    const out = m.links.filter((l) => l.source.id === 'employed');
    expect(out.reduce((s, l) => s + l.value, 0)).toBeCloseTo(emp.value, 5);
    const ky = (emp.y1 - emp.y0) / emp.value;
    for (const n of m.nodes) expect((n.y1 - n.y0) / n.value).toBeCloseTo(ky, 6);
  });

  it('bleibt innerhalb der viewBox (Desktop und Handy), Blätter überlappen nicht', () => {
    for (const size of [SANKEY, SANKEY_MOBILE]) {
      const m = buildSankey(all(), size)!;
      const leaves = m.nodes.filter((n) => n.depth === 2);
      for (const n of m.nodes) {
        expect(n.y0).toBeGreaterThanOrEqual(size.top - 1e-6);
        expect(n.y1).toBeLessThanOrEqual(size.H - size.top + 1e-6);
        expect(n.x1).toBeLessThanOrEqual(size.W - size.labelSpace + 1e-6);
      }
      for (let i = 1; i < leaves.length; i++) expect(leaves[i].y0).toBeGreaterThanOrEqual(leaves[i - 1].y1);
    }
  });

  it('Hover-Text: Prozent der Befragten und des Astes', () => {
    const m = buildSankey(s040())!;
    const l = m.links.find((x) => x.id === 'employed>full_time')!;
    expect(l.text).toBe('Employed → Full-time: 58.6 % of respondents · 80.9 % of employed');
    expect(m.links.find((x) => x.id === 'respondents>employed')!.text).toBe('Respondents → Employed: 72.4 % of respondents');
  });

  it('Ast mit 0 % (S002: niemand ohne Job) wird nicht gezeichnet', () => {
    const f = mapEmploymentFlow({ employed: { total: 100, full_time: 80, part_time: null, self_employed: 7.5, other_employment: null }, not_employed: { total: 0, seeking_work: 0 } })!;
    const m = buildSankey(f)!;
    expect(m.nodes.some((n) => n.id === 'not_employed')).toBe(false);
    expect(m.nodes.find((n) => n.id === 'employed_hidden')!.value).toBe(12.5);
  });

  it('beide Äste unbekannt und keine sichtbaren Blätter -> null', () => {
    expect(buildSankey(mapEmploymentFlow({ employed: {}, not_employed: {} })!)).toBeNull();
  });

  it('beide Ast-Totals ausgeblendet (S014-Fall): Untergrenzen + neutraler Rest-Ast auf 100 %', () => {
    const f = mapEmploymentFlow({
      employed: { total: null, full_time: 73.7, part_time: null, self_employed: null, other_employment: 0 },
      not_employed: { total: null, seeking_work: null, not_seeking_work: 0, student: 0, retired: 0, other_situation: 0 },
      n: 19,
    })!;
    const m = buildSankey(f)!;
    const emp = m.nodes.find((n) => n.id === 'employed')!;
    expect(emp).toMatchObject({ value: 73.7, lowerBound: true });
    expect(m.nodes.some((n) => n.id === 'not_employed')).toBe(false); // nichts sichtbar -> kein Ast
    const rest = m.nodes.find((n) => n.id === 'hidden_rest')!;
    expect(rest.value).toBe(26.3);
    expect(m.nodes.find((n) => n.id === 'respondents')!.value).toBeCloseTo(100, 5);
    // keine Blätter unter dem Rest-Ast, kein "% of employed" ohne bekanntes Total
    expect(m.links.filter((l) => l.source.id === 'hidden_rest')).toHaveLength(0);
    expect(m.links.find((l) => l.id === 'employed>full_time')!.text).toBe('Employed → Full-time: 73.7 % of respondents');
    expect(m.links.find((l) => l.id === 'respondents>employed')!.text).toMatch(/at least 73\.7 %/);
    // innerhalb der viewBox
    for (const n of m.nodes) expect(n.y1).toBeLessThanOrEqual(SANKEY.H);
  });

  it('ribbonPath ist ein geschlossenes Band mit oberer und unterer Bezier-Kante', () => {
    expect(ribbonPath(0, 10, 100, 50, 5)).toBe('M0,10C50,10 50,50 100,50L100,55C50,55 50,15 0,15Z');
  });

  it('Bänder setzen bündig am Knoten an (Start in der Quelle, Ende oben am Ziel)', () => {
    const m = buildSankey(s040())!;
    const l = m.links.find((x) => x.id === 'employed>full_time')!;
    const r = (v: number) => Math.round(v * 100) / 100;
    expect(l.path.startsWith(`M${r(l.source.x1)},${r(l.source.y0)}C`)).toBe(true);
    expect(l.path).toContain(`${r(l.target.x0)},${r(l.target.y0)}L`);
  });
});
