/**
 * Gepoolte Demo-Sicht "All participating schools (demo)" (schoolId "ALL"):
 * Admin zählt sie nicht mit, Kundensicht zeigt Banner, keine leeren Stammdaten,
 * keinen Perzentilrang und keinen Region-Umschalter.
 */
import { screen, within } from '@testing-library/react';
import { headerFacts } from '../../src/ui/school/SchoolLayout';
import { SCHOOLS } from './fakes';
import { renderApp } from './renderApp';

describe('Admin: Demo-Sicht ist getrennt', () => {
  it('zählt ALL nicht als Hochschule und listet sie unter "Demo views"', async () => {
    renderApp('/admin', 'admin-demo');
    await screen.findByText('Alpha Business School');
    // 4 echte Hochschulen in Liste und Kennzahl
    expect(screen.getByTestId('result-count')).toHaveTextContent('4 of 4');
    const table = screen.getByRole('table');
    expect(within(table).queryByText('All participating schools (demo)')).not.toBeInTheDocument();
    const kpis = screen.getByRole('region', { name: 'Key figures' });
    // "Total institutions" = 4 (ohne ALL); Respondents ohne die 1,000 der Demo-Sicht
    expect(within(kpis).getByText('Total institutions').parentElement).toHaveTextContent('4');
    expect(within(kpis).getByText('Total respondents (n)').parentElement).toHaveTextContent('1,000');
    // eigener Bereich mit DEMO-Badge
    const demo = screen.getByRole('region', { name: 'Demo views' });
    expect(within(demo).getByRole('link', { name: 'All participating schools (demo)' })).toBeInTheDocument();
    expect(within(demo).getByText('DEMO')).toBeInTheDocument();
  });
});

describe('Kundensicht ALL', () => {
  it('zeigt den Demo-Banner und blendet leere Stammdaten aus', async () => {
    renderApp('/school/overview', 'u-ALL');
    expect(await screen.findByRole('heading', { level: 1, name: 'All participating schools (demo)' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Demo view: all participating schools pooled.');
    // keine Akkreditierungs-Badges im Kopf der Demo-Sicht
    const header = screen.getByRole('banner', { name: 'Institution' });
    expect(within(header).queryByText('AACSB')).not.toBeInTheDocument();
    expect(header).not.toHaveTextContent(/,\s*·/); // keine leeren "Stadt, Land"-Reste
  });

  it('headerFacts lässt leere Felder weg', () => {
    const all = SCHOOLS.find((s) => s.schoolId === 'ALL')!;
    expect(headerFacts(all)).toEqual(['All regions', "Respondents (n): 1,000"]);
    const alpha = SCHOOLS.find((s) => s.schoolId === 'S001')!;
    expect(headerFacts(alpha)[0]).toBe('Zurich, Switzerland');
  });

  it('Diagramme: gepoolter Wert statt "Your school", kein Rang, kein Region-Umschalter', async () => {
    renderApp('/school/demographics', 'u-ALL');
    const chart = await screen.findByRole('region', { name: 'Median age compared' });
    expect(within(chart).getByText('Schools pooled')).toBeInTheDocument();
    expect(within(chart).queryByText('Percentile rank')).not.toBeInTheDocument();
    expect(within(chart).queryByRole('group', { name: 'Comparison group' })).not.toBeInTheDocument();
    expect(within(chart).getAllByText('All (pooled)').length).toBeGreaterThan(0);
    // Pyramide: Benchmark-Auswahl bleibt frei wählbar
    const pyramid = screen.getByRole('region', { name: 'Age pyramid' });
    expect(within(pyramid).getAllByRole('radio').length).toBeGreaterThan(1);
  });
});
