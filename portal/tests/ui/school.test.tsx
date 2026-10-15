import { screen, within } from '@testing-library/react';
import { renderApp } from './renderApp';
import { SCHOOL_SECTIONS } from '../../src/ui/school/sections';

describe('Hochschul-Sicht', () => {
  it('zeigt nur die eigene Hochschule und alle 8 Bereiche', async () => {
    renderApp('/school', 'u-S001');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha Business School' })).toBeInTheDocument();
    expect(screen.queryByText('Beta Institute of Management')).not.toBeInTheDocument();

    expect(SCHOOL_SECTIONS).toHaveLength(8);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    for (const s of SCHOOL_SECTIONS) {
      expect(within(nav).getByRole('link', { name: s.title })).toBeInTheDocument();
    }
    // Index leitet auf Überblick
    expect((await screen.findAllByText(/Analysis coming soon/)).length).toBeGreaterThan(0);
  });

  it('PDF-Report: Download-Button ist deaktiviert', async () => {
    renderApp('/school/pdf-report', 'u-S001');
    const btn = await screen.findByRole('button', { name: /Report will be available once fieldwork is complete/ });
    expect(btn).toBeDisabled();
  });

  it('Benchmark weist auf Mindestfallzahl hin', async () => {
    renderApp('/school/benchmark', 'u-S001');
    expect(await screen.findByText(/minimum case count/)).toBeInTheDocument();
  });

  it('Abmelden führt zum Login', async () => {
    renderApp('/school', 'u-S001');
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Local demo – no real sign-in/)).toBeInTheDocument();
  });
});
