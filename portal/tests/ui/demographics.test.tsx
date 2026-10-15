/**
 * Bereich "Wer hat geantwortet?" (Frage 1): lädt nur die EIGENE Hochschule
 * (schoolId aus der Sitzung, nie aus der URL) und zeigt beide Diagramm-Karten.
 */
import { screen } from '@testing-library/react';
import { PortalError } from '../../src/domain/types';
import { renderApp } from './renderApp';

describe('Demografie-Bereich', () => {
  it('lädt Überblick + Wellen genau für die eigene Hochschule', async () => {
    const { fakes } = renderApp('/school/demographics', 'u-S001');
    expect(await screen.findByRole('region', { name: 'Age pyramid' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Median age compared' })).toBeInTheDocument();
    expect(fakes.ageCalls).toEqual(
      expect.arrayContaining([
        { kind: 'overview', schoolId: 'S001' },
        { kind: 'waves', schoolId: 'S001' },
      ]),
    );
    expect(fakes.ageCalls.every((c) => c.schoolId === 'S001')).toBe(true);
  });

  it('noch keine Aggregate -> freundlicher Hinweis statt Fehler', async () => {
    const { fakes } = renderApp('/school/demographics', 'u-S001', (f) => {
      f.data.getAgeOverview = async () => {
        throw new PortalError('not-found');
      };
    });
    expect(await screen.findByText('No results are available for this school yet.')).toBeInTheDocument();
    expect(fakes.ageCalls).toEqual(expect.not.arrayContaining([expect.objectContaining({ kind: 'overview' })]));
  });

  it('fehlen nur die Wellen, bleibt die Pyramide sichtbar', async () => {
    renderApp('/school/demographics', 'u-S001', (f) => {
      f.data.getAgeWaves = async () => {
        throw new PortalError('not-found');
      };
    });
    expect(await screen.findByRole('region', { name: 'Age pyramid' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Median age compared' })).not.toBeInTheDocument();
  });

  it('Navigation enthält den neuen Bereich', async () => {
    renderApp('/school/overview', 'u-S001');
    expect(await screen.findByRole('link', { name: 'Who responded?' })).toBeInTheDocument();
  });
});
