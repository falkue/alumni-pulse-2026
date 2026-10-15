import { fireEvent, render, screen, within } from '@testing-library/react';
import { mapEmploymentOverview } from '../../src/domain/employment';
import { EmploymentSankey } from '../../src/ui/school/career/EmploymentSankey';
import { rawEmploymentS040 } from '../fixtures/age';
import { renderApp } from './renderApp';

const overview = () => mapEmploymentOverview(rawEmploymentS040);

describe('EmploymentSankey', () => {
  it('Kopfzeile in Prozent, Segment-Control, ausgeblendete Blätter als Zeile', () => {
    const { container } = render(<EmploymentSankey overview={overview()} />);
    expect(screen.getByTestId('sankey-meta')).toHaveTextContent('n = 29 · 72.4 % employed');
    const seg = screen.getByRole('radiogroup', { name: 'Compare with' });
    expect(within(seg).getAllByRole('radio').map((b) => b.textContent)).toEqual(['Your school', 'Region Asia', 'All schools']);
    expect(screen.getByTestId('sankey-hidden')).toHaveTextContent(
      'Hidden to protect anonymity (< 3 people): Part-time, Self-employed, Other employment, Not seeking work, Other situation',
    );
    // ausgeblendete Blätter haben keinen eigenen Strom, nur den neutralen Rest
    expect(container.querySelector('[data-link="employed>part_time"]')).toBeNull();
    expect(container.querySelector('[data-link="employed>employed_hidden"]')).not.toBeNull();
    // je Ast ein neutraler Rest-Knoten (Employed und Not employed)
    expect(screen.getAllByText(/Hidden \(< 3 people each\)/, { selector: 'text' })).toHaveLength(2);
  });

  it('Wechsel auf "All schools" zeigt dessen Werte, keine Hidden-Zeile', () => {
    render(<EmploymentSankey overview={overview()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'All schools' }));
    expect(screen.getByTestId('sankey-meta')).toHaveTextContent('n = 1,499 · 92.6 % employed');
    expect(screen.queryByTestId('sankey-hidden')).not.toBeInTheDocument();
    expect(screen.getByText(/^Part-time\s+7\.9 %$/, { selector: 'text' })).toBeInTheDocument();
  });

  it('Hover zeigt Details in der Statuszeile', () => {
    const { container } = render(<EmploymentSankey overview={overview()} />);
    fireEvent.mouseEnter(container.querySelector('[data-link="employed>full_time"]')!);
    expect(screen.getByText('Employed → Full-time: 58.6 % of respondents · 80.9 % of employed', { selector: 'div' })).toBeInTheDocument();
  });
});

describe('Bereich Career & salary', () => {
  it('Hochschule sieht das Sankey ihrer eigenen Hochschule', async () => {
    renderApp('/school/career_salary', 'u-S001');
    expect(await screen.findByRole('region', { name: 'Employment status' })).toBeInTheDocument();
  });
  it('Demo ALL: nur All schools + Regionen', async () => {
    renderApp('/school/career_salary', 'u-ALL');
    const seg = await screen.findByRole('radiogroup', { name: 'Compare with' });
    expect(within(seg).getAllByRole('radio').map((b) => b.textContent)).toEqual(['All schools', 'Region Asia']);
  });
});
