/**
 * Demo-Schnellzugang: Direkt-Links /demo/... und Ansichts-Umschalter in der Seitenleiste.
 * Fakes (tests/ui/fakes.ts): admin-demo aktiv, u-S001 aktiv, u-S002 deaktiviert, u-S003 eingeladen.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { demoUidFor } from '../../src/ui/DemoEntry';
import { switchTarget } from '../../src/ui/DemoSwitcher';
import { renderApp } from './renderApp';

const DEMO = true;

describe('demoUidFor', () => {
  it('übersetzt Link-Teile in Demo-uids', () => {
    expect(demoUidFor(undefined)).toBe('u-S001');
    expect(demoUidFor('S022')).toBe('u-S022');
    expect(demoUidFor('s022')).toBe('u-S022');
    expect(demoUidFor('admin')).toBe('admin-demo');
    expect(demoUidFor('ALL')).toBe('u-ALL');
    expect(demoUidFor('all')).toBe('u-ALL');
    expect(demoUidFor('../x')).toBeNull();
    expect(demoUidFor('S1')).toBeNull();
  });
});

describe('switchTarget', () => {
  it('Hochschule -> Hochschule behält den Bereich, sonst Startseite', () => {
    expect(switchTarget('/school/demographics', 'school')).toBe('/school/demographics');
    expect(switchTarget('/admin', 'school')).toBe('/school');
    expect(switchTarget('/school/overview', 'admin')).toBe('/admin');
  });
});

describe('Demo-Direktlinks', () => {
  it('/demo meldet ohne Login die Standard-Hochschule an', async () => {
    renderApp('/demo', undefined, undefined, DEMO);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha Business School' })).toBeInTheDocument();
  });

  it('/demo/S001/demographics springt direkt in den Bereich', async () => {
    renderApp('/demo/S001/demographics', undefined, undefined, DEMO);
    expect(await screen.findByRole('region', { name: 'Age pyramid' })).toBeInTheDocument();
  });

  it('/demo/admin öffnet die Admin-Sicht und ersetzt eine bestehende Sitzung', async () => {
    renderApp('/demo/admin', 'u-S001', undefined, DEMO);
    expect(await screen.findByRole('heading', { name: 'Institutions' })).toBeInTheDocument();
  });

  it('deaktivierte / eingeladene Accounts bleiben gesperrt', async () => {
    renderApp('/demo/S002', undefined, undefined, DEMO);
    expect(await screen.findByRole('alert')).toHaveTextContent(/disabled/);
  });

  it('unbekannter Link -> Hinweis', async () => {
    renderApp('/demo/xyz', undefined, undefined, DEMO);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unknown demo link/);
  });

  it('ohne Demo-Modus (Firebase) gibt es keinen Direkteinstieg', async () => {
    renderApp('/demo/S001');
    expect(await screen.findByText(/Local demo – no real sign-in/)).toBeInTheDocument();
  });
});

describe('Ansichts-Umschalter', () => {
  it('bietet nur aktive Accounts an und wechselt ohne Login', async () => {
    renderApp('/school/overview', 'u-S001', undefined, DEMO);
    const select = await screen.findByLabelText('Switch view (demo)');
    const options = within(select).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(['admin-demo', 'u-S001', 'u-ALL']); // S002 deaktiviert, S003 eingeladen
    await userEvent.selectOptions(select, 'admin-demo');
    expect(await screen.findByRole('heading', { name: 'Institutions' })).toBeInTheDocument();
  });

  it('erscheint nicht ohne Demo-Modus', async () => {
    renderApp('/school/overview', 'u-S001');
    await screen.findByRole('heading', { level: 1, name: 'Alpha Business School' });
    expect(screen.queryByLabelText('Switch view (demo)')).not.toBeInTheDocument();
  });
});
