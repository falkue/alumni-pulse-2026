import { render, screen, within } from '@testing-library/react';
import { mapChartInsight } from '../../src/domain/insights';
import { AiInsightCard, keepTogether } from '../../src/ui/components/AiInsightCard';
import { PortalError } from '../../src/domain/types';
import { rawInsightS040 } from '../fixtures/age';
import { renderApp } from './renderApp';

describe('AiInsightCard', () => {
  it('ist deutlich als KI-generiert gekennzeichnet und zeigt alle Teile', () => {
    render(<AiInsightCard insight={mapChartInsight(rawInsightS040)} />);
    const card = screen.getByRole('region', { name: 'AI-generated interpretation' });
    expect(within(card).getByText(/AI-generated interpretation/)).toBeInTheDocument();
    expect(card).toHaveTextContent('Fewer graduates in work than in the region');
    expect(within(card).getAllByRole('listitem')).toHaveLength(2);
    expect(card).toHaveTextContent('How to read the chart');
    expect(card).toHaveTextContent('Benchmark');
    // Modell, Datum, Prototyp-/Fehler-Hinweis
    expect(card).toHaveTextContent('claude-sonnet-5-5, 15 Oct 2026');
    expect(card).toHaveTextContent('synthetic data');
    expect(card).toHaveTextContent('AI can make mistakes');
  });
});

describe('Career & salary: KI-Box vor dem Diagramm', () => {
  it('steht vor dem Sankey', async () => {
    renderApp('/school/career_salary', 'u-S001');
    const ai = await screen.findByRole('region', { name: 'AI-generated interpretation' });
    const chart = await screen.findByRole('region', { name: 'Employment status' });
    expect(ai.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('ohne Text (oder Ladefehler) bleibt nur das Diagramm', async () => {
    renderApp('/school/career_salary', 'u-S001', (f) => {
      f.data.getChartInsight = async () => {
        throw new PortalError('not-found');
      };
    });
    expect(await screen.findByRole('region', { name: 'Employment status' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI-generated interpretation' })).not.toBeInTheDocument();
  });
});

describe('keepTogether', () => {
  it('verhindert Umbrüche zwischen Zahl und Einheit', () => {
    expect(keepTogether('92.6 % and 1.9 pp (n = 29)')).toBe('92.6\u00A0% and 1.9\u00A0pp (n\u00A0=\u00A029)');
  });
});
