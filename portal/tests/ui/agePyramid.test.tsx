import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AGE_GROUPS_TOP_DOWN, mapAgeOverview, type AgeOverview } from '../../src/domain/age';
import { AgePyramid } from '../../src/ui/school/demographics/AgePyramid';
import { axisTicks, cellText, excludedGenderNote, niceMax, pyramidScale, SMALL_CELL_NOTE } from '../../src/ui/school/demographics/pyramidMath';
import { rawSchoolS001, rawSchoolUnpublished } from '../fixtures/age';

const overview = () => mapAgeOverview(rawSchoolS001);

/** Variante mit zweitem Benchmark, der eine eigene Pyramide hat. */
function withSecondBenchmark(): AgeOverview {
  const o = overview();
  const all = o.benchmarks.find((b) => b.key === 'all')!;
  const second = {
    ...all,
    key: 'region=Europe',
    label: 'Region Europe',
    n: 600,
    stats: { ...all.stats, median: 30 },
    pyramid: all.pyramid!.map((r) => ({ ...r, female: 10, male: 12 })),
  };
  return { ...o, benchmarks: [all, second, ...o.benchmarks.filter((b) => b.key !== 'all' && b.key !== 'region=Europe')] };
}

describe('AgePyramid', () => {
  it('rendert 12 Balken und 12 Benchmark-Marker', () => {
    const { container } = render(<AgePyramid overview={overview()} />);
    expect(container.querySelectorAll('rect[data-bar]')).toHaveLength(12);
    expect(container.querySelectorAll('line[data-marker]')).toHaveLength(12);
  });

  it('ordnet die Gruppen von oben nach unten', () => {
    const { container } = render(<AgePyramid overview={overview()} />);
    const order = [...container.querySelectorAll('rect[data-bar="female"]')].map((r) => r.getAttribute('data-group'));
    expect(order).toEqual([...AGE_GROUPS_TOP_DOWN]);
  });

  it('zeigt Titel, Kopfzeilen und Werte-Label 29.6', () => {
    render(<AgePyramid overview={overview()} />);
    expect(screen.getByRole('region', { name: 'Age pyramid' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Age structure by gender' })).toBeInTheDocument();
    expect(screen.getByText(/Your school: n = 28 · median 31\.5 years/)).toBeInTheDocument();
    expect(screen.getByText(/Benchmark All schools: n = 120 · median 34 years/)).toBeInTheDocument();
    expect(screen.getByText('29.6')).toBeInTheDocument();
    expect(screen.getAllByText('Women').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Men').length).toBeGreaterThan(0);
  });

  it('Tooltip und aria-label nennen den Benchmark-Wert', () => {
    const { container } = render(<AgePyramid overview={overview()} />);
    const bar = container.querySelector('rect[data-bar="female"][data-group="25-34"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Women 25-34: 29.6 % (Benchmark 21.2 %)');
    expect(bar.querySelector('title')!.textContent).toBe('Women 25-34: 29.6 % (Benchmark 21.2 %)');
  });

  it('deaktiviert Benchmarks ohne Pyramide', () => {
    render(<AgePyramid overview={overview()} />);
    const group = screen.getByRole('radiogroup');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getByRole('radio', { name: 'All schools' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Region Europe' })).toBeDisabled();
  });

  it('Wechsel des Benchmarks ändert Kopfzeile und Marker', () => {
    const { container } = render(<AgePyramid overview={withSecondBenchmark()} />);
    const marker = () => container.querySelector('line[data-marker="female"][data-group="25-34"]')!.getAttribute('x1');
    const before = marker();
    fireEvent.click(screen.getByRole('radio', { name: 'Region Europe' }));
    expect(screen.getByText(/Benchmark Region Europe: n = 600 · median 30 years/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Region Europe' })).toBeChecked();
    expect(marker()).not.toBe(before);
    const bar = container.querySelector('rect[data-bar="female"][data-group="25-34"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Women 25-34: 29.6 % (Benchmark 10.0 %)');
  });

  it('zeigt die Fussnote mit dem ausgeschlossenen Anteil', () => {
    render(<AgePyramid overview={overview()} />);
    expect(screen.getByText(/\(3\.6 %\) are not included in the pyramid/)).toBeInTheDocument();
  });

  it('unveröffentlicht: Hinweis statt Diagramm', () => {
    const { container } = render(<AgePyramid overview={mapAgeOverview(rawSchoolUnpublished)} />);
    expect(screen.getByText('Fewer than 10 responses – not shown.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('niceMax', () => {
  it('rundet auf das nächste Vielfache von 5 auf', () => {
    expect(niceMax([29.6, 33.3, 21.2])).toBe(35);
    expect(niceMax([0.3])).toBe(5);
    expect(niceMax([5.1])).toBe(10);
  });
  it('lässt exakte Vielfache unverändert', () => {
    expect(niceMax([40])).toBe(40);
    expect(niceMax([35.0000000001])).toBe(35);
  });
  it('liefert bei leeren/ungültigen Werten die Mindestskala 5', () => {
    expect(niceMax([])).toBe(5);
    expect(niceMax([0, 0])).toBe(5);
    expect(niceMax([NaN, Infinity, -3])).toBe(5);
  });
});

describe('axisTicks / pyramidScale', () => {
  it('Achsenmarken in 5er- bzw. 10er-Schritten', () => {
    expect(axisTicks(10)).toEqual([0, 5, 10]);
    expect(axisTicks(35)).toEqual([0, 10, 20, 30]);
  });
  it('skaliert linear und begrenzt auf [0, max]', () => {
    const s = pyramidScale(40, 200);
    expect(s(0)).toBe(0);
    expect(s(20)).toBe(100);
    expect(s(40)).toBe(200);
    expect(s(99)).toBe(200);
    expect(s(-5)).toBe(0);
    expect(s(NaN)).toBe(0);
  });
});

/** S040-ähnliche Pyramide mit ausgeblendeten Zellen (Kleinzellenschutz). */
function withHiddenCells(genderPatch: Partial<AgeOverview> = {}): AgeOverview {
  const o = overview();
  const hide = new Set(['< 25:female', '35-44:female', '35-44:male', '45-54:female', '45-54:male', '55-64:female']);
  return {
    ...o,
    pyramid: o.pyramid!.map((r) => ({
      ...r,
      female: hide.has(`${r.group}:female`) ? null : r.female,
      male: hide.has(`${r.group}:male`) ? null : r.male,
    })),
    ...genderPatch,
  };
}

describe('AgePyramid – Kleinzellenschutz', () => {
  it('zeichnet ausgeblendete Zellen als Platzhalter mit "< 3", nicht als 0', () => {
    const { container } = render(<AgePyramid overview={withHiddenCells()} />);
    const hidden = container.querySelectorAll('rect[data-hidden="true"]');
    expect(hidden).toHaveLength(6);
    for (const r of hidden) expect(Number(r.getAttribute('width'))).toBeGreaterThan(0);
    expect(screen.getAllByText('< 3')).toHaveLength(6);
    // Zelle mit echter 0 bleibt eine 0 (65+ Frauen)
    const zero = container.querySelector('rect[data-bar="female"][data-group="65+"]')!;
    expect(zero.getAttribute('data-hidden')).toBeNull();
    expect(zero.getAttribute('width')).toBe('0');
  });

  it('Tooltip erklärt den Schutz; Benchmark-Marker bleiben sichtbar', () => {
    const { container } = render(<AgePyramid overview={withHiddenCells()} />);
    const cell = container.querySelector('rect[data-bar="female"][data-group="35-44"]')!;
    expect(cell.getAttribute('aria-label')).toBe('Women 35-44: fewer than 3 people – hidden to protect anonymity (Benchmark 13.6 %)');
    expect(container.querySelectorAll('line[data-marker]')).toHaveLength(12);
  });

  it('zeigt die Fussnote zum Kleinzellenschutz nur bei ausgeblendeten Zellen', () => {
    const { unmount } = render(<AgePyramid overview={withHiddenCells()} />);
    expect(screen.getByText(SMALL_CELL_NOTE)).toBeInTheDocument();
    unmount();
    render(<AgePyramid overview={overview()} />);
    expect(screen.queryByText(SMALL_CELL_NOTE)).not.toBeInTheDocument();
  });

  it('Gender-Fussnote: "fewer than 3 people" statt Zahl', () => {
    render(<AgePyramid overview={withHiddenCells({ excludedGenderShare: null, excludedGenderSuppressed: true })} />);
    expect(screen.getByText(/non-binary or preferred not to say \(fewer than 3 people\)/)).toBeInTheDocument();
  });
});

describe('pyramidMath – null-Werte', () => {
  it('niceMax ignoriert null/undefined', () => {
    expect(niceMax([null, 12.4, undefined, null])).toBe(15);
    expect(niceMax([null, null])).toBe(5);
  });
  it('cellText', () => {
    expect(cellText('Men', '25-34', 27.6, 27.2)).toBe('Men 25-34: 27.6 % (Benchmark 27.2 %)');
    expect(cellText('Men', '25-34', null, undefined)).toBe('Men 25-34: fewer than 3 people – hidden to protect anonymity');
    expect(cellText('Men', '25-34', 5, null)).toBe('Men 25-34: 5.0 % (Benchmark hidden)');
  });
  it('excludedGenderNote', () => {
    expect(excludedGenderNote(null, false)).toBeNull();
    expect(excludedGenderNote(3.6, false)).toMatch(/\(3\.6 %\)/);
    expect(excludedGenderNote(3.6, true)).toMatch(/\(3\.6 % plus a group of fewer than 3 people\)/);
    expect(excludedGenderNote(null, true)).toMatch(/\(fewer than 3 people\)/);
    expect(excludedGenderNote(0, true)).toMatch(/\(fewer than 3 people\)/);
  });
});
